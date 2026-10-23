import { requireActiveGroup } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { loadStatement } from "./data";
import { StatementView } from "./statement-view";

export default async function StatementPage({
  searchParams,
}: {
  searchParams: Promise<{ member_id?: string }>;
}) {
  const session = await requireActiveGroup();
  const groupId = session.activeMembership.groupId;
  const isStaff = can(session.activeMembership, "reports.view");
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

  const { member, contribs, memberLoans, repayments, memberFines } = await loadStatement(groupId, targetId);

  if (!member) return null;

  const isSelf = targetId === session.activeMembership.memberId;
  return (
    <StatementView
      title={isSelf ? "My Money" : `Money — ${member.name}`}
      description={isSelf ? "What you have put in and what you owe." : "Full financial history."}
      data={{ member, contribs, memberLoans, repayments, memberFines }}
    />
  );
}
