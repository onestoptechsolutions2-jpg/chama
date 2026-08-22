import { and, eq, inArray, sql } from "drizzle-orm";
import { requireActiveGroup } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { members, loans, projects, groups } from "@/lib/db/schema";
import { computeCapitalPosition, computeAllocationDrift } from "@/lib/domain/capital";
import { getOrCreateWelfareFund } from "@/app/(dashboard)/dashboard/welfare/welfare-data";
import { PageHeader } from "@/components/feature/page-header";
import { CapitalPositionView } from "@/components/feature/capital-position";

/** Same statuses loans/actions.ts treats as "still outstanding" (BLOCKING_STATUSES). */
const OUTSTANDING_LOAN_STATUSES = ["pending", "active", "extended", "overdue"] as const;
const OPEN_PROJECT_STATUSES = ["planning", "active", "on_hold"] as const;

export default async function CapitalPositionPage() {
  const session = await requireActiveGroup();
  const groupId = session.activeMembership.groupId;
  const isStaff = ["admin", "treasurer", "secretary"].includes(session.activeMembership.role);
  const { products } = session.activeMembership;

  // Independent withTenant calls run concurrently, not one Promise.all
  // sharing a transaction — see app/(dashboard)/dashboard/page.tsx for why (a
  // concurrent-queries-in-one-tx race can silently starve RLS of its
  // transaction-local context). The pure computeCapitalPosition/
  // computeAllocationDrift calls happen after, outside any transaction.
  const [memberTotals, loanTotals, group, welfareFund, projectsCommitted] = await Promise.all([
    withTenant(groupId, (tx) =>
      tx
        .select({
          capitalPool: sql<string>`coalesce(sum(${members.capital}), 0)`,
          securityPool: sql<string>`coalesce(sum(${members.security}), 0)`,
          personalSavingsPool: sql<string>`coalesce(sum(${members.personalSavings}), 0)`,
        })
        .from(members)
        .where(and(eq(members.groupId, groupId), eq(members.active, true)))
        .then((rows) => rows[0]),
    ),
    withTenant(groupId, (tx) =>
      tx
        .select({
          principal: sql<string>`coalesce(sum(${loans.principal}), 0)`,
          remaining: sql<string>`coalesce(sum(${loans.amountRemaining}), 0)`,
        })
        .from(loans)
        .where(and(eq(loans.groupId, groupId), inArray(loans.status, OUTSTANDING_LOAN_STATUSES)))
        .then((rows) => rows[0]),
    ),
    withTenant(groupId, (tx) => tx.query.groups.findFirst({ where: eq(groups.id, groupId) })),
    // Phase 8: read straight from the welfare fund's cached reserve
    // balances instead of a collected-minus-disbursed aggregate over
    // contributions/welfare_claims — the ledger-backed fund already tracks
    // a running balance, so there's nothing left to derive here.
    products.welfare
      ? withTenant(groupId, (tx) => getOrCreateWelfareFund(tx, groupId))
      : Promise.resolve(null),
    products.projects
      ? withTenant(groupId, (tx) =>
          tx
            .select({ total: sql<string>`coalesce(sum(${projects.collectedAmount}), 0)` })
            .from(projects)
            .where(and(eq(projects.groupId, groupId), inArray(projects.status, OPEN_PROJECT_STATUSES)))
            .then((rows) => rows[0].total),
        )
      : Promise.resolve("0"),
  ]);

  const welfareAvailable = welfareFund
    ? Number(welfareFund.emergencyBalance) + Number(welfareFund.longTermBalance) + Number(welfareFund.advanceBalance)
    : 0;

  const position = computeCapitalPosition({
    capitalPool: Number(memberTotals.capitalPool),
    securityPool: Number(memberTotals.securityPool),
    personalSavingsPool: Number(memberTotals.personalSavingsPool),
    welfareAvailable,
    projectsCommitted: Number(projectsCommitted),
    loanPrincipalOutstanding: Number(loanTotals.principal),
    loanReceivableOutstanding: Number(loanTotals.remaining),
  });

  const drift = computeAllocationDrift(
    position.loanDeploymentPct,
    group?.targetLoanDeploymentPct === undefined || group?.targetLoanDeploymentPct === null
      ? null
      : Number(group.targetLoanDeploymentPct),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Capital Position"
        description="How the group's pooled capital is currently allocated."
      />
      <CapitalPositionView position={position} drift={drift} products={products} isStaff={isStaff} />
    </div>
  );
}
