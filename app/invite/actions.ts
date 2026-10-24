"use server";

import { isPlatformStaff, PLATFORM_STAFF_NO_GROUPS } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { withPlatformAdmin, withTenant } from "@/lib/db/rls";
import { groupInvites, groupMemberships, members, sessions, users } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { inviteAcceptError, roleAfterInvite, ROLE_LABELS } from "@/lib/domain/invites";
import { linkOrCreateMemberRow } from "@/lib/identity/people";
import { refreshRegistrationStatus } from "@/lib/db/registration";
import { insertNotification } from "@/lib/db/notifications";
import { buildMembershipNotification } from "@/lib/domain/notifications";

/**
 * Accepts an invite for the signed-in person: makes (or upgrades) their
 * membership with the invited role, links their roster row, and opens the
 * group. The token is the secret; inviteAcceptError stops a forwarded link
 * being used by an account with a different phone.
 */
export async function acceptInviteAction(token: string): Promise<{ error: string }> {
  const session = await requireSession();
  const invite = await withPlatformAdmin((tx) => tx.query.groupInvites.findFirst({ where: eq(groupInvites.token, token) }));
  if (!invite) return { error: "This invite link is not valid." };

  const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id) });
  if (!user) return { error: "Sign in again." };
  if (isPlatformStaff(user.platformRole)) return { error: PLATFORM_STAFF_NO_GROUPS };
  const blocked = inviteAcceptError(invite, user);
  if (blocked) return { error: blocked };

  // An account with no phone yet adopts the invite's phone, if it's free.
  let phone = user.phone;
  if (!phone && invite.phone) {
    const owner = await db.query.users.findFirst({ where: eq(users.phone, invite.phone) });
    if (!owner) {
      await db.update(users).set({ phone: invite.phone, updatedAt: new Date() }).where(eq(users.id, user.id));
      phone = invite.phone;
    }
  }

  await withTenant(invite.groupId, async (tx) => {
    const current = await tx.query.groupMemberships.findFirst({
      where: and(eq(groupMemberships.userId, user.id), eq(groupMemberships.groupId, invite.groupId)),
    });
    const role = roleAfterInvite(current?.status === "active" ? current.role : null, invite.role);
    await tx
      .insert(groupMemberships)
      .values({ userId: user.id, groupId: invite.groupId, role, status: "active", rulesAcceptedAt: new Date(), reviewedBy: invite.invitedBy, reviewedAt: new Date() })
      .onConflictDoUpdate({
        target: [groupMemberships.userId, groupMemberships.groupId],
        set: { role, status: "active", rulesAcceptedAt: new Date(), roleAssignedAt: new Date(), updatedAt: new Date() },
      });

    // Prefer the exact roster row the invite was made for.
    const row = invite.memberId
      ? await tx.query.members.findFirst({ where: and(eq(members.id, invite.memberId), eq(members.groupId, invite.groupId)) })
      : undefined;
    if (row && (row.userId === null || row.userId === user.id)) {
      await tx.update(members).set({ userId: user.id, active: true, updatedAt: new Date() }).where(eq(members.id, row.id));
    } else {
      await linkOrCreateMemberRow(tx, invite.groupId, { id: user.id, name: user.name, phone, email: user.email });
    }

    await refreshRegistrationStatus(tx, invite.groupId);
    await tx
      .update(groupInvites)
      .set({ status: "accepted", acceptedBy: user.id, acceptedAt: new Date() })
      .where(eq(groupInvites.id, invite.id));
    if (invite.invitedBy) {
      await insertNotification(tx, {
        groupId: invite.groupId,
        userId: invite.invitedBy,
        template: buildMembershipNotification({ type: "invite_accepted", name: user.name, role: ROLE_LABELS[role] }),
        link: "/dashboard/members",
        sourceType: "group_invite",
        sourceId: invite.id,
      });
    }
  });

  await db.update(sessions).set({ activeGroupId: invite.groupId }).where(eq(sessions.id, session.sessionId));
  redirect("/dashboard");
}
