import { and, eq, ne } from "drizzle-orm";
import { requireProduct } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { loans, loanApplications, loanGuarantors, members, groups } from "@/lib/db/schema";
import { computeLoanLimit, isActiveLoanStatus } from "@/lib/domain/loans";
import { PageHeader } from "@/components/feature/page-header";
import { LoanApplyForm } from "@/components/feature/loan-apply-form";
import { Card, CardContent } from "@/components/ui/card";

export default async function LoanApplyPage() {
  const session = await requireProduct("loans");
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

  // Sequential, not Promise.all — see app/(dashboard)/dashboard/billing/data.ts for
  // why concurrent queries inside one withTenant transaction are unsafe.
  const member = await withTenant(groupId, (tx) => tx.query.members.findFirst({ where: eq(members.id, memberId) }));
  const group = await withTenant(groupId, (tx) => tx.query.groups.findFirst({ where: eq(groups.id, groupId) }));
  const myLoans = await withTenant(groupId, (tx) =>
    tx.query.loans.findMany({
      where: and(eq(loans.memberId, memberId), eq(loans.groupId, groupId)),
      orderBy: (l, { desc }) => [desc(l.createdAt)],
    }),
  );
  const myApplications = await withTenant(groupId, (tx) =>
    tx.query.loanApplications.findMany({
      where: and(eq(loanApplications.memberId, memberId), eq(loanApplications.groupId, groupId)),
      orderBy: (a, { desc }) => [desc(a.createdAt)],
    }),
  );
  const eligibleGuarantors = await withTenant(groupId, (tx) =>
    tx.query.members.findMany({
      where: and(eq(members.groupId, groupId), eq(members.active, true), ne(members.id, memberId)),
      orderBy: (m, { asc }) => [asc(m.name)],
      columns: { id: true, name: true },
    }),
  );
  // My pending guarantee *requests* — where someone else is asking ME to
  // guarantee their loan.
  const myPendingRequests = await withTenant(groupId, (tx) =>
    tx.query.loanGuarantors.findMany({
      where: and(eq(loanGuarantors.memberId, memberId), eq(loanGuarantors.status, "pending")),
      with: { application: { with: { member: true } } },
    }),
  );
  // Loans/applications I'm currently an accepted guarantor for.
  const myGuarantees = await withTenant(groupId, (tx) =>
    tx.query.loanGuarantors.findMany({
      where: and(eq(loanGuarantors.memberId, memberId), eq(loanGuarantors.status, "accepted")),
      with: { loan: { with: { member: true } }, application: { with: { member: true } } },
    }),
  );
  // Guarantors already requested on my own pending application (so the
  // apply form can show their status instead of a blank slate).
  const myPendingApplication = myApplications.find((a) => a.status === "pending");
  const myApplicationGuarantors = myPendingApplication
    ? await withTenant(groupId, (tx) =>
        tx.query.loanGuarantors.findMany({
          where: eq(loanGuarantors.applicationId, myPendingApplication.id),
          with: { member: true },
        }),
      )
    : [];

  if (!member || !group) return null;

  const activeLoan = myLoans.find((l) => isActiveLoanStatus(l.status) || l.status === "pending");
  const limit = computeLoanLimit(member, group);

  return (
    <div className="space-y-6">
      <PageHeader title="My Loan" description={`Your loan limit is Ksh ${limit.toLocaleString()}.`} />
      <LoanApplyForm
        activeLoan={activeLoan ?? null}
        pendingApplication={myPendingApplication ?? null}
        pendingApplicationGuarantors={myApplicationGuarantors}
        pastApplications={myApplications.filter((a) => a.status !== "pending")}
        limit={limit}
        minGuarantors={group.loanMinGuarantors}
        eligibleGuarantors={eligibleGuarantors}
        myPendingRequests={myPendingRequests}
        myGuarantees={myGuarantees}
      />
    </div>
  );
}
