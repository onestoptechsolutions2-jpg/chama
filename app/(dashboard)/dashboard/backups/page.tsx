import { and, desc, eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { groupBackupReceipts, groupBackups } from "@/lib/db/schema";
import { BACKUP_KEEP_DAYS } from "@/lib/backup/daily";
import { emailEnabled } from "@/lib/notify/email";
import { PageHeader } from "@/components/feature/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

/** The group's daily backups (officials only), newest first. */
export default async function BackupsPage() {
  const session = await requirePermission("backup.download");
  const groupId = session.activeMembership.groupId;
  const blocked = Boolean(session.support);
  const { backups, mine } = await withTenant(groupId, async (tx) => ({
    backups: await tx
      .select({ id: groupBackups.id, date: groupBackups.backupDate, size: groupBackups.sizeBytes })
      .from(groupBackups)
      .where(eq(groupBackups.groupId, groupId))
      .orderBy(desc(groupBackups.backupDate)),
    mine: await tx.query.groupBackupReceipts.findMany({
      where: and(eq(groupBackupReceipts.groupId, groupId), eq(groupBackupReceipts.userId, session.user.id)),
    }),
  }));
  const byBackup = new Map(mine.map((r) => [r.backupId, r]));
  return (
    <div className="space-y-6">
      <PageHeader
        title="Backups"
        description={`A full copy of the group's records in one Excel file, made every day and kept for ${BACKUP_KEEP_DAYS} days.${
          emailEnabled() ? " Officials with an email address also get it by email each morning." : ""
        }`}
      />
      <Card>
        <CardContent className="divide-y pt-2 text-sm">
          {blocked && <p className="py-3 text-muted-foreground">Backups can&apos;t be downloaded in support mode — they hold members&apos; personal data.</p>}
          {backups.length === 0 && <p className="py-3 text-muted-foreground">The first backup is made early tomorrow morning.</p>}
          {backups.map((b) => {
            const r = byBackup.get(b.id);
            return (
              <div key={b.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{b.date}</p>
                  <p className="text-xs text-muted-foreground">
                    {Math.max(1, Math.round(b.size / 1024))} KB
                    {r?.downloadedAt ? " · you downloaded it" : ""}
                    {r?.emailedAt ? " · emailed to you" : ""}
                  </p>
                </div>
                {!blocked && (
                  <a href={`/api/backups/${b.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Download
                  </a>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
