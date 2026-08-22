"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { withTenant, type Tx } from "@/lib/db/rls";
import { members, contributions, users, groupMemberships, groups } from "@/lib/db/schema";
import {
  createMemberSchema,
  recordContributionSchema,
  createLoginSchema,
} from "@/lib/validation/members";
import { validateContributionAmount, CONTRIBUTION_BALANCE_FIELD } from "@/lib/domain/contributions";
import { computeRegistrationComplete, type MembershipRole } from "@/lib/domain/officials";
import { hashPassword } from "@/lib/auth/password";
import { computeContributionAllocation, splitAcrossReserves } from "@/lib/domain/welfare-policy";
import { getOrCreateWelfarePolicy, allocateContributionToWelfareFund } from "@/app/(dashboard)/welfare/welfare-data";

export type MemberActionState = { error: string } | null;

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"' && quoted) {
      value += '"';
      index++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += char;
    }
  }
  values.push(value.trim());
  return values;
}

export async function importMembersAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const session = await requireRole("admin", "treasurer");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file" };
  if (file.size > 2_000_000) return { error: "CSV file must be smaller than 2 MB" };

  const lines = (await file.text()).split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return { error: "CSV must include a header and at least one member" };
  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
  const requiredHeaders = ["name", "phone", "email", "capital", "security", "personal_savings", "welfare_balance"];
  const missing = requiredHeaders.filter((header) => !headers.includes(header));
  if (missing.length) return { error: `Missing columns: ${missing.join(", ")}` };
  if (lines.length > 501) return { error: "CSV cannot contain more than 500 members" };

  let rows: { name: string; phone: string | null; email: string | null; capital: string; security: string; personalSavings: string; welfareBalance: string }[];
  try {
    rows = lines.slice(1).map((line, index) => {
      const values = parseCsvLine(line);
      const get = (header: string) => values[headers.indexOf(header)] ?? "";
      const amounts = ["capital", "security", "personal_savings", "welfare_balance"].map((header) => Number(get(header) || 0));
      if (!get("name") || amounts.some((amount) => !Number.isFinite(amount) || amount < 0)) {
        throw new Error(`Invalid member or balance on CSV row ${index + 2}`);
      }
      return { name: get("name"), phone: get("phone") || null, email: get("email") || null, capital: String(amounts[0]), security: String(amounts[1]), personalSavings: String(amounts[2]), welfareBalance: String(amounts[3]) };
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid CSV row" };
  }

  try {
    await withTenant(session.activeMembership.groupId, (tx) => tx.insert(members).values(rows.map((row) => ({ ...row, groupId: session.activeMembership.groupId }))));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to import members" };
  }
  revalidatePath("/members");
  return null;
}

/**
 * Recomputes groups.registrationComplete from the group's actual current
 * active roles — called after every role change rather than trusted to
 * stay in sync, so it can't go stale if e.g. a treasurer is later demoted.
 * Shared by updateMemberRoleAction and anything else that changes a
 * membership's role or status (join approval, login creation for a member).
 */
async function refreshRegistrationStatus(tx: Tx, groupId: number): Promise<void> {
  const active = await tx
    .select({ role: groupMemberships.role })
    .from(groupMemberships)
    .where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.status, "active")));

  const complete = computeRegistrationComplete(active.map((r) => r.role as MembershipRole));

  await tx.update(groups).set({ registrationComplete: complete }).where(eq(groups.id, groupId));
}

export async function createMemberAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const session = await requireRole("admin", "treasurer");

  // Object.fromEntries (not formData.get(...) per field) so fields with no
  // matching <input> in the form are simply absent from the object — and
  // therefore `undefined`, which z.optional() accepts. formData.get() on a
  // missing key returns `null`, which z.optional() does NOT accept, so
  // building the object field-by-field with .get() silently fails
  // validation for any optional field the form doesn't render (like this
  // one: AddMemberForm has no email/idNumber inputs).
  const parsed = createMemberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { name, phone, email, idNumber, capital, security } = parsed.data;
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, (tx) =>
    tx.insert(members).values({
      groupId,
      name,
      phone: phone || null,
      email: email || null,
      idNumber: idNumber || null,
      capital: String(capital),
      security: String(security),
    }),
  );

  revalidatePath("/members");
  return null;
}

