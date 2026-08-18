import { and, eq } from "drizzle-orm";
import { requireProduct } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { welfareRequests, welfareAdvances, welfareApprovals } from "@/lib/db/schema";
import { getOrCreateWelfarePolicy, getOrCreateWelfareFund } from "./welfare-data";
import { isBelowFloor } from "@/lib/domain/welfare-fund";
import { PageHeader } from "@/components/feature/page-header";
import { WelfareManager } from "@/components/feature/welfare-manager";

export default async function WelfarePage() {
  const session = await requireProduct("welfare");
  const groupId = session.activeMembership.groupId;
  const memberId = session.activeMembership.memberId;
  const isStaff = ["admin", "treasurer"].includes(session.activeMembership.role);

  // Independent withTenant calls, not a shared transaction — see
  // app/(dashboard)/page.tsx for why concurrent queries inside one
  // withTenant call can race with RLS's transaction-local context.
  const policy = await withTenant(groupId, (tx) => getOrCreateWelfarePolicy(tx, groupId));
  const fund = await withTenant(groupId, (tx) => getOrCreateWelfareFund(tx, groupId));

  const requestsWhere = isStaff
    ? eq(welfareRequests.groupId, groupId)
    : memberId
      ? and(eq(welfareRequests.groupId, groupId), eq(welfareRequests.memberId, memberId))
      : undefined;
  const requests = requestsWhere
    ? await withTenant(groupId, (tx) =>
        tx.query.welfareRequests.findMany({
          where: requestsWhere,
          with: {
            member: true,
            grant: true,
            advance: true,
            approvals: { with: { member: true } },
          },
          orderBy: (r, { desc }) => [desc(r.createdAt)],
        }),
      )
    : [];

  const advancesWhere = isStaff
    ? eq(welfareAdvances.groupId, groupId)
    : memberId
      ? and(eq(welfareAdvances.groupId, groupId), eq(welfareAdvances.memberId, memberId))
      : undefined;
  const advances = advancesWhere
    ? await withTenant(groupId, (tx) =>
        tx.query.welfareAdvances.findMany({
          where: advancesWhere,
          with: { member: true },
          orderBy: (a, { desc }) => [desc(a.createdAt)],
        }),
      )
    : [];

  const myPendingApprovals = memberId
    ? await withTenant(groupId, (tx) =>
        tx.query.welfareApprovals.findMany({
          where: and(
            eq(welfareApprovals.groupId, groupId),
            eq(welfareApprovals.memberId, memberId),
            eq(welfareApprovals.status, "pending"),
          ),
          with: { request: { with: { member: true } } },
        }),
      )
    : [];

  const reserveLow = isBelowFloor(Number(fund.emergencyBalance), Number(policy.minEmergencyReserveFloor));

  return (
    <div className="space-y-6">
      <PageHeader title="Welfare" description="The group's collective welfare fund." />
      <WelfareManager
        fund={fund}
        policy={policy}
        requests={requests}
        advances={advances}
        myPendingApprovals={myPendingApprovals}
        reserveLow={reserveLow}
        isStaff={isStaff}
        memberId={memberId}
      />
    </div>
  );
}
