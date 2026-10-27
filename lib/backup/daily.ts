import "server-only";
import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { withPlatformAdmin, withTenant, type Tx } from "@/lib/db/rls";
import { groupAuditLog, groupBackupReceipts, groupBackups, groupMemberships, groups, users } from "@/lib/db/schema";
import { addDays, nairobiToday } from "@/lib/domain/dates";
import { emailEnabled, sendEmail } from "@/lib/notify/email";
import { buildGroupWorkbook } from "./workbook";

/** How long daily backups stay downloadable. */
export const BACKUP_KEEP_DAYS = 90;
export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const OFFICIAL_ROLES = ["admin", "treasurer", "secretary"] as const;

/** The group's officials (chair, treasurer, secretary) with an active membership — never platform staff. */
export async function groupOfficials(tx: Tx, groupId: number) {
  const rows = await tx
    .select({ userId: users.id, name: users.name, email: users.email, platformRole: users.platformRole })
    .from(groupMemberships)
    .innerJoin(users, eq(users.id, groupMemberships.userId))
    .where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.status, "active"), inArray(groupMemberships.role, [...OFFICIAL_ROLES])));
  return rows.filter((r) => !r.platformRole);
}

/**
 * Daily: for every active group, build today's workbook once (re-running
 * changes nothing), delete backups older than BACKUP_KEEP_DAYS, and email
 * today's to each official with an email address who hasn't had it yet.
 * Every email is written to the group's Activity log.
 */
export async function runDailyBackups(today = nairobiToday()): Promise<{ built: number; emailed: number; failed: number }> {
  const active = await withPlatformAdmin((tx) => tx.select({ id: groups.id }).from(groups).where(eq(groups.active, true)));
  let built = 0;
  let emailed = 0;
  let failed = 0;
  for (const g of active) {
    try {
      const backup = await withTenant(g.id, async (tx) => {
        await tx.delete(groupBackups).where(and(eq(groupBackups.groupId, g.id), lt(groupBackups.backupDate, addDays(today, -BACKUP_KEEP_DAYS))));
        const existing = await tx.query.groupBackups.findFirst({
          where: and(eq(groupBackups.groupId, g.id), eq(groupBackups.backupDate, today)),
          columns: { id: true, fileName: true },
        });
        if (existing) return { ...existing, created: false };
        const { buffer, fileName } = await buildGroupWorkbook(tx, g.id, today);
        const [row] = await tx
          .insert(groupBackups)
          .values({ groupId: g.id, backupDate: today, fileName, content: buffer, sizeBytes: buffer.length })
          .onConflictDoNothing()
          .returning({ id: groupBackups.id, fileName: groupBackups.fileName });
        return row ? { ...row, created: true } : null;
      });
      if (!backup) continue;
      if (backup.created) built++;
      if (!emailEnabled()) continue;

      // Who already has today's email (re-runs never send twice), and the file itself.
      const { officials, group, emailedUsers, content } = await withTenant(g.id, async (tx) => ({
        officials: await groupOfficials(tx, g.id),
        group: await tx.query.groups.findFirst({ where: eq(groups.id, g.id), columns: { name: true } }),
        emailedUsers: new Set(
          (
            await tx
              .select({ userId: groupBackupReceipts.userId })
              .from(groupBackupReceipts)
              .where(and(eq(groupBackupReceipts.backupId, backup.id), isNotNull(groupBackupReceipts.emailedAt)))
          ).map((r) => r.userId),
        ),
        content: await tx.query.groupBackups.findFirst({ where: eq(groupBackups.id, backup.id), columns: { content: true } }),
      }));
      if (!content) continue;
      for (const o of officials) {
        if (!o.email || emailedUsers.has(o.userId)) continue;
        try {
          await sendEmail({
            to: o.email,
            subject: `${group?.name ?? "Your group"} — daily backup ${today}`,
            text: `Hello ${o.name.split(" ")[0]},\n\nAttached is ${group?.name ?? "your group"}'s backup for ${today}: members, contributions, merry-go-round, fines, welfare, projects, loans and meetings in one Excel workbook.\n\nIt contains members' personal details and money, so please keep it private. The last ${BACKUP_KEEP_DAYS} days of backups are also on the Backups page in Chama.\n\n— Chama`,
            attachments: [{ filename: backup.fileName, content: Buffer.from(content.content), contentType: XLSX_TYPE }],
          });
          await withTenant(g.id, async (tx) => {
            await tx
              .insert(groupBackupReceipts)
              .values({ groupId: g.id, backupId: backup.id, userId: o.userId, emailedAt: new Date() })
              .onConflictDoUpdate({ target: [groupBackupReceipts.backupId, groupBackupReceipts.userId], set: { emailedAt: new Date() } });
            await tx.insert(groupAuditLog).values({
              groupId: g.id,
              command: "backup.emailed",
              actorUserId: null,
              via: "cron",
              onBehalfOfUserId: o.userId,
              input: { backupDate: today, to: o.userId },
              ok: true,
            });
          });
          emailed++;
        } catch (e) {
          failed++;
          console.error(`[backups] email group ${g.id} user ${o.userId}`, e);
          await withTenant(g.id, (tx) =>
            tx.insert(groupAuditLog).values({
              groupId: g.id,
              command: "backup.emailed",
              actorUserId: null,
              via: "cron",
              onBehalfOfUserId: o.userId,
              input: { backupDate: today, to: o.userId },
              ok: false,
              error: e instanceof Error ? e.message.slice(0, 300) : "send failed",
            }),
          ).catch(() => {});
        }
      }
    } catch (e) {
      failed++;
      console.error(`[backups] group ${g.id}`, e);
    }
  }
  return { built, emailed, failed };
}
