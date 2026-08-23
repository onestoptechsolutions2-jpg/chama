import { and, eq, sql } from "drizzle-orm";
import { requireActiveGroup } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { members, fines, loans, contributions } from "@/lib/db/schema";
import type { Report } from "@/components/feature/insights-view";
import { computeGroupInsights } from "./data";
import { PageHeader } from "@/components/feature/page-header";
import { InsightsView } from "@/components/feature/insights-view";

export default async function InsightsPage() {
  const session = await requireActiveGroup();
  const groupId = session.activeMembership.groupId;
  const isStaff = ["admin", "treasurer", "secretary"].includes(session.activeMembership.role);
  const { products } = session.activeMembership;

  // Independent withTenant calls run concurrently, not one Promise.all
  // sharing a transaction — see app/(dashboard)/dashboard/page.tsx for why (a
  // concurrent-queries-in-one-tx race can silently starve RLS of its
  // transaction-local context).
  const [{ recommendations, nextMgrEvent, mgrPace, memberRiskFlags }, report] = await Promise.all([
    computeGroupInsights(groupId, products),
    // Folded in from the old standalone Reports page — staff only, and
    // scoped to its own withTenant call rather than sharing another
    // query's transaction (same Promise.all/RLS-race reasoning as above).
    isStaff
      ? withTenant(groupId, async (tx): Promise<Report> => {
          const monthly = await tx
            .select({ year: contributions.year, month: contributions.month, total: sql<string>`coalesce(sum(${contributions.amount}), 0)` })
            .from(contributions)
            .where(and(eq(contributions.groupId, groupId), eq(contributions.status, "paid")))
            .groupBy(contributions.year, contributions.month)
            .orderBy(contributions.year, contributions.month);
          const balances = await tx
            .select({ name: members.name, total: sql<string>`(${members.capital} + ${members.security} + ${members.personalSavings})` })
            .from(members)
            .where(and(eq(members.groupId, groupId), eq(members.active, true)))
            .orderBy(sql`(${members.capital} + ${members.security} + ${members.personalSavings}) desc`)
            .limit(10);
          const loansByStatus = await tx
            .select({ status: loans.status, count: sql<number>`count(*)::int`, outstanding: sql<string>`coalesce(sum(${loans.amountRemaining}), 0)` })
            .from(loans)
            .where(eq(loans.groupId, groupId))
            .groupBy(loans.status);
          const finesByStatus = await tx
            .select({ status: fines.status, total: sql<string>`coalesce(sum(${fines.amount}), 0)` })
            .from(fines)
            .where(eq(fines.groupId, groupId))
            .groupBy(fines.status);
          return { monthly, balances, loansByStatus, finesByStatus };
        })
      : Promise.resolve(null),
  ]);

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
        report={report}
      />
    </div>
  );
}
