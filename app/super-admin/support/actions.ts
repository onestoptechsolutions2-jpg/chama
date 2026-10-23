"use server";

import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { withPlatformAdmin, withTenant } from "@/lib/db/rls";
import { groupAuditLog, groupMemberships, sessions, supportSessions } from "@/lib/db/schema";
import { requirePlatformPermission, requireSession } from "@/lib/auth/session";
import { canPlatform } from "@/lib/auth/permissions";
import { SUPPORT_SESSION_MINUTES } from "@/lib/auth/support";
import { insertNotification } from "@/lib/db/notifications";

const startSchema = z.object({
  reason: z.string().trim().min(5, "Say why you're opening this group (at least a few words)").max(300),
  mode: z.enum(["view", "act"]),
  asUserId: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
});

/**
 * Opens a group as support: 30 minutes, with a reason, view-only unless
 * "act" was chosen (support.act). The group's admins are told, and the
 * start is in the group's audit log.
 */
export async function startSupportSessionAction(groupId: number, _prev: { error: string } | null, formData: FormData) {
  const session = await requirePlatformPermission("support.view");
  const parsed = startSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { reason, mode, asUserId } = parsed.data;
  if (mode === "act" && !canPlatform(session.user.platformRole, "support.act")) return { error: "You can only view groups." };

  if (asUserId) {
    const m = await db.query.groupMemberships.findFirst({
      where: and(eq(groupMemberships.userId, asUserId), eq(groupMemberships.groupId, groupId), eq(groupMemberships.status, "active")),
    });
    if (!m) return { error: "That person isn't an active member of this group" };
  }

  const expiresAt = new Date(Date.now() + SUPPORT_SESSION_MINUTES * 60_000);
  const [support] = await withPlatformAdmin((tx) =>
    tx
      .insert(supportSessions)
      .values({ staffUserId: session.user.id, groupId, asUserId: asUserId ?? null, mode, reason, expiresAt })
      .returning({ id: supportSessions.id }),
  );
  await db.update(sessions).set({ supportSessionId: support.id, activeGroupId: groupId }).where(eq(sessions.id, session.sessionId));

  await withTenant(groupId, async (tx) => {
    await tx.insert(groupAuditLog).values({
      groupId,
      command: "support.start",
      actorUserId: session.user.id,
      via: "support",
      onBehalfOfUserId: asUserId ?? null,
      reason,
      input: { mode },
      ok: true,
    });
    const admins = await tx.query.groupMemberships.findMany({
      where: and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.status, "active"), inArray(groupMemberships.role, ["admin"])),
    });
    for (const a of admins) {
      await insertNotification(tx, {
        groupId,
        userId: a.userId,
        template: {
          category: "info",
          title: "Platform support opened your group",
          body: `${session.user.name} (${mode === "act" ? "can make changes" : "view only"}) — “${reason}”. Everything they do is in Activity.`,
        },
        link: "/dashboard/activity",
        sourceType: "support_session",
        sourceId: support.id,
      });
    }
  });
  redirect("/dashboard");
}

export async function endSupportSessionAction(): Promise<void> {
  const session = await requireSession();
  if (session.support) {
    const id = session.support.supportSessionId;
    await withPlatformAdmin((tx) => tx.update(supportSessions).set({ endedAt: new Date() }).where(eq(supportSessions.id, id)));
  }
  const groupId = session.activeMembership?.groupId;
  await db.update(sessions).set({ supportSessionId: null, activeGroupId: null }).where(eq(sessions.id, session.sessionId));
  redirect(groupId ? `/super-admin/groups/${groupId}` : "/super-admin");
}
