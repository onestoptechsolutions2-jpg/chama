"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { withTenant, withUser } from "@/lib/db/rls";
import { members, contributions, users, groupMemberships, groups, sessions, loans, mgrMemberTurns } from "@/lib/db/schema";
import {
  createMemberSchema,
  recordContributionSchema,
} from "@/lib/validation/members";
import { validateContributionAmount, CONTRIBUTION_BALANCE_FIELD } from "@/lib/domain/contributions";
import { refreshRegistrationStatus } from "@/lib/db/registration";
import type { MembershipRole } from "@/lib/domain/officials";
import { hashPassword } from "@/lib/auth/password";
import { normalizeEmail, normalizePhone } from "@/lib/domain/identity";
import { releaseMemberFromRotation } from "@/app/(dashboard)/dashboard/mgr/rotation-data";
import { computeContributionAllocation, splitAcrossReserves } from "@/lib/domain/welfare-policy";
import { getOrCreateWelfarePolicy, allocateContributionToWelfareFund } from "@/app/(dashboard)/dashboard/welfare/welfare-data";

/** `message` carries a success summary (e.g. what a CSV import did). */
export type MemberActionState = { error?: string; message?: string } | null;

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
  const session = await requirePermission("members.add");
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

  type Row = { name: string; phone: string | null; email: string | null; capital: string; security: string; personalSavings: string; welfareBalance: string };
  let rows: Row[];
  try {
    rows = lines.slice(1).map((line, index) => {
      const values = parseCsvLine(line);
      const get = (header: string) => values[headers.indexOf(header)] ?? "";
      const amounts = ["capital", "security", "personal_savings", "welfare_balance"].map((header) => Number(get(header) || 0));
      if (!get("name") || amounts.some((amount) => !Number.isFinite(amount) || amount < 0)) {
        throw new Error(`Invalid member or balance on CSV row ${index + 2}`);
      }
      const phone = get("phone") ? normalizePhone(get("phone")) : null;
      if (get("phone") && !phone) throw new Error(`Row ${index + 2}: "${get("phone")}" is not a Kenyan mobile number`);
      return { name: get("name"), phone, email: normalizeEmail(get("email")), capital: String(amounts[0]), security: String(amounts[1]), personalSavings: String(amounts[2]), welfareBalance: String(amounts[3]) };
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid CSV row" };
  }

  // One row per person: skip anyone already on the roster (same phone or
  // email) or repeated within the file, so re-uploading a CSV is safe.
  const groupId = session.activeMembership.groupId;
  let skipped: string[];
  let added: number;
  try {
    ({ skipped, added } = await withTenant(groupId, async (tx) => {
      const existing = await tx
        .select({ phone: members.phone, email: members.email })
        .from(members)
        .where(eq(members.groupId, groupId));
      const seen = new Set(existing.flatMap((m) => [normalizePhone(m.phone), normalizeEmail(m.email)]).filter(Boolean));
      const fresh: Row[] = [];
      const skipped: string[] = [];
      for (const row of rows) {
        const keys = [row.phone, row.email].filter(Boolean) as string[];
        if (keys.some((k) => seen.has(k))) {
          skipped.push(row.name);
          continue;
        }
        keys.forEach((k) => seen.add(k));
        fresh.push(row);
      }
      if (fresh.length) await tx.insert(members).values(fresh.map((row) => ({ ...row, groupId })));
      return { skipped, added: fresh.length };
    }));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to import members" };
  }
  revalidatePath("/dashboard/members");
  return {
    message: `${added} added${skipped.length ? `, ${skipped.length} already on the list (skipped: ${skipped.slice(0, 5).join(", ")}${skipped.length > 5 ? "…" : ""})` : ""}.`,
  };
}


export async function createMemberAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const session = await requirePermission("members.add");

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

  const duplicate = await withTenant(groupId, async (tx) => {
    if (phone || email) {
      const clash = await tx.query.members.findFirst({
        where: and(
          eq(members.groupId, groupId),
          or(...(phone ? [eq(members.phone, phone)] : []), ...(email ? [sql`lower(${members.email}) = ${email}`] : [])),
        ),
      });
      if (clash) return clash.name;
    }
    await tx.insert(members).values({
      groupId,
      name,
      phone: phone ?? null,
      email: email ?? null,
      idNumber: idNumber || null,
      capital: String(capital),
      security: String(security),
    });
    return null;
  });
  if (duplicate) return { error: `${duplicate} already has that phone or email on this group's list.` };

  revalidatePath("/dashboard/members");
  return null;
}

