"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireActiveGroup } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { withTenant } from "@/lib/db/rls";
import { groupBackupReceipts, groupBackups } from "@/lib/db/schema";

/** "Not now" on the sign-in prompt: hides today's prompt for this official; tomorrow's backup brings it back. */
export async function dismissBackupPromptAction(backupId: number): Promise<void> {
  const session = await requireActiveGroup();
  const m = session.activeMembership;
  if (!can(m, "backup.download")) return;
  await withTenant(m.groupId, async (tx) => {
    const backup = await tx.query.groupBackups.findFirst({ where: and(eq(groupBackups.id, backupId), eq(groupBackups.groupId, m.groupId)), columns: { id: true } });
    if (!backup) return;
    await tx
      .insert(groupBackupReceipts)
      .values({ groupId: m.groupId, backupId, userId: session.user.id, dismissedAt: new Date() })
      .onConflictDoUpdate({ target: [groupBackupReceipts.backupId, groupBackupReceipts.userId], set: { dismissedAt: new Date() } });
  });
  revalidatePath("/dashboard", "layout");
}
