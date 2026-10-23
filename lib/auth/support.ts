import "server-only";
import { and, eq } from "drizzle-orm";
import { withPlatformAdmin } from "@/lib/db/rls";
import { groupMemberships, groups, members, supportSessions, users } from "@/lib/db/schema";
import { canPlatform, type PlatformRole } from "@/lib/auth/permissions";
export { SUPPORT_MONEY_OUT, SUPPORT_NEVER, supportWriteError } from "./support-rules";
import type { ActiveMembership, SupportContext } from "@/lib/auth/session";

export const SUPPORT_SESSION_MINUTES = 30;

/**
 * Resolves a session's support context: the group, seen exactly as the
 * chosen member sees it (their role and money record), or as the group's
 * admin when no member was chosen. Null if the support session ended,
 * expired, or the staff member lost support access.
 */
export async function loadSupportContext(
  supportSessionId: number,
  staff: { id: number; platformRole: PlatformRole | null },
): Promise<{ support: SupportContext; membership: ActiveMembership } | null> {
  if (!canPlatform(staff.platformRole, "support.view")) return null;
  return withPlatformAdmin(async (tx) => {
    const s = await tx.query.supportSessions.findFirst({ where: eq(supportSessions.id, supportSessionId) });
    if (!s || s.staffUserId !== staff.id || s.endedAt || s.expiresAt.getTime() < Date.now()) return null;
    const group = await tx.query.groups.findFirst({ where: eq(groups.id, s.groupId) });
    if (!group) return null;

    let role: ActiveMembership["role"] = "admin";
    let memberId: number | null = null;
    let asUserName: string | null = null;
    if (s.asUserId) {
      const membership = await tx.query.groupMemberships.findFirst({
        where: and(eq(groupMemberships.userId, s.asUserId), eq(groupMemberships.groupId, s.groupId)),
      });
      if (!membership || membership.status !== "active") return null;
      role = membership.role;
      const member = await tx.query.members.findFirst({
        where: and(eq(members.userId, s.asUserId), eq(members.groupId, s.groupId)),
      });
      memberId = member?.id ?? null;
      const person = await tx.query.users.findFirst({ where: eq(users.id, s.asUserId), columns: { name: true } });
      asUserName = person?.name ?? null;
    }

    return {
      support: {
        supportSessionId: s.id,
        asUserId: s.asUserId,
        asUserName,
        reason: s.reason,
        mode: s.mode === "act" ? "act" : "view",
        expiresAt: s.expiresAt,
      },
      membership: {
        groupId: group.id,
        groupName: group.name,
        groupType: group.type,
        role,
        status: "active",
        memberId,
        products: {
          loans: group.loansEnabled,
          mgr: group.mgrEnabled,
          welfare: group.welfareEnabled,
          projects: group.projectsEnabled,
        },
      },
    };
  });
}
