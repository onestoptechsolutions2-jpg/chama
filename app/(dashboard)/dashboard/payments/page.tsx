import { and, desc, eq, inArray } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { withTenant } from "@/lib/db/rls";
import { groups, incomingPayments, members } from "@/lib/db/schema";
import { appUrl } from "@/lib/urls";
import { PageHeader } from "@/components/feature/page-header";
import { PaymentsManager } from "@/components/feature/payments-manager";

export default async function PaymentsPage() {
  const session = await requirePermission("money.record");
  const groupId = session.activeMembership.groupId;
  const canSetup = can(session.activeMembership, "settings.manage");

  const { group, unmatched, recent, roster } = await withTenant(groupId, async (tx) => ({
    group: await tx.query.groups.findFirst({
      where: eq(groups.id, groupId),
      columns: { paybillNumber: true, c2bToken: true, paymentDefaultType: true },
    }),
    unmatched: await tx.query.incomingPayments.findMany({
      where: and(eq(incomingPayments.groupId, groupId), eq(incomingPayments.status, "unmatched")),
      orderBy: [desc(incomingPayments.receivedAt)],
      limit: 200,
    }),
    recent: await tx.query.incomingPayments.findMany({
      where: and(eq(incomingPayments.groupId, groupId), inArray(incomingPayments.status, ["matched", "ignored"])),
      orderBy: [desc(incomingPayments.receivedAt)],
      limit: 30,
    }),
    roster: await tx.query.members.findMany({
      where: and(eq(members.groupId, groupId), eq(members.active, true)),
      columns: { id: true, name: true, memberNumber: true },
      orderBy: (m, { asc }) => [asc(m.name)],
    }),
  }));

  const mpesaBase = group?.c2bToken ? await appUrl(`/api/mpesa/c2b/${group.c2bToken}`) : null;
  const nameOf = new Map(roster.map((m) => [m.id, m.name]));
  const view = (p: typeof unmatched[number]) => ({
    id: p.id,
    source: p.source,
    amount: Number(p.amount),
    payerName: p.payerName,
    payerPhone: p.payerPhone,
    accountRef: p.accountRef,
    receivedAt: p.receivedAt.toISOString(),
    status: p.status,
    memberName: p.memberId ? nameOf.get(p.memberId) ?? null : null,
    appliedAs: p.appliedAs,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="M-Pesa, bank and payroll payments are matched to members by their account number and recorded automatically. Match the rest here."
      />
      <PaymentsManager
        setup={{
          canSetup,
          paybillNumber: group?.paybillNumber ?? "",
          defaultType: group?.paymentDefaultType ?? "capital",
          confirmationUrl: mpesaBase ? `${mpesaBase}/confirmation` : null,
          validationUrl: mpesaBase ? `${mpesaBase}/validation` : null,
        }}
        unmatched={unmatched.map(view)}
        recent={recent.map(view)}
        roster={roster}
      />
    </div>
  );
}
