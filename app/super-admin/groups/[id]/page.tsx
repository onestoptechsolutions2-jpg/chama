import { notFound } from "next/navigation";
import { and, eq, inArray, sql } from "drizzle-orm";
import { withPlatformAdmin } from "@/lib/db/rls";
import {
  groups,
  groupMemberships,
  members,
  loans,
  fines,
  contributions,
  mgrCycles,
  mgrSlots,
  subscriptionInvoices,
  platformPayments,
  groupAccountActivities,
  users,
} from "@/lib/db/schema";
import { computeCapitalPosition } from "@/lib/domain/capital";
import { computeNextMgrEvent } from "@/lib/domain/insights";
import { getOrCreateWelfareFund } from "@/app/(dashboard)/dashboard/welfare/welfare-data";
import { PageHeader } from "@/components/feature/page-header";
import { GroupProfileView } from "@/components/feature/group-profile-view";

const OUTSTANDING_LOAN_STATUSES = ["pending", "active", "extended", "overdue"] as const;
const MONTHS_BACK = 6;

export default async function GroupProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const groupId = Number(id);
  if (!Number.isInteger(groupId)) notFound();

  const [
    group,
    membershipStats,
    activeRoles,
    capitalTotals,
    loanTotals,
    loansByStatus,
    finesByStatus,
    monthly,
    mgrData,
    welfareFund,
    invoices,
    payments,
    activities,
    platformUsers,
  ] = await withPlatformAdmin(async (tx) => {
    const groupRow = await tx.query.groups.findFirst({ where: eq(groups.id, groupId) });
    if (!groupRow) return [null] as const;

    const [
      membershipStatsRow,
      activeRolesRows,
      capitalTotalsRow,
      loanTotalsRow,
      loansByStatusRows,
      finesByStatusRows,
      monthlyRows,
      mgrDataResult,
      welfareFundRow,
      invoiceRows,
      paymentRows,
      activityRows,
      platformUserRows,
    ] = await Promise.all([
      tx
        .select({
          active: sql<number>`count(*) filter (where ${groupMemberships.status} = 'active')::int`,
          pending: sql<number>`count(*) filter (where ${groupMemberships.status} = 'pending')::int`,
        })
        .from(groupMemberships)
        .where(eq(groupMemberships.groupId, groupId))
        .then((r) => r[0]),
      tx.query.groupMemberships.findMany({
        where: and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.status, "active")),
      }),
      tx
        .select({
          capitalPool: sql<string>`coalesce(sum(${members.capital}), 0)`,
          securityPool: sql<string>`coalesce(sum(${members.security}), 0)`,
          personalSavingsPool: sql<string>`coalesce(sum(${members.personalSavings}), 0)`,
        })
        .from(members)
        .where(and(eq(members.groupId, groupId), eq(members.active, true)))
        .then((r) => r[0]),
      tx
        .select({
          principal: sql<string>`coalesce(sum(${loans.principal}), 0)`,
          remaining: sql<string>`coalesce(sum(${loans.amountRemaining}), 0)`,
        })
        .from(loans)
        .where(and(eq(loans.groupId, groupId), inArray(loans.status, OUTSTANDING_LOAN_STATUSES)))
        .then((r) => r[0]),
      tx
        .select({ status: loans.status, count: sql<number>`count(*)::int`, outstanding: sql<string>`coalesce(sum(${loans.amountRemaining}), 0)` })
        .from(loans)
        .where(eq(loans.groupId, groupId))
        .groupBy(loans.status),
      tx
        .select({ status: fines.status, total: sql<string>`coalesce(sum(${fines.amount}), 0)` })
        .from(fines)
        .where(eq(fines.groupId, groupId))
        .groupBy(fines.status),
      tx
        .select({ year: contributions.year, month: contributions.month, total: sql<string>`coalesce(sum(${contributions.amount}), 0)` })
        .from(contributions)
        .where(and(eq(contributions.groupId, groupId), eq(contributions.status, "paid")))
        .groupBy(contributions.year, contributions.month)
        .orderBy(contributions.year, contributions.month)
        .then((rows) => rows.slice(-MONTHS_BACK)),
      groupRow.mgrEnabled
        ? Promise.all([
            tx.query.mgrCycles.findMany({ where: eq(mgrCycles.groupId, groupId) }),
            tx.query.mgrSlots.findMany({ where: eq(mgrSlots.groupId, groupId), with: { member: true } }),
          ])
        : Promise.resolve(null),
      groupRow.welfareEnabled ? getOrCreateWelfareFund(tx, groupId) : Promise.resolve(null),
      tx.query.subscriptionInvoices.findMany({
        where: eq(subscriptionInvoices.groupId, groupId),
        orderBy: (i, { desc }) => [desc(i.periodStart)],
        limit: 6,
      }),
      tx
        .select({
          paidAmount: sql<string>`coalesce(sum(${platformPayments.amount}) filter (where ${platformPayments.status} = 'paid'), 0)`,
          pendingAmount: sql<string>`coalesce(sum(${platformPayments.amount}) filter (where ${platformPayments.status} = 'pending'), 0)`,
        })
        .from(platformPayments)
        .where(eq(platformPayments.groupId, groupId))
        .then((r) => r[0]),
      tx.query.groupAccountActivities.findMany({
        where: eq(groupAccountActivities.groupId, groupId),
        orderBy: (a, { desc }) => [desc(a.createdAt)],
        limit: 20,
      }),
      tx.query.users.findMany({ where: (u, { isNotNull }) => isNotNull(u.platformRole) }),
    ]);

    return [
      groupRow,
      membershipStatsRow,
      activeRolesRows,
      capitalTotalsRow,
      loanTotalsRow,
      loansByStatusRows,
      finesByStatusRows,
      monthlyRows,
      mgrDataResult,
      welfareFundRow,
      invoiceRows,
      paymentRows,
      activityRows,
      platformUserRows,
    ] as const;
  });

  if (!group) notFound();

  const position = computeCapitalPosition({
    capitalPool: Number(capitalTotals!.capitalPool),
    securityPool: Number(capitalTotals!.securityPool),
    personalSavingsPool: Number(capitalTotals!.personalSavingsPool),
    welfareAvailable: welfareFund
      ? Number(welfareFund.emergencyBalance) + Number(welfareFund.longTermBalance) + Number(welfareFund.advanceBalance)
      : 0,
    projectsCommitted: 0,
    loanPrincipalOutstanding: Number(loanTotals!.principal),
    loanReceivableOutstanding: Number(loanTotals!.remaining),
  });

  const nextMgrEvent = mgrData
    ? computeNextMgrEvent(
        mgrData[0].map((c) => ({ cycleNumber: c.cycleNumber, status: c.status, scheduledDate: c.scheduledDate })),
        mgrData[1].map((s) => ({ cycleNumber: s.cycleNumber, memberId: s.memberId, memberName: s.member?.name ?? null })),
        new Date(),
      )
    : null;

  const officials = {
    admin: activeRoles!.some((r) => r.role === "admin"),
    treasurer: activeRoles!.some((r) => r.role === "treasurer"),
    secretary: activeRoles!.some((r) => r.role === "secretary"),
  };

  return (
    <div className="space-y-6">
      <PageHeader title={group.name} description={`${group.type} · created ${new Date(group.createdAt).toLocaleDateString()}`} />
      <GroupProfileView
        group={group}
        activeMemberCount={membershipStats!.active}
        pendingMemberCount={membershipStats!.pending}
        officials={officials}
        position={position}
        loansByStatus={loansByStatus!}
        finesByStatus={finesByStatus!}
        monthly={monthly!}
        nextMgrEvent={nextMgrEvent}
        invoices={invoices!}
        billing={payments!}
        activities={activities!}
        platformUsers={platformUsers!}
      />
    </div>
  );
}
