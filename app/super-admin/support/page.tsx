import { desc, eq, inArray, sql } from "drizzle-orm";
import { withPlatformAdmin } from "@/lib/db/rls";
import { db } from "@/lib/db/client";
import {
  groupInvites,
  groupMemberships,
  groups,
  incomingPayments,
  loanApplications,
  loans,
  supportSessions,
  users,
  welfareRequests,
} from "@/lib/db/schema";
import { requirePlatformPermission } from "@/lib/auth/session";
import { canPlatform } from "@/lib/auth/permissions";
import { SEGMENTS, isSegment } from "@/lib/domain/segments";
import { PageHeader } from "@/components/feature/page-header";
import { SupportConsole, type ConsoleGroup, type ConsoleSession } from "@/components/feature/support-console";

const n = sql<number>`count(*)::int`;

function isLive(s: { endedAt: Date | null; expiresAt: Date }): boolean {
  return !s.endedAt && s.expiresAt.getTime() > Date.now();
}

/**
 * The support console: how platform staff — who never belong to a group —
 * help groups. Every group with the work waiting in it, and one step to open
 * it as its admin (view-only or able to act). Opening starts a time-boxed,
 * reasoned, audited support session (lib/auth/support.ts).
 */
export default async function SupportConsolePage() {
  const session = await requirePlatformPermission("support.view");

  // One counting query per kind of work, grouped by group (sequential —
  // never Promise.all inside one transaction, see docs/architecture.md).
  const data = await withPlatformAdmin(async (tx) => {
    const byGroup = async (q: Promise<{ groupId: number; n: number }[]>) => new Map((await q).map((r) => [r.groupId, r.n]));
    return {
      groupRows: await tx.query.groups.findMany({ orderBy: (g, { asc }) => [asc(g.name)] }),
      unmatched: await byGroup(
        tx.select({ groupId: incomingPayments.groupId, n }).from(incomingPayments).where(eq(incomingPayments.status, "unmatched")).groupBy(incomingPayments.groupId),
      ),
      loanRequests: await byGroup(
        tx.select({ groupId: loanApplications.groupId, n }).from(loanApplications).where(eq(loanApplications.status, "pending")).groupBy(loanApplications.groupId),
      ),
      overdue: await byGroup(tx.select({ groupId: loans.groupId, n }).from(loans).where(eq(loans.status, "overdue")).groupBy(loans.groupId)),
      welfare: await byGroup(
        tx
          .select({ groupId: welfareRequests.groupId, n })
          .from(welfareRequests)
          .where(inArray(welfareRequests.status, ["pending", "under_review"]))
          .groupBy(welfareRequests.groupId),
      ),
      invites: await byGroup(tx.select({ groupId: groupInvites.groupId, n }).from(groupInvites).where(eq(groupInvites.status, "pending")).groupBy(groupInvites.groupId)),
      recent: await tx.query.supportSessions.findMany({ orderBy: [desc(supportSessions.createdAt)], limit: 15 }),
    };
  });
  const memberCounts = new Map(
    (
      await db
        .select({ groupId: groupMemberships.groupId, n })
        .from(groupMemberships)
        .where(eq(groupMemberships.status, "active"))
        .groupBy(groupMemberships.groupId)
    ).map((r) => [r.groupId, r.n]),
  );
  const joinRequests = new Map(
    (
      await db
        .select({ groupId: groupMemberships.groupId, n })
        .from(groupMemberships)
        .where(eq(groupMemberships.status, "pending"))
        .groupBy(groupMemberships.groupId)
    ).map((r) => [r.groupId, r.n]),
  );
  const staffIds = [...new Set(data.recent.map((r) => r.staffUserId))];
  const staff = staffIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, staffIds))
    : [];
  const staffName = new Map(staff.map((s) => [s.id, s.name]));
  const groupName = new Map(data.groupRows.map((g) => [g.id, g.name]));

  const consoleGroups: ConsoleGroup[] = data.groupRows.map((g) => {
    const work = {
      unmatchedPayments: data.unmatched.get(g.id) ?? 0,
      joinRequests: joinRequests.get(g.id) ?? 0,
      loanRequests: data.loanRequests.get(g.id) ?? 0,
      overdueLoans: data.overdue.get(g.id) ?? 0,
      welfareRequests: data.welfare.get(g.id) ?? 0,
      pendingInvites: data.invites.get(g.id) ?? 0,
    };
    return {
      id: g.id,
      name: g.name,
      kind: isSegment(g.segment) ? SEGMENTS[g.segment].label : g.type,
      active: g.active,
      members: memberCounts.get(g.id) ?? 0,
      setupIncomplete: !g.registrationComplete,
      work,
      workTotal: Object.values(work).reduce((a, b) => a + b, 0),
    };
  });
  consoleGroups.sort((a, b) => b.workTotal - a.workTotal || a.name.localeCompare(b.name));

  const recent: ConsoleSession[] = data.recent.map((r) => ({
    id: r.id,
    staff: staffName.get(r.staffUserId) ?? "Staff",
    group: groupName.get(r.groupId) ?? `#${r.groupId}`,
    mode: r.mode,
    reason: r.reason,
    at: r.createdAt.toISOString(),
    live: isLive(r),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support console"
        description="Platform staff don't belong to groups. Open any group here to see it as its admin and help — every session is time-boxed, has a reason the group sees, and is logged in the group's Activity."
      />
      <SupportConsole
        groups={consoleGroups}
        recent={recent}
        canAct={canPlatform(session.user.platformRole, "support.act")}
        canRunAgent={canPlatform(session.user.platformRole, "agent.run")}
      />
    </div>
  );
}
