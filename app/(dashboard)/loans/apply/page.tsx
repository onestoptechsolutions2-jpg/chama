import { and, eq } from "drizzle-orm";
import { requireActiveGroup } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { loans, loanApplications, members, groups } from "@/lib/db/schema";
import { computeLoanLimit, isActiveLoanStatus } from "@/lib/domain/loans";
import { PageHeader } from "@/components/feature/page-header";
import { LoanApplyForm } from "@/components/feature/loan-apply-form";
import { Card, CardContent } from "@/components/ui/card";

export default async function LoanApplyPage() {
  const session = await requireActiveGroup();
  const memberId = session.activeMembership.memberId;
  const groupId = session.activeMembership.groupId;

  if (!memberId) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          No member profile is linked to your account, so you can&apos;t apply for a loan.
        </CardContent>
      </Card>
    );
  }

  const { member, group, myLoans, myApplications } = await withTenant(groupId, async (tx) => {
    const member = await tx.query.members.findFirst({ where: eq(members.id, memberId) });
    const group = await tx.query.groups.findFirst({ where: eq(groups.id, groupId) });
    const myLoans = await tx.query.loans.findMany({
      where: and(eq(loans.memberId, memberId), eq(loans.groupId, groupId)),
      orderBy: (l, { desc }) => [desc(l.createdAt)],
    });
    const myApplications = await tx.query.loanApplications.findMany({
      where: and(eq(loanApplications.memberId, memberId), eq(loanApplications.groupId, groupId)),
      orderBy: (a, { desc }) => [desc(a.createdAt)],
    });
    return { member, group, myLoans, myApplications };
  });

  if (!member || !group) return null;

  const activeLoan = myLoans.find((l) => isActiveLoanStatus(l.status) || l.status === "pending");
  const pendingApplication = myApplications.find((a) => a.status === "pending");
  const limit = computeLoanLimit(member, group);

  return (
    <div className="space-y-6">
      <PageHeader title="My Loan" description={`Your loan limit is Ksh ${limit.toLocaleString()}.`} />
      <LoanApplyForm
        activeLoan={activeLoan ?? null}
        pendingApplication={pendingApplication ?? null}
        pastApplications={myApplications.filter((a) => a.status !== "pending")}
        limit={limit}
      />
    </div>
  );
}
