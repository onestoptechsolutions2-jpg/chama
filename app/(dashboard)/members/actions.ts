"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { members, contributions, users, groupMemberships } from "@/lib/db/schema";
import {
  createMemberSchema,
  recordContributionSchema,
  createLoginSchema,
} from "@/lib/validation/members";
import { validateContributionAmount, CONTRIBUTION_BALANCE_FIELD } from "@/lib/domain/contributions";
import { hashPassword } from "@/lib/auth/password";

export type MemberActionState = { error: string } | null;

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
  const balanceField = CONTRIBUTION_BALANCE_FIELD[type];

  await withTenant(groupId, async (tx) => {
    await tx.insert(contributions).values({
      groupId,
      memberId,
      amount: String(amount),
      type,
      status: "paid",
      reference: reference || null,
      notes: notes || null,
      recordedBy: session.user.id,
    });

    await tx
      .update(members)
      .set({
        [balanceField]: sql`${members[balanceField]} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(and(eq(members.id, memberId), eq(members.groupId, groupId)));
  });

  revalidatePath("/members");
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
    });

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
