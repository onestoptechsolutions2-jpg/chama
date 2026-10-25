import { eq, inArray } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/session";
import { GROUP_PERMISSIONS, type GroupPermission } from "@/lib/auth/permissions";
import { withTenant } from "@/lib/db/rls";
import { db } from "@/lib/db/client";
import { groupAuditLog, users } from "@/lib/db/schema";
import { PageHeader } from "@/components/feature/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const COMMAND_LABELS: Record<string, string> = {
  "contributions.record": "Recorded a payment",
  "contributions.recordBatch": "Recorded meeting collections",
  "fines.issue": "Issued a fine",
  "fines.settle": "Settled a fine",
  "loans.recordRepayment": "Recorded a loan repayment",
  "collections.recordMeeting": "Recorded meeting collections",
  "payments.receive": "Received a payment",
  "payments.import": "Imported a bank/payroll file",
  "payments.assign": "Matched a payment to a member",
  "payments.ignore": "Set aside a payment",
  "collections.prompt": "Sent an M-Pesa prompt",
  "collections.confirm": "M-Pesa prompt answered (paid or failed)",
  "wallet.enable": "Turned on the group wallet",
  "wallet.setDestination": "Changed where withdrawals go",
  "wallet.requestWithdrawal": "Asked to withdraw",
  "wallet.approveWithdrawal": "Approved a withdrawal",
  "wallet.cancelWithdrawal": "Cancelled a withdrawal",
  "shareout.prepare": "Prepared the share-out",
  "shareout.confirm": "Confirmed the share-out",
  "shareout.cancel": "Cancelled a prepared share-out",
  "support.start": "Opened the group to help",
  "support.extend": "Stayed 30 more minutes",
  "reminders.loanDue": "Sent a loan reminder",
};
const VIA_LABELS: Record<string, string> = {
  ui: "in the app",
  api: "via API",
  mpesa: "by M-Pesa",
  cron: "automatically",
  support: "by platform support",
  agent: "by the agent (fixed rules)",
};

export default async function ActivityPage() {
  const session = await requirePermission("audit.view");
  const groupId = session.activeMembership.groupId;
  const rows = await withTenant(groupId, (tx) =>
    tx.query.groupAuditLog.findMany({
      where: eq(groupAuditLog.groupId, groupId),
      orderBy: (r, { desc }) => [desc(r.createdAt)],
      limit: 200,
    }),
  );
  const ids = [...new Set(rows.flatMap((r) => [r.actorUserId, r.onBehalfOfUserId]).filter((x): x is number => x !== null))];
  const people = ids.length ? await db.query.users.findMany({ where: inArray(users.id, ids), columns: { id: true, name: true } }) : [];
  const nameOf = new Map(people.map((p) => [p.id, p.name]));

  return (
    <div className="space-y-6">
      <PageHeader title="Activity" description="Who did what, and how. This record can't be changed." />
      <Card>
        <CardContent className="divide-y pt-2">
          {rows.length === 0 && <p className="py-6 text-center text-muted-foreground">Nothing recorded yet.</p>}
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm">
              <div>
                <p className="font-medium">
                  {COMMAND_LABELS[r.command] ??
                    (r.command.startsWith("action:")
                      ? GROUP_PERMISSIONS[r.command.slice(7) as GroupPermission]?.label ?? r.command
                      : r.command)}
                  {!r.ok && <Badge variant="destructive" className="ml-2">Refused</Badge>}
                </p>
                <p className="text-muted-foreground">
                  {r.actorUserId ? nameOf.get(r.actorUserId) ?? "Someone" : "System"} {VIA_LABELS[r.via] ?? r.via}
                  {r.onBehalfOfUserId ? ` for ${nameOf.get(r.onBehalfOfUserId) ?? "a member"}` : ""}
                  {r.reason ? ` — “${r.reason}”` : ""}
                  {r.error ? ` — ${r.error}` : ""}
                </p>
              </div>
              <time className="text-xs text-muted-foreground">
                {r.createdAt.toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" })}
              </time>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
