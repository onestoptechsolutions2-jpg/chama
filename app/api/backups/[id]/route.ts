import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireActiveGroup } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { withTenant } from "@/lib/db/rls";
import { groupAuditLog, groupBackupReceipts, groupBackups } from "@/lib/db/schema";
import { XLSX_TYPE } from "@/lib/backup/daily";

/**
 * Downloads one of the group's daily backups. Officials of the active group
 * only (backup.download); never in support mode — platform staff don't get
 * members' data by default. Every download is recorded against the official
 * (so the sign-in prompt stops) and in the group's Activity log.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireActiveGroup();
  const m = session.activeMembership;
  if (session.support || !can(m, "backup.download")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const backup = await withTenant(m.groupId, async (tx) => {
    const row = await tx.query.groupBackups.findFirst({ where: and(eq(groupBackups.id, id), eq(groupBackups.groupId, m.groupId)) });
    if (!row) return null;
    await tx
      .insert(groupBackupReceipts)
      .values({ groupId: m.groupId, backupId: row.id, userId: session.user.id, downloadedAt: new Date() })
      .onConflictDoUpdate({ target: [groupBackupReceipts.backupId, groupBackupReceipts.userId], set: { downloadedAt: new Date() } });
    await tx.insert(groupAuditLog).values({
      groupId: m.groupId,
      command: "backup.download",
      actorUserId: session.user.id,
      via: "ui",
      input: { backupDate: row.backupDate },
      ok: true,
    });
    return row;
  });
  if (!backup) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new Response(new Uint8Array(backup.content), {
    headers: {
      "Content-Type": XLSX_TYPE,
      "Content-Disposition": `attachment; filename="${backup.fileName}"`,
      "Content-Length": String(backup.sizeBytes),
      "Cache-Control": "private, no-store",
    },
  });
}
