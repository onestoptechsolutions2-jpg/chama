import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { loans, loanApplications, members } from "@/lib/db/schema";
import { PageHeader } from "@/components/feature/page-header";
import { LoansManager } from "@/components/feature/loans-manager";

export default async function LoansPage() {
  const session = await requireRole("admin", "treasurer");
  const groupId = session.activeMembership.groupId;

  const [groupLoans, applications, groupMembers] = await withTenant(groupId, (tx) =>
    Promise.all([
      tx.query.loans.findMany({
        where: eq(loans.groupId, groupId),
        with: { member: true },
        orderBy: (l, { desc }) => [desc(l.createdAt)],
      }),
      tx.query.loanApplications.findMany({
        where: eq(loanApplications.groupId, groupId),
        with: { member: true },
        orderBy: (a, { desc }) => [desc(a.createdAt)],
      }),
      tx.query.members.findMany({
        where: eq(members.active, true),
        orderBy: (m, { asc }) => [asc(m.name)],
      }),
    ]),
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Loans" description="Approve loans, record repayments, review applications." />
      <LoansManager loans={groupLoans} applications={applications} members={groupMembers} />
    </div>
  );
}
