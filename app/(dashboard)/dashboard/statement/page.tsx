import { eq } from "drizzle-orm";
import { requireActiveGroup } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { members, contributions, loans, fines } from "@/lib/db/schema";
import { PageHeader } from "@/components/feature/page-header";
import { StatementTimeline } from "@/components/feature/statement-timeline";
import { Card, CardContent } from "@/components/ui/card";

export default async function StatementPage({
  searchParams,
}: {
  searchParams: Promise<{ member_id?: string }>;
}) {
  const session = await requireActiveGroup();
  const groupId = session.activeMembership.groupId;
  const isStaff = ["admin", "treasurer", "secretary"].includes(session.activeMembership.role);
  const { member_id } = await searchParams;

  const targetId = isStaff && member_id ? Number(member_id) : session.activeMembership.memberId;

  if (!targetId) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          No member profile linked to your account.
        </CardContent>
      </Card>
    );
  }

  // Fixes bug 2 (docs/architecture.md): the original app's /statement
  // endpoint queried contributions.payment_date and contributions.month_label,
  // neither of which exists on the contributions table (it has `month` as
  // an int and `createdAt`) — every call 500'd. This queries the real schema.
  const { member, contribs, memberLoans, repayments, memberFines } = await withTenant(
    groupId,
    async (tx) => {
      const member = await tx.query.members.findFirst({
        where: eq(members.id, targetId),
      });
      const contribs = await tx.query.contributions.findMany({
        where: eq(contributions.memberId, targetId),
        orderBy: (c, { desc }) => [desc(c.createdAt)],
      });
      const memberLoans = await tx.query.loans.findMany({
        where: eq(loans.memberId, targetId),
        orderBy: (l, { desc }) => [desc(l.createdAt)],
      });
      const loanIds = memberLoans.map((l) => l.id);
      const repayments = loanIds.length
        ? await tx.query.loanRepayments.findMany({
            where: (r, { inArray }) => inArray(r.loanId, loanIds),
            orderBy: (r, { desc }) => [desc(r.createdAt)],
          })
        : [];
      const memberFines = await tx.query.fines.findMany({
        where: eq(fines.memberId, targetId),
        orderBy: (f, { desc }) => [desc(f.createdAt)],
      });
      return { member, contribs, memberLoans, repayments, memberFines };
    },
  );

  if (!member) return null;

  return (
    <div className="space-y-6">
      <PageHeader title={`Statement — ${member.name}`} description="Full financial history." />
      <StatementTimeline
        contributions={contribs}
        loans={memberLoans}
        repayments={repayments}
        fines={memberFines}
      />
    </div>
  );
}
