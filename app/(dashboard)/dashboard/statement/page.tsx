import { requireActiveGroup } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { eq } from "drizzle-orm";
import { withTenant } from "@/lib/db/rls";
import { groups } from "@/lib/db/schema";
import { groupWalletsEnabled } from "@/lib/payments/intasend";
import { PayByMpesa } from "@/components/feature/pay-by-mpesa";
import { loadMyMonth } from "@/lib/members/my-month";
import { MyMonthCard } from "@/components/feature/my-month-card";
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

  const data = await loadStatement(groupId, targetId);
  const { member } = data;

  if (!member) return null;

  const isSelf = targetId === session.activeMembership.memberId;
  const myMonth = isSelf ? await withTenant(groupId, (tx) => loadMyMonth(tx, groupId, targetId)) : null;
  const walletOn =
    isSelf &&
    groupWalletsEnabled() &&
    Boolean(
      (await withTenant(groupId, (tx) => tx.query.groups.findFirst({ where: eq(groups.id, groupId), columns: { intasendWalletId: true } })))
        ?.intasendWalletId,
    );
  const products = session.activeMembership.products;
  const purposes = [
    { value: "capital", label: "Shares" },
    { value: "personal_savings", label: "Savings" },
    ...(products.welfare ? [{ value: "welfare", label: "Welfare" }] : []),
    ...(products.loans ? [{ value: "loan", label: "Loan repayment" }] : []),
  ];
  return (
    <StatementView
      title={isSelf ? "My Money" : `Money — ${member.name}`}
      description={isSelf ? "What you have put in and what you owe." : "Full financial history."}
      data={{ ...data, member }}
      action={
        isSelf ? (
          <>
            {myMonth && <MyMonthCard month={myMonth} showTotals={false} />}
            {walletOn && <PayByMpesa purposes={purposes} />}
          </>
        ) : null
      }
    />
  );
}
