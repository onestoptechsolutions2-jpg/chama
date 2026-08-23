"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { withTenant } from "@/lib/db/rls";
import { groups, groupMemberships } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { joinRequestSchema } from "@/lib/validation/groups";
import { insertNotification, listActiveStaffUserIds } from "@/lib/db/notifications";
import { buildMembershipNotification } from "@/lib/domain/notifications";

/**
 * notifications is FORCE RLS'd on app.current_group_id (see
 * lib/db/notifications.ts), but the rest of this action deliberately uses
 * the plain `db` client — group_memberships isn't RLS-protected and the
 * requester isn't a tenant member yet, so there's no group context to scope
 * the rest of the function to. This is the one write here that needs one.
 */
async function notifyStaffOfJoinRequest(groupId: number, requesterName: string, membershipId: number) {
  await withTenant(groupId, async (tx) => {
    const staffUserIds = await listActiveStaffUserIds(tx, groupId, ["admin", "treasurer"]);
    const template = buildMembershipNotification({ type: "join_request_submitted", requesterName });
    for (const userId of staffUserIds) {
      await insertNotification(tx, {
        groupId,
        userId,
        template,
        link: "/dashboard/pending-members",
        sourceType: "group_membership",
        sourceId: membershipId,
      });
    }
  });
}

export type JoinRequestState = { error: string } | { ok: true } | null;

export async function requestToJoinAction(
  _prev: JoinRequestState,
  formData: FormData,
): Promise<JoinRequestState> {
  const session = await requireSession();
  const parsed = joinRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { groupId, message } = parsed.data;

  const group = await db.query.groups.findFirst({
    where: and(
      eq(groups.id, groupId),
      eq(groups.isPublic, true),
      eq(groups.active, true),
      eq(groups.registrationComplete, true),
    ),
  });
  if (!group) {
    return { error: "This group isn't accepting join requests" };
  }

  const existing = await db.query.groupMemberships.findFirst({
    where: and(
      eq(groupMemberships.userId, session.user.id),
      eq(groupMemberships.groupId, groupId),
    ),
  });

  if (existing) {
    if (existing.status === "active") return { error: "You're already a member of this group" };
    if (existing.status === "pending") return { error: "You already have a pending request" };
    if (existing.status === "suspended") {
      return { error: "Your membership here is suspended — contact the group admin" };
    }
    // status === "rejected": allow re-requesting with a fresh message.
    await db
      .update(groupMemberships)
      .set({
        status: "pending",
        joinMessage: message || null,
        reviewedBy: null,
        reviewedAt: null,
      })
      .where(eq(groupMemberships.id, existing.id));
    await notifyStaffOfJoinRequest(groupId, session.user.name, existing.id);
    revalidatePath(`/discover/${groupId}`);
    return { ok: true };
  }

  if (group.maxMembers) {
    const [{ activeCount }] = await db
      .select({ activeCount: count() })
      .from(groupMemberships)
      .where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.status, "active")));
    if (activeCount >= group.maxMembers) {
      return { error: "This group is full" };
    }
  }

  const [created] = await db
    .insert(groupMemberships)
    .values({
      userId: session.user.id,
      groupId,
      role: "member",
      status: "pending",
      joinMessage: message || null,
    })
    .returning();
  await notifyStaffOfJoinRequest(groupId, session.user.name, created.id);

  revalidatePath(`/discover/${groupId}`);
  return { ok: true };
}
