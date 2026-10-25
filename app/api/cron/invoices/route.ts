import { NextResponse } from "next/server";
import { and, eq, ne, or, isNull } from "drizzle-orm";
import { isAuthorizedCronRequest, runCronJob } from "@/lib/cron/helpers";
import { withPlatformAdmin, withTenant } from "@/lib/db/rls";
import { groups } from "@/lib/db/schema";
import { billingPeriod, ensureMonthlyInvoice, payInvoiceFromWallet } from "@/lib/billing/invoices";
import { insertNotification, listActiveStaffUserIds } from "@/lib/db/notifications";

const ksh = (n: number) => `Ksh ${Math.round(n).toLocaleString("en-KE")}`;

/**
 * Daily at 06:20 Africa/Nairobi (03:20 UTC — see vercel.json): makes sure
 * every active group has this month's subscription invoice (once — running
 * again changes nothing). Free-plan groups (Ksh 0) and funeral funds get no
 * invoice. A new invoice is paid from the group's prepaid wallet when the
 * balance covers it; either way the admin and treasurer are notified.
 * Returns the number of invoices created.
 */
export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runCronJob("invoices", async () => {
    const period = billingPeriod();
    const active = await withPlatformAdmin((tx) =>
      tx
        .select({ id: groups.id })
        .from(groups)
        .where(and(eq(groups.active, true), or(isNull(groups.segment), ne(groups.segment, "funeral_fund")))),
    );
    let created = 0;
    for (const g of active) {
      try {
        const done = await withTenant(g.id, async (tx) => {
          const r = await ensureMonthlyInvoice(tx, g.id, period);
          if (!r?.created) return false;
          const amount = Number(r.invoice.totalAmount);
          const paid = "ok" in (await payInvoiceFromWallet(tx, g.id, r.invoice.id));
          const template = paid
            ? { category: "success" as const, title: "Subscription paid", body: `${ksh(amount)} for ${period.periodStart.slice(0, 7)} was paid from your prepaid wallet.` }
            : {
                category: "action_required" as const,
                title: "Subscription invoice",
                body: `Your invoice for ${period.periodStart.slice(0, 7)} is ${ksh(amount)}. Pay it on Billing (wallet or M-Pesa).`,
              };
          for (const userId of await listActiveStaffUserIds(tx, g.id, ["admin", "treasurer"])) {
            await insertNotification(tx, { groupId: g.id, userId, template, link: "/dashboard/billing", sourceType: "subscription_invoice", sourceId: r.invoice.id });
          }
          return true;
        });
        if (done) created++;
      } catch (e) {
        console.error(`[invoices] group ${g.id}`, e);
      }
    }
    return created;
  });
  if (!result.ranJob) return NextResponse.json({ ok: true, skipped: "already running" });
  return NextResponse.json({ ok: !result.error, ...result });
}