export async function recordContributionAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const session = await requireRole("admin", "treasurer");

  // Same Object.fromEntries reasoning as createMemberAction above — the
  // RecordContributionDialog form has no "notes" input, so formData.get()
  // would return null there and fail z.optional().
  const parsed = recordContributionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { memberId, type, amount, reference, notes } = parsed.data;

  const amountError = validateContributionAmount(type, amount);
  if (amountError) return { error: amountError };

  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, async (tx) => {
    const [contribution] = await tx
      .insert(contributions)
      .values({
        groupId,
        memberId,
        amount: String(amount),
        type,
        status: "paid",
        reference: reference || null,
        notes: notes || null,
        recordedBy: session.user.id,
      })
      .returning();

    // welfare has no members.* balance column (Phase 8) — it feeds the
    // collective fund instead. See CONTRIBUTION_BALANCE_FIELD's comment.
    if (type === "welfare") {
      const policy = await getOrCreateWelfarePolicy(tx, groupId);
      const routed = computeContributionAllocation({
        method: policy.fundingMethod,
        contributionAmount: amount,
        fixedAmount: policy.fundingFixedAmount ? Number(policy.fundingFixedAmount) : null,
        pct: policy.fundingPct ? Number(policy.fundingPct) : null,
      });
      if (routed > 0) {
        const split = splitAcrossReserves(routed, {
          emergencyPct: Number(policy.emergencyAllocationPct),
          longTermPct: Number(policy.longTermAllocationPct),
          advancePct: Number(policy.advanceAllocationPct),
        });
        await allocateContributionToWelfareFund(tx, groupId, contribution.id, routed, split);
      }
      return;
    }

    const balanceField = CONTRIBUTION_BALANCE_FIELD[type];
    await tx
      .update(members)
      .set({
        [balanceField]: sql`${members[balanceField]} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(and(eq(members.id, memberId), eq(members.groupId, groupId)));
  });

  revalidatePath("/members");
  revalidatePath("/welfare");
  return null;
}

/**
 * Creates a login for an existing member row (email/phone + password),
 * linking members.userId and creating the group_membership that makes it
 * possible to actually sign in and use member self-service features (loan
 * applications, statement, etc.) — the original app's members.js supported
 * this via a create_user option at member-creation time; this rewrite
 * exposes it as a separate action on an existing member instead.
 */
export async function createLoginForMemberAction(
  memberId: number,
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const session = await requireRole("admin");
  const parsed = createLoginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { email, phone, password } = parsed.data;
  const groupId = session.activeMembership.groupId;

  const result = await withTenant(groupId, async (tx): Promise<{ error: string } | { ok: true }> => {
    const member = await tx.query.members.findFirst({
      where: and(eq(members.id, memberId), eq(members.groupId, groupId)),
    });
    if (!member) return { error: "Member not found" };
    if (member.userId) return { error: "This member already has a login" };

    if (email) {
      const existing = await tx.query.users.findFirst({ where: eq(users.email, email) });
      if (existing) return { error: "An account with that email already exists" };
    }

    const passwordHash = await hashPassword(password);
    const [user] = await tx
      .insert(users)
      .values({
        name: member.name,
        email: email || null,
        phone: phone || null,
        passwordHash,
      })
      .returning();

    await tx.update(members).set({ userId: user.id }).where(eq(members.id, memberId));

    await tx.insert(groupMemberships).values({
      userId: user.id,
      groupId,
      role: "member",
      status: "active",
      // Automatic, same reasoning as approveMembershipAction — this
      // membership goes straight to active without a separate approval
      // step (staff are creating it directly), but rule acceptance still
      // applies the moment it exists.
      rulesAcceptedAt: new Date(),
    });
    await refreshRegistrationStatus(tx, groupId);

    return { ok: true };
  });

  if ("error" in result) return { error: result.error };
  revalidatePath("/members");
  return null;
}

export async function deactivateMemberAction(memberId: number): Promise<void> {
  const session = await requireRole("admin");
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, (tx) =>
    tx
      .update(members)
      .set({ active: false, updatedAt: new Date() })
      .where(and(eq(members.id, memberId), eq(members.groupId, groupId))),
  );

  revalidatePath("/members");
}

const ASSIGNABLE_ROLES: MembershipRole[] = ["admin", "treasurer", "secretary", "member"];

/**
 * Governance change — deliberately admin-only, stricter than the
 * admin+treasurer gate used for day-to-day member operations elsewhere in
 * this file. Recomputes groups.registrationComplete afterward (see
 * refreshRegistrationStatus above) since this is the only place a role can
 * actually change post-creation.
 */
export async function updateMemberRoleAction(
  membershipId: number,
  role: string,
): Promise<{ error: string } | null> {
  const session = await requireRole("admin");
  const groupId = session.activeMembership.groupId;

  if (!ASSIGNABLE_ROLES.includes(role as MembershipRole)) {
    return { error: "Invalid role" };
  }
  const newRole = role as MembershipRole;

  const result = await withTenant(groupId, async (tx): Promise<{ error: string } | { ok: true }> => {
    const membership = await tx.query.groupMemberships.findFirst({
      where: and(
        eq(groupMemberships.id, membershipId),
        eq(groupMemberships.groupId, groupId),
        eq(groupMemberships.status, "active"),
      ),
    });
    if (!membership) return { error: "Membership not found" };

    if (membership.role === "admin" && newRole !== "admin") {
      const [{ otherAdmins }] = await tx
        .select({ otherAdmins: sql<number>`count(*)::int` })
        .from(groupMemberships)
        .where(
          and(
            eq(groupMemberships.groupId, groupId),
            eq(groupMemberships.status, "active"),
            eq(groupMemberships.role, "admin"),
            ne(groupMemberships.id, membershipId),
          ),
        );
      if (otherAdmins === 0) {
        return { error: "The group must always have at least one admin" };
      }
    }

    await tx
      .update(groupMemberships)
      .set({ role: newRole, roleAssignedAt: new Date(), updatedAt: new Date() })
      .where(eq(groupMemberships.id, membershipId));

    await refreshRegistrationStatus(tx, groupId);

    return { ok: true };
  });

  if ("error" in result) return { error: result.error };
  revalidatePath("/members");
  revalidatePath("/");
  return null;
}
