import { and, eq, inArray } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import { notifications, groupMemberships } from "@/lib/db/schema";
import type { NotificationTemplate } from "@/lib/domain/notifications";
import type { MembershipRole } from "@/lib/auth/session";

/**
 * The one place any feature turns a built NotificationTemplate into an
 * actual row — every domain (welfare, membership, loans, ...) keeps its own
 * event union and builder in lib/domain/notifications.ts, but funnels
 * through here so the insert shape (and its RLS/tenant scoping) stays in
 * one place. Always called inside the caller's own withTenant/
 * withPlatformAdmin transaction — notifications is FORCE RLS'd on
 * app.current_group_id (see drizzle/0035_phase8_welfare_policy_ledger_rls.sql),
 * so an unwrapped insert would be denied outright, not silently scoped wrong.
 */
export async function insertNotification(
  tx: Tx,
  input: {
    groupId: number;
    userId: number;
    template: NotificationTemplate;
    link: string;
    sourceType: string;
    sourceId: number;
  },
): Promise<void> {
  await tx.insert(notifications).values({
    groupId: input.groupId,
    userId: input.userId,
    category: input.template.category,
    title: input.template.title,
    body: input.template.body,
    link: input.link,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
  });
}

/**
 * Active members holding any of `roles` in a group, as plain userIds — for
 * fanning a notification out to "whoever can act on this" (e.g. every
 * admin/treasurer when a join request or loan application comes in).
 * group_memberships already carries userId directly (it's the user<->group
 * join table), so this doesn't need the members join welfare's
 * listOfficeHolders uses for its own, member-row-specific purposes.
 */
export async function listActiveStaffUserIds(
  tx: Tx,
  groupId: number,
  roles: MembershipRole[],
): Promise<number[]> {
  if (roles.length === 0) return [];
  const rows = await tx.query.groupMemberships.findMany({
    where: and(
      eq(groupMemberships.groupId, groupId),
      eq(groupMemberships.status, "active"),
      inArray(groupMemberships.role, roles),
    ),
  });
  return rows.map((r) => r.userId);
}
