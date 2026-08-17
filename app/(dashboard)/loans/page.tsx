import { and, eq } from "drizzle-orm";
import { requireProduct } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { loans, loanApplications, members, platformPayments, groupWallets } from "@/lib/db/schema";
import { PageHeader } from "@/components/feature/page-header";
import { LoansManager } from "@/components/feature/loans-manager";

export default async function LoansPage() {
  const session = await requireProduct("loans", "admin", "treasurer");
  const groupId = session.activeMembership.groupId;
  const isAdmin = session.activeMembership.role === "admin";

  // Sequential, not Promise.all — concurrent queries against the same `tx`
  // aren't guaranteed to share the transaction-local SET LOCAL context
  // withTenant relies on for RLS (see app/(dashboard)/billing/data.ts for
  // where this was caught: a race silently made RLS fail-safe to zero rows).
  const { groupLoans, applications, groupMembers, chargedFees, wallet } = await withTenant(
    groupId,
    async (tx) => {
      const groupLoans = await tx.query.loans.findMany({
        where: eq(loans.groupId, groupId),
        with: { member: true },
        orderBy: (l, { desc }) => [desc(l.createdAt)],
      });
      const applications = await tx.query.loanApplications.findMany({
        where: eq(loanApplications.groupId, groupId),
        with: { member: true },
        orderBy: (a, { desc }) => [desc(a.createdAt)],
      });
      const groupMembers = await tx.query.members.findMany({
        where: eq(members.active, true),
        orderBy: (m, { asc }) => [asc(m.name)],
      });
      const chargedFees = await tx.query.platformPayments.findMany({
        where: and(
          eq(platformPayments.groupId, groupId),
          eq(platformPayments.type, "loan_fee"),
          eq(platformPayments.status, "paid"),
        ),
      });
      const wallet = await tx.query.groupWallets.findFirst({
        where: eq(groupWallets.groupId, groupId),
      });
      return { groupLoans, applications, groupMembers, chargedFees, wallet };
    },
  );
  const chargedLoanIds = new Set(chargedFees.map((p) => p.loanId).filter((id): id is number => id !== null));

  return (
    <div className="space-y-6">
      <PageHeader title="Loans" description="Approve loans, record repayments, review applications." />
      <LoansManager
        loans={groupLoans}
        applications={applications}
        members={groupMembers}
        chargedLoanIds={chargedLoanIds}
        walletBalance={wallet?.balance ?? "0"}
        isAdmin={isAdmin}
      />
    </div>
  );
}
