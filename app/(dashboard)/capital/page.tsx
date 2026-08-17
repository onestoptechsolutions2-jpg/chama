import { and, eq, inArray, sql } from "drizzle-orm";
import { requireActiveGroup } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { members, loans, contributions, welfareClaims, projects, groups } from "@/lib/db/schema";
import { computeCapitalPosition, computeAllocationDrift } from "@/lib/domain/capital";
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

  const { position, drift } = await withTenant(groupId, async (tx) => {
    const [memberTotals, loanTotals, group] = await Promise.all([
      tx
        .select({
          capitalPool: sql<string>`coalesce(sum(${members.capital}), 0)`,
          securityPool: sql<string>`coalesce(sum(${members.security}), 0)`,
          personalSavingsPool: sql<string>`coalesce(sum(${members.personalSavings}), 0)`,
        })
        .from(members)
        .where(and(eq(members.groupId, groupId), eq(members.active, true)))
        .then((rows) => rows[0]),
      tx
        .select({
          principal: sql<string>`coalesce(sum(${loans.principal}), 0)`,
          remaining: sql<string>`coalesce(sum(${loans.amountRemaining}), 0)`,
        })
        .from(loans)
        .where(and(eq(loans.groupId, groupId), inArray(loans.status, OUTSTANDING_LOAN_STATUSES)))
        .then((rows) => rows[0]),
      tx.query.groups.findFirst({ where: eq(groups.id, groupId) }),
    ]);

    // Same two-independent-aggregates pattern the Welfare page already uses
    // (docs/architecture.md bug 4) — avoids a join against an empty
    // subquery silently zeroing the total when nothing's been disbursed yet.
    const [welfareCollected, welfareDisbursed] = products.welfare
      ? await Promise.all([
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
          tx
            .select({ total: sql<string>`coalesce(sum(${welfareClaims.amountApproved}), 0)` })
            .from(welfareClaims)
            .where(and(eq(welfareClaims.groupId, groupId), eq(welfareClaims.status, "disbursed")))
            .then((rows) => rows[0].total),
        ])
      : ["0", "0"];

    const projectsCommitted = products.projects
      ? await tx
          .select({ total: sql<string>`coalesce(sum(${projects.collectedAmount}), 0)` })
          .from(projects)
          .where(and(eq(projects.groupId, groupId), inArray(projects.status, OPEN_PROJECT_STATUSES)))
          .then((rows) => rows[0].total)
      : "0";

    const position = computeCapitalPosition({
      capitalPool: Number(memberTotals.capitalPool),
      securityPool: Number(memberTotals.securityPool),
      personalSavingsPool: Number(memberTotals.personalSavingsPool),
      welfareCollected: Number(welfareCollected),
      welfareDisbursed: Number(welfareDisbursed),
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

    return { position, drift };
  });

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
