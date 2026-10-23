"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { db } from "@/lib/db/client";
import { groupInvites, groupMemberships, members, users } from "@/lib/db/schema";
import { createInviteSchema } from "@/lib/validation/invites";
import { inviteExpiry, inviteRoleError, ROLE_LABELS } from "@/lib/domain/invites";
import { findRosterRowFor } from "@/lib/domain/identity";
import { appUrl } from "@/lib/urls";
import { sendSms } from "@/lib/notify/sms";

export type InviteActionState =
  | { error: string }
  | { ok: true; name: string; link: string; phone: string | null; smsSent: boolean }
  | null;

/**
 * Invites a person into the group by phone (or email) with a role. Reuses
 * their roster row if staff already added them; never creates an account —
 * the person joins with their own (existing or new) login. Officials can be
 * invited before registration is complete; that's how a new group gets its
 * Treasurer and Secretary.
 */
export async function createInviteAction(_prev: InviteActionState, formData: FormData): Promise<InviteActionState> {
  const session = await requirePermission("members.add");
  const parsed = createInviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { name, phone, email, role, memberId } = parsed.data;
  const roleError = inviteRoleError(session.activeMembership, role);
  if (roleError) return { error: roleError };
  const groupId = session.activeMembership.groupId;

  // Already a member here? Then it's a role change, not an invite.
  const existingUser = phone
    ? await db.query.users.findFirst({ where: eq(users.phone, phone) })
    : email
      ? await db.query.users.findFirst({ where: eq(users.email, email) })
      : undefined;
  if (existingUser) {
    const membership = await db.query.groupMemberships.findFirst({
      where: and(eq(groupMemberships.userId, existingUser.id), eq(groupMemberships.groupId, groupId)),
    });
    if (membership?.status === "active") {
      return { error: `${existingUser.name} is already in this group. Change their role under More details.` };
    }
  }

  const token = randomBytes(24).toString("base64url");
  const result = await withTenant(groupId, async (tx): Promise<{ error: string } | { ok: true }> => {
    let rosterId: number | null = null;
    if (memberId) {
      const row = await tx.query.members.findFirst({ where: and(eq(members.id, memberId), eq(members.groupId, groupId)) });
      if (!row) return { error: "Member not found" };
      if (row.userId) return { error: `${row.name} already has a login in this group` };
      rosterId = row.id;
      if (phone && !row.phone) await tx.update(members).set({ phone }).where(eq(members.id, row.id));
    } else {
      const rows = await tx
        .select({ id: members.id, userId: members.userId, phone: members.phone, email: members.email, active: members.active })
        .from(members)
        .where(eq(members.groupId, groupId));
      const match = findRosterRowFor(rows, { userId: null, phone: phone ?? null, email: email ?? null });
      if (match) rosterId = match.id;
      else {
        const [created] = await tx
          .insert(members)
          .values({ groupId, name, phone: phone ?? null, email: email ?? null })
          .returning({ id: members.id });
        rosterId = created.id;
      }
    }

    // One live invite per person: replace any earlier one.
    await tx
      .update(groupInvites)
      .set({ status: "cancelled" })
      .where(and(eq(groupInvites.groupId, groupId), eq(groupInvites.memberId, rosterId), eq(groupInvites.status, "pending")));
    await tx.insert(groupInvites).values({
      groupId,
      name,
      phone: phone ?? null,
      email: email ?? null,
      role,
      memberId: rosterId,
      token,
      invitedBy: session.user.id,
      expiresAt: inviteExpiry(),
    });
    return { ok: true };
  });
  if ("error" in result) return result;

  const link = await appUrl(`/invite/${token}`);
  const smsSent = phone
    ? await sendSms(groupId, phone, `${session.user.name} invited you to join ${session.activeMembership.groupName} as ${ROLE_LABELS[role]}. Open: ${link}`)
    : false;

  revalidatePath("/dashboard/members");
  return { ok: true, name, link, phone: phone ?? null, smsSent };
}

export async function cancelInviteAction(inviteId: number): Promise<{ error: string } | null> {
  const session = await requirePermission("members.add");
  const groupId = session.activeMembership.groupId;
  await withTenant(groupId, (tx) =>
    tx
      .update(groupInvites)
      .set({ status: "cancelled" })
      .where(and(eq(groupInvites.id, inviteId), eq(groupInvites.groupId, groupId), eq(groupInvites.status, "pending"))),
  );
  revalidatePath("/dashboard/members");
  return null;
}
