import { and, eq, inArray, sql } from "drizzle-orm";
import { requireActiveGroup } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import {
  groups,
  groupMemberships,
  members,
  mgrCycles,
  mgrSlots,
  fines,
  contributionDues,
  loans,
  meetings,
  attendance,
  welfareClaims,
  contributions,
} from "@/lib/db/schema";
import { computeCapitalPosition, computeAllocationDrift } from "@/lib/domain/capital";
import {
  computeNextMgrEvent,
  computeMgrPace,
  computeMemberRiskFlags,
  computeWelfareOutlook,
  generateRecommendations,
  type MemberRiskInput,
} from "@/lib/domain/insights";
import { PageHeader } from "@/components/feature/page-header";
import { InsightsView } from "@/components/feature/insights-view";

const OUTSTANDING_LOAN_STATUSES = ["pending", "active", "extended", "overdue"] as const;
const REQUIRED_OFFICES: { role: "admin" | "treasurer" | "secretary"; label: string }[] = [
  { role: "admin", label: "a Chair" },
  { role: "treasurer", label: "a Treasurer" },
  { role: "secretary", label: "a Secretary" },
];
const RECENT_MEETINGS_LIMIT = 4;

export default async function InsightsPage() {
  const session = await requireActiveGroup();
  const groupId = session.activeMembership.groupId;
  const isStaff = ["admin", "treasurer", "secretary"].includes(session.activeMembership.role);
  const { products } = session.activeMembership;

  // Independent withTenant calls run concurrently, not one Promise.all
  // sharing a transaction — see app/(dashboard)/dashboard/page.tsx for why (a
  // concurrent-queries-in-one-tx race can silently starve RLS of its
  // transaction-local context). Related sequential lookups (e.g. "this
  // group's meetings, then attendance for those meetings") are bundled into
  // one withTenant call each, since sequential awaits within a single
  // transaction don't have that race.
  const [core, attendanceData, welfareCollected, welfareDisbursed, welfarePending] =
    await Promise.all([
      withTenant(groupId, async (tx) => {
        const group = await tx.query.groups.findFirst({ where: eq(groups.id, groupId) });

        const activeRoles = await tx.query.groupMemberships.findMany({
          where: and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.status, "active")),
        });

        const cycles = products.mgr
          ? await tx.query.mgrCycles.findMany({ where: eq(mgrCycles.groupId, groupId) })
          : [];
        const slots = products.mgr
          ? await tx.query.mgrSlots.findMany({
              where: eq(mgrSlots.groupId, groupId),
              with: { member: true },
            })
          : [];

        const activeMembers = await tx.query.members.findMany({
          where: and(eq(members.groupId, groupId), eq(members.active, true)),
        });

        const capitalTotals = await tx
          .select({ capitalPool: sql<string>`coalesce(sum(${members.capital}), 0)` })
          .from(members)
          .where(and(eq(members.groupId, groupId), eq(members.active, true)))
          .then((rows) => rows[0]);

        const loanTotals = await tx
          .select({
            principal: sql<string>`coalesce(sum(${loans.principal}), 0)`,
            remaining: sql<string>`coalesce(sum(${loans.amountRemaining}), 0)`,
          })
          .from(loans)
          .where(and(eq(loans.groupId, groupId), inArray(loans.status, OUTSTANDING_LOAN_STATUSES)))
          .then((rows) => rows[0]);

        const pendingFines = await tx
          .select({
            memberId: fines.memberId,
            total: sql<string>`coalesce(sum(${fines.amount}), 0)`,
            count: sql<number>`count(*)::int`,
          })
          .from(fines)
          .where(and(eq(fines.groupId, groupId), eq(fines.status, "pending")))
          .groupBy(fines.memberId);

        const overdueDues = await tx
          .select({
            memberId: contributionDues.memberId,
            total: sql<string>`coalesce(sum(${contributionDues.amountDue} - ${contributionDues.amountPaid}), 0)`,
            count: sql<number>`count(*)::int`,
          })
          .from(contributionDues)
          .where(and(eq(contributionDues.groupId, groupId), eq(contributionDues.status, "overdue")))
          .groupBy(contributionDues.memberId);

        const overdueLoans = products.loans
          ? await tx
              .select({
                memberId: loans.memberId,
                count: sql<number>`count(*)::int`,
              })
              .from(loans)
              .where(and(eq(loans.groupId, groupId), eq(loans.status, "overdue")))
              .groupBy(loans.memberId)
          : [];

        return {
          group,
          activeRoles,
          cycles,
          slots,
          activeMembers,
          capitalPool: Number(capitalTotals.capitalPool),
          loanPrincipalOutstanding: Number(loanTotals.principal),
          loanReceivableOutstanding: Number(loanTotals.remaining),
          pendingFines,
          overdueDues,
          overdueLoans,
        };
      }),
      withTenant(groupId, async (tx) => {
        const recentMeetings = await tx.query.meetings.findMany({
          where: eq(meetings.groupId, groupId),
          orderBy: (m, { desc }) => [desc(m.meetingDate)],
          limit: RECENT_MEETINGS_LIMIT,
        });
        if (recentMeetings.length === 0) return { meetingsConsidered: 0, absencesByMember: [] };

        const absencesByMember = await tx
          .select({
            memberId: attendance.memberId,
            count: sql<number>`count(*)::int`,
          })
          .from(attendance)
          .where(
            and(
              eq(attendance.groupId, groupId),
              inArray(
                attendance.meetingId,
                recentMeetings.map((m) => m.id),
              ),
              eq(attendance.status, "absent"),
            ),
          )
          .groupBy(attendance.memberId);

        return { meetingsConsidered: recentMeetings.length, absencesByMember };
      }),
      // Same two-independent-aggregates pattern as capital/page.tsx and
      // welfare/page.tsx (docs/architecture.md bug 4) — avoids a join
      // against an empty subquery silently zeroing a total.
      products.welfare
        ? withTenant(groupId, (tx) =>
            tx
              .select({ total: sql<string>`coalesce(sum(${contributions.amount}), 0)` })
              .from(contributions)
              .where(
                and(
                  eq(contributions.groupId, groupId),
                  eq(contributions.type, "welfare"),
                  eq(contributions.status, "paid"),
                ),
              )
              .then((rows) => rows[0].total),
          )
        : Promise.resolve("0"),
      products.welfare
        ? withTenant(groupId, (tx) =>
            tx
              .select({ total: sql<string>`coalesce(sum(${welfareClaims.amountApproved}), 0)` })
              .from(welfareClaims)
              .where(and(eq(welfareClaims.groupId, groupId), eq(welfareClaims.status, "disbursed")))
              .then((rows) => rows[0].total),
          )
        : Promise.resolve("0"),
      products.welfare
        ? withTenant(groupId, (tx) =>
            tx
              .select({ total: sql<string>`coalesce(sum(${welfareClaims.amountRequested}), 0)` })
              .from(welfareClaims)
              .where(
                and(
                  eq(welfareClaims.groupId, groupId),
                  inArray(welfareClaims.status, ["pending", "under_review", "approved"]),
                ),
              )
              .then((rows) => rows[0].total),
          )
        : Promise.resolve("0"),
    ]);

  if (!core.group) return null;
  const { group } = core;

  // ── Assemble the pure-function inputs from the fetched rows ──────────────
  const nextMgrEvent = products.mgr
    ? computeNextMgrEvent(
        core.cycles.map((c) => ({ cycleNumber: c.cycleNumber, status: c.status, scheduledDate: c.scheduledDate })),
        core.slots.map((s) => ({
          cycleNumber: s.cycleNumber,
          memberId: s.memberId,
          memberName: s.member?.name ?? null,
        })),
        new Date(),
      )
    : null;

  const mgrPace = products.mgr
    ? computeMgrPace(
        core.cycles
          .filter((c) => c.status === "completed")
          .map((c) => ({ cycleNumber: c.cycleNumber, status: c.status, scheduledDate: c.scheduledDate })),
        group.mgrFrequency,
      )
    : null;

  const position = computeCapitalPosition({
    capitalPool: core.capitalPool,
    securityPool: 0,
    personalSavingsPool: 0,
    welfareAvailable: Number(welfareCollected) - Number(welfareDisbursed),
    projectsCommitted: 0,
    loanPrincipalOutstanding: core.loanPrincipalOutstanding,
    loanReceivableOutstanding: core.loanReceivableOutstanding,
  });
  const capitalDrift = computeAllocationDrift(
    position.loanDeploymentPct,
    group.targetLoanDeploymentPct === null ? null : Number(group.targetLoanDeploymentPct),
  );

  const finesByMember = new Map(core.pendingFines.map((f) => [f.memberId, f]));
  const duesByMember = new Map(core.overdueDues.map((d) => [d.memberId, d]));
  const overdueLoansByMember = new Map(core.overdueLoans.map((l) => [l.memberId, l.count]));
  const absencesByMember = new Map(attendanceData.absencesByMember.map((a) => [a.memberId, a.count]));

  const riskInputs: MemberRiskInput[] = core.activeMembers.map((m) => ({
    memberId: m.id,
    name: m.name,
    pendingFinesTotal: Number(finesByMember.get(m.id)?.total ?? 0),
    pendingFinesCount: finesByMember.get(m.id)?.count ?? 0,
    overdueDuesTotal: Number(duesByMember.get(m.id)?.total ?? 0),
    overdueDuesCount: duesByMember.get(m.id)?.count ?? 0,
    overdueLoanCount: overdueLoansByMember.get(m.id) ?? 0,
    recentAbsences: absencesByMember.get(m.id) ?? 0,
    recentMeetingsConsidered: attendanceData.meetingsConsidered,
  }));
  const memberRiskFlags = computeMemberRiskFlags(riskInputs);

  const welfareOutlook = products.welfare
    ? computeWelfareOutlook(
        Number(welfareCollected) - Number(welfareDisbursed),
        Number(welfarePending),
      )
    : null;

  const activeRoleSet = new Set(core.activeRoles.map((m) => m.role));
  const missingOffices = REQUIRED_OFFICES.filter((o) => !activeRoleSet.has(o.role)).map(
    (o) => o.label,
  );

  const recommendations = generateRecommendations({
    registrationComplete: group.registrationComplete,
    missingOffices,
    nextMgrEvent,
    mgrPace,
    capitalDrift,
    overextended: position.overextended,
    memberRiskFlags,
    welfareOutlook,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Insights"
        description="What's next, what's on pace, and what needs a nudge — computed live from the group's own records."
      />
      <InsightsView
        nextMgrEvent={nextMgrEvent}
        mgrPace={mgrPace}
        recommendations={recommendations}
        memberRiskFlags={isStaff ? memberRiskFlags : []}
        isStaff={isStaff}
        mgrEnabled={products.mgr}
      />
    </div>
  );
}
