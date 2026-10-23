import { and, eq, isNull, sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { notifications } from "@/lib/db/schema";
import { DashboardShell } from "@/components/feature/dashboard-shell";
import { SupportBanner } from "@/components/feature/support-banner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();

  const unreadNotifications = session.activeMembership
    ? await withTenant(session.activeMembership.groupId, (tx) =>
        tx
          .select({ count: sql<number>`count(*)::int` })
          .from(notifications)
          .where(
            and(
              eq(notifications.groupId, session.activeMembership!.groupId),
              eq(notifications.userId, session.user.id),
              isNull(notifications.readAt),
            ),
          )
          .then((rows) => rows[0].count),
      )
    : 0;

  return (
    <>
      {session.support && session.activeMembership && (
        <SupportBanner support={session.support} groupName={session.activeMembership.groupName} />
      )}
      <DashboardShell session={session} unreadNotifications={unreadNotifications}>
        {children}
      </DashboardShell>
    </>
  );
}
