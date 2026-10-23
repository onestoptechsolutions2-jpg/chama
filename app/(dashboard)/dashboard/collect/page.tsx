import { and, eq, inArray } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { groups, loans, members, welfarePolicies } from "@/lib/db/schema";
import { PageHeader } from "@/components/feature/page-header";
import { CollectSheet } from "@/components/feature/collect-sheet";

const OPEN_LOAN_STATUSES = ["active", "extended", "overdue"] as const;

export default async function CollectPage() {
  const session = await requirePermission("money.record");
  const { groupId, products } = session.activeMembership;

  const { roster, openLoans, group, policy } = await withTenant(groupId, async (tx) => ({
    roster: await tx.query.members.findMany({
      where: and(eq(members.groupId, groupId), eq(members.active, true)),
      columns: { id: true, name: true, phone: true },
      orderBy: (m, { asc }) => [asc(m.name)],
    }),
    openLoans: products.loans
      ? await tx.query.loans.findMany({
          where: and(eq(loans.groupId, groupId), inArray(loans.status, [...OPEN_LOAN_STATUSES])),
          columns: { id: true, memberId: true, amountRemaining: true },
        })
      : [],
    group: await tx.query.groups.findFirst({ where: eq(groups.id, groupId) }),
    policy: products.welfare
      ? await tx.query.welfarePolicies.findFirst({ where: eq(welfarePolicies.groupId, groupId) })
      : undefined,
  }));

  // "Usual amounts": shares = share price × shares per member; welfare =
  // the policy's fixed amount when the group collects a fixed sum.
  const usual = {
    capital: Number(group?.sharePrice ?? 0) * (group?.sharesPerMember ?? 1),
    welfare: policy?.fundingMethod === "fixed_amount" ? Number(policy.fundingFixedAmount ?? 0) : 0,
  };
  const loanByMember = new Map(openLoans.map((l) => [l.memberId, { loanId: l.id, remaining: Number(l.amountRemaining) }]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Record collections"
        description="Type what each member paid today, then save once. Everyone gets an SMS receipt."
      />
      <CollectSheet
        rows={roster.map((m) => ({ ...m, loan: loanByMember.get(m.id) ?? null }))}
        usual={usual}
        showWelfare={products.welfare}
        showLoans={products.loans}
        myMemberId={session.activeMembership.memberId}
      />
    </div>
  );
}
