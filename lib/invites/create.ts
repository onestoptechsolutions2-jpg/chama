import "server-only";
import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/lib/db/rls";
import { db } from "@/lib/db/client";
import { groupInvites, groupMemberships, members, users } from "@/lib/db/schema";
import { isPlatformStaff } from "@/lib/auth/permissions";
import { inviteExpiry, ROLE_LABELS } from "@/lib/domain/invites";
import { findRosterRowFor } from "@/lib/domain/identity";
import { appUrl } from "@/lib/urls";
import { sendSms } from "@/lib/notify/sms";

type Role = keyof typeof ROLE_LABELS;

/**
 * Invites a person into a group by phone (or email) with a role — the one
 * way anyone is invited (Members page, partner API). Reuses their roster row
 * if there is one; never creates an account: the person joins with their own
 * (existing or new) login.
 */
export async function createGroupInvite(input: {
  groupId: number;
  groupName: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: Role;
  memberId?: number | null;
  invitedBy: number | null;
  inviterName: string;
}): Promise<{ error: string } | { ok: true; link: string; smsSent: boolean; alreadyMember?: boolean }> {
  const { groupId, name, phone, email, role, memberId } = input;

  const existingUser = phone
    ? await db.query.users.findFirst({ where: eq(users.phone, phone) })
    : email
      ? await db.query.users.findFirst({ where: eq(users.email, email) })
      : undefined;
  if (existingUser && isPlatformStaff(existingUser.platformRole)) {
    return { error: "That phone belongs to a platform staff account, which can't join groups." };
  }
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
      invitedBy: input.invitedBy,
      expiresAt: inviteExpiry(),
    });
    return { ok: true };
  });
  if ("error" in result) return result;

  const link = await appUrl(`/invite/${token}`);
  const smsSent = phone
    ? await sendSms(groupId, phone, `${input.inviterName} invited you to join ${input.groupName} as ${ROLE_LABELS[role]}. Open: ${link}`)
    : false;
  return { ok: true, link, smsSent };
}
