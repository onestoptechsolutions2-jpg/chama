import { and, eq, isNull, sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { withTenant } from "@/lib/db/rls";
import { groupBackupReceipts, groupBackups, notifications } from "@/lib/db/schema";
import { nairobiToday } from "@/lib/domain/dates";
import { BackupPrompt } from "@/components/feature/backup-prompt";
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

  // Officials get today's backup offered until they download it or say "Not now".
  const m = session.activeMembership;
  const backupDue =
    m && !session.support && can(m, "backup.download")
      ? await withTenant(m.groupId, async (tx) => {
          const backup = await tx.query.groupBackups.findFirst({
            where: and(eq(groupBackups.groupId, m.groupId), eq(groupBackups.backupDate, nairobiToday())),
            columns: { id: true, backupDate: true, sizeBytes: true },
          });
          if (!backup) return null;
          const seen = await tx.query.groupBackupReceipts.findFirst({
            where: and(eq(groupBackupReceipts.backupId, backup.id), eq(groupBackupReceipts.userId, session.user.id)),
            columns: { downloadedAt: true, dismissedAt: true },
          });
          return seen?.downloadedAt || seen?.dismissedAt ? null : backup;
        })
      : null;

  return (
    <>
      {session.support && session.activeMembership && (
        <SupportBanner support={session.support} groupName={session.activeMembership.groupName} />
      )}
      <DashboardShell session={session} unreadNotifications={unreadNotifications}>
        {backupDue && <BackupPrompt backup={{ id: backupDue.id, date: backupDue.backupDate, sizeKb: Math.max(1, Math.round(backupDue.sizeBytes / 1024)) }} />}
        {children}
      </DashboardShell>
    </>
  );
}
