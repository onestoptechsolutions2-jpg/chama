import { withPlatformAdmin } from "@/lib/db/rls";
import { sql } from "drizzle-orm";
import { platformPayments, subscriptionInvoices } from "@/lib/db/schema";
import { PageHeader } from "@/components/feature/page-header";
import { SuperAdminGroupsManager } from "@/components/feature/super-admin-groups-manager";

export default async function SuperAdminGroupsPage() {
  const [allGroups, platformUsers, activities, finance] = await withPlatformAdmin(async (tx) => {
    const groupRows = await tx.query.groups.findMany({ orderBy: (g, { desc }) => [desc(g.createdAt)] });
    const userRows = await tx.query.users.findMany({ where: (u, { isNotNull }) => isNotNull(u.platformRole) });
    const activityRows = await tx.query.groupAccountActivities.findMany({
      orderBy: (activity, { desc }) => [desc(activity.createdAt)],
      limit: 100,
    });
    const invoiceRows = await tx
      .select({
        groupId: subscriptionInvoices.groupId,
        pendingAmount: sql<string>`coalesce(sum(${subscriptionInvoices.totalAmount}) filter (where ${subscriptionInvoices.status} = 'pending'), 0)`,
        pendingCount: sql<number>`count(*) filter (where ${subscriptionInvoices.status} = 'pending')::int`,
        latestStatus: sql<string>`(array_agg(${subscriptionInvoices.status} order by ${subscriptionInvoices.periodStart} desc))[1]`,
        latestAmount: sql<string>`(array_agg(${subscriptionInvoices.totalAmount} order by ${subscriptionInvoices.periodStart} desc))[1]`,
      })
      .from(subscriptionInvoices)
      .groupBy(subscriptionInvoices.groupId);
    const paymentRows = await tx
      .select({
        groupId: platformPayments.groupId,
        paidAmount: sql<string>`coalesce(sum(${platformPayments.amount}) filter (where ${platformPayments.status} = 'paid' and ${platformPayments.type} = 'subscription'), 0)`,
        pendingPaymentAmount: sql<string>`coalesce(sum(${platformPayments.amount}) filter (where ${platformPayments.status} = 'pending' and ${platformPayments.type} = 'subscription'), 0)`,
      })
      .from(platformPayments)
      .groupBy(platformPayments.groupId);
    const invoiceByGroup = new Map(invoiceRows.map((row) => [row.groupId, row]));
    const paymentByGroup = new Map(paymentRows.map((row) => [row.groupId, row]));
    const finance = new Map(
      groupRows.map((group) => {
        const invoice = invoiceByGroup.get(group.id);
        const payment = paymentByGroup.get(group.id);
        return [group.id, {
          pendingAmount: invoice?.pendingAmount ?? "0",
          pendingCount: invoice?.pendingCount ?? 0,
          latestStatus: invoice?.latestStatus ?? "none",
          latestAmount: invoice?.latestAmount ?? "0",
          paidAmount: payment?.paidAmount ?? "0",
          pendingPaymentAmount: payment?.pendingPaymentAmount ?? "0",
        }];
      }),
    );
    return [groupRows, userRows, activityRows, finance] as const;
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Groups" description="Every tenant group on the platform." />
      <SuperAdminGroupsManager groups={allGroups} platformUsers={platformUsers} activities={activities} finance={finance} />
    </div>
  );
}
