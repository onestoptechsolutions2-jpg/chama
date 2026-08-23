import { desc, inArray } from "drizzle-orm";
import { withPlatformAdmin } from "@/lib/db/rls";
import { paymentWebhookEvents, platformPayments, groups } from "@/lib/db/schema";
import { PageHeader } from "@/components/feature/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const RECENT_LIMIT = 30;

type ConfigCheck = {
  label: string;
  configured: boolean;
  /** Non-secret metadata safe to display alongside the status (e.g. sandbox vs live) — never a secret value itself. */
  detail?: string;
};

function checkPlatformConfig(): ConfigCheck[] {
  return [
    {
      label: "IntaSend secret key",
      configured: Boolean(process.env.INTASEND_SECRET_KEY),
      detail: process.env.INTASEND_ENV === "live" ? "live" : "sandbox",
    },
    {
      label: "IntaSend webhook challenge",
      configured: Boolean(process.env.INTASEND_WEBHOOK_CHALLENGE),
    },
    {
      label: "Vercel Cron secret",
      configured: Boolean(process.env.CRON_SECRET),
    },
    {
      label: "Blob storage (KYC uploads)",
      configured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    },
    {
      label: "Portal base URL",
      configured: Boolean(process.env.PORTAL_BASE_URL),
      detail: process.env.PORTAL_BASE_URL,
    },
  ];
}

function ConfigRow({ check }: { check: ConfigCheck }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span>{check.label}</span>
      <span className="flex items-center gap-2">
        {check.configured && check.detail && (
          <span className="text-xs text-muted-foreground">{check.detail}</span>
        )}
        <Badge variant={check.configured ? "secondary" : "destructive"}>
          {check.configured ? "Configured" : "Missing"}
        </Badge>
      </span>
    </div>
  );
}

export default async function SuperAdminIntegrationsPage() {
  const config = checkPlatformConfig();

  // One withPlatformAdmin call, sequential awaits — events, then the
  // payments/groups those events reference, all inside the same
  // transaction (safe: sequential queries against one tx don't race the
  // way concurrent ones inside a shared tx can — see
  // app/(dashboard)/dashboard/page.tsx for that distinction).
  const { events, paymentByInvoice, groupById } = await withPlatformAdmin(async (tx) => {
    const eventRows = await tx
      .select()
      .from(paymentWebhookEvents)
      .orderBy(desc(paymentWebhookEvents.receivedAt))
      .limit(RECENT_LIMIT);

    const invoiceIds = [...new Set(eventRows.map((e) => e.invoiceId).filter((id): id is string => !!id))];
    const payments = invoiceIds.length
      ? await tx.select().from(platformPayments).where(inArray(platformPayments.invoiceId, invoiceIds))
      : [];
    const groupIds = [...new Set(payments.map((p) => p.groupId))];
    const groupRows = groupIds.length
      ? await tx.query.groups.findMany({ where: inArray(groups.id, groupIds) })
      : [];

    return {
      events: eventRows,
      paymentByInvoice: new Map(payments.map((p) => [p.invoiceId, p])),
      groupById: new Map(groupRows.map((g) => [g.id, g])),
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations"
        description="External service configuration and recent inbound webhook activity."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {config.map((check) => (
            <ConfigRow key={check.label} check={check} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent webhook events</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Received</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Challenge</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No webhook events received yet.
                  </TableCell>
                </TableRow>
              )}
              {events.map((event) => {
                const payment = event.invoiceId ? paymentByInvoice.get(event.invoiceId) : undefined;
                const group = payment ? groupById.get(payment.groupId) : undefined;
                return (
                  <TableRow key={event.id}>
                    <TableCell className="text-muted-foreground">
                      {new Date(event.receivedAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="capitalize">{event.provider}</TableCell>
                    <TableCell className="max-w-40 truncate font-mono text-xs" title={event.invoiceId ?? undefined}>
                      {event.invoiceId ?? "—"}
                    </TableCell>
                    <TableCell>{group?.name ?? "—"}</TableCell>
                    <TableCell>{payment ? `Ksh ${Number(payment.amount).toLocaleString()}` : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={event.challengeValid ? "secondary" : "destructive"}>
                        {event.challengeValid ? "Valid" : "Invalid"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
