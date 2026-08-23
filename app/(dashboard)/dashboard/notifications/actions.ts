"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { requireActiveGroup } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { notifications } from "@/lib/db/schema";

/**
 * Per-user filtering (never someone else's notifications) is an app-level
 * `userId` filter on top of the tenant scope, same convention documented in
 * drizzle/0035_phase8_welfare_policy_ledger_rls.sql — RLS on this table only
 * ever enforces the group boundary.
 */
export async function markNotificationReadAction(notificationId: number): Promise<void> {
  const session = await requireActiveGroup();
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, (tx) =>
    tx
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.groupId, groupId),
          eq(notifications.userId, session.user.id),
        ),
      ),
  );

  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard", "layout");
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const session = await requireActiveGroup();
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, (tx) =>
    tx
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.groupId, groupId),
          eq(notifications.userId, session.user.id),
          isNull(notifications.readAt),
        ),
      ),
  );

  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard", "layout");
}