export async function recordContributionAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const session = await requirePermission("money.record");

  // Same Object.fromEntries reasoning as createMemberAction above — the
  // RecordContributionDialog form has no "notes" input, so formData.get()
  // would return null there and fail z.optional().
  const parsed = recordContributionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { memberId, type, amount, reference, notes } = parsed.data;
  const groupId = session.activeMembership.groupId;

  const result = await withTenant(groupId, async (tx): Promise<{ error: string } | { ok: true }> => {
    const group = await tx.query.groups.findFirst({ where: eq(groups.id, groupId) });
    if (!group) return { error: "Group not found" };

    const amountError = validateContributionAmount(type, amount, Number(group.minPersonalSavingsIncrement));
    if (amountError) return { error: amountError };

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
      return { ok: true };
    }

    const balanceField = CONTRIBUTION_BALANCE_FIELD[type];
    await tx
      .update(members)
      .set({
        [balanceField]: sql`${members[balanceField]} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(and(eq(members.id, memberId), eq(members.groupId, groupId)));
    return { ok: true };
  });

  if ("error" in result) return { error: result.error };

  revalidatePath("/dashboard/members");
  revalidatePath("/dashboard/welfare");
  return null;
}

/**
 * "Forgot password" for a member, done by their group admin: sets a new
 * password the admin then tells the member in person. Deliberately narrow so
 * a group admin can never take over an account that has power elsewhere:
 * the member must belong to this group only, hold no platform role, and not
 * be an admin themselves. Signs them out everywhere and clears any lockout.
 */
export async function resetMemberPasswordAction(
  memberId: number,
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const session = await requirePermission("members.manage");
  const groupId = session.activeMembership.groupId;

  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "Password must be at least 8 characters" };

  const member = await withTenant(groupId, (tx) =>
    tx.query.members.findFirst({
      where: and(eq(members.id, memberId), eq(members.groupId, groupId)),
    }),
  );
  if (!member?.userId) return { error: "This member has no login to reset" };
  const userId = member.userId;
  if (userId === session.user.id) return { error: "Use your profile to change your own password" };

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user || user.platformRole) return { error: "This account cannot be reset here" };

  const memberships = await withUser(userId, (tx) =>
    tx.query.groupMemberships.findMany({ where: eq(groupMemberships.userId, userId) }),
  );
  const inOtherGroups = memberships.some((m) => m.groupId !== groupId);
  const isAdminHere = memberships.some((m) => m.groupId === groupId && m.role === "admin");
  if (inOtherGroups) {
    return { error: "This person is in other groups too. They must reset their own password." };
  }
  if (isAdminHere) return { error: "Admins cannot be reset by another admin" };

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(password),
      failedLogins: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
  await db.delete(sessions).where(eq(sessions.userId, userId));

  revalidatePath("/dashboard/members");
  return null;
}

/**
 * Takes a member out of the group. Their history stays; they can no longer
 * sign in to this group, drop out of the Mzunguko queue, and any turn they
 * hadn't been paid for is freed up. Refused while they still owe a loan, and
 * for admins (demote first) or yourself, so a group can't lock itself out.
 */
export async function deactivateMemberAction(memberId: number): Promise<MemberActionState> {
  const session = await requirePermission("members.manage");
  const groupId = session.activeMembership.groupId;

  const result = await withTenant(groupId, async (tx): Promise<MemberActionState> => {
    const member = await tx.query.members.findFirst({
      where: and(eq(members.id, memberId), eq(members.groupId, groupId), eq(members.active, true)),
    });
    if (!member) return { error: "Member not found" };

    if (member.userId) {
      if (member.userId === session.user.id) return { error: "You cannot remove yourself" };
      const membership = await tx.query.groupMemberships.findFirst({
        where: and(
          eq(groupMemberships.groupId, groupId),
          eq(groupMemberships.userId, member.userId),
          eq(groupMemberships.status, "active"),
        ),
      });
      if (membership?.role === "admin") {
        return { error: "Change this person's role from Admin first, then remove them." };
      }
    }

    const owing = await tx.query.loans.findFirst({
      where: and(
        eq(loans.memberId, memberId),
        eq(loans.groupId, groupId),
        inArray(loans.status, ["active", "extended", "overdue"]),
      ),
    });
    if (owing) return { error: "This member still has a loan to repay. Clear it first." };

    await tx
      .update(members)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(members.id, memberId));
    if (member.userId) {
      await tx
        .update(groupMemberships)
        .set({ status: "suspended" })
        .where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.userId, member.userId)));
      await refreshRegistrationStatus(tx, groupId);
    }
    await releaseMemberFromRotation(tx, groupId, memberId, {
      userId: session.user.id,
      role: session.activeMembership.role,
    });
    return null;
  });

  revalidatePath("/dashboard/members");
  return result;
}

/**
 * Undoes "Remove from group": the member is active again, their login works
 * again, and they rejoin the Mzunguko queue. Turns that were handed back to
 * the group when they left stay open — the admin re-assigns one if wanted.
 */
export async function reinstateMemberAction(memberId: number): Promise<MemberActionState> {
  const session = await requirePermission("members.manage");
  const groupId = session.activeMembership.groupId;

  const result = await withTenant(groupId, async (tx): Promise<MemberActionState> => {
    const member = await tx.query.members.findFirst({
      where: and(eq(members.id, memberId), eq(members.groupId, groupId), eq(members.active, false)),
    });
    if (!member) return { error: "Member not found" };

    await tx
      .update(members)
      .set({ active: true, updatedAt: new Date() })
      .where(eq(members.id, memberId));
    await tx
      .update(mgrMemberTurns)
      .set({ active: true })
      .where(and(eq(mgrMemberTurns.groupId, groupId), eq(mgrMemberTurns.memberId, memberId)));
    if (member.userId) {
      await tx
        .update(groupMemberships)
        .set({ status: "active" })
        .where(
          and(
            eq(groupMemberships.groupId, groupId),
            eq(groupMemberships.userId, member.userId),
            eq(groupMemberships.status, "suspended"),
          ),
        );
      await refreshRegistrationStatus(tx, groupId);
    }
    return null;
  });

  revalidatePath("/dashboard/members");
  return result;
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
  const session = await requirePermission("members.manage");
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
  revalidatePath("/dashboard/members");
  revalidatePath("/");
  return null;
}
