import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import { groupWallets, platformPayments, subscriptionInvoices, walletTransactions } from "@/lib/db/schema";
import { billingPeriod, computeSubscriptionQuote } from "@/lib/domain/billing";
import { computeGroupBillingInputs } from "@/app/(dashboard)/dashboard/billing/data";

export { billingPeriod };

type Invoice = typeof subscriptionInvoices.$inferSelect;

/**
 * The group's invoice for a month, created from the live quote if it doesn't
 * exist yet (one per group per month — a unique index backs this). Groups
 * whose quote is Ksh 0 (the free plan) get no invoice unless `force`.
 */
export async function ensureMonthlyInvoice(
  tx: Tx,
  groupId: number,
  period = billingPeriod(),
  opts: { force?: boolean } = {},
): Promise<{ invoice: Invoice; created: boolean } | null> {
  const existing = await tx.query.subscriptionInvoices.findFirst({
    where: and(eq(subscriptionInvoices.groupId, groupId), eq(subscriptionInvoices.periodStart, period.periodStart)),
  });
  if (existing) return { invoice: existing, created: false };

  const inputs = await computeGroupBillingInputs(tx, groupId);
  const quote = computeSubscriptionQuote(inputs);
  const total = quote.totalAnnual === 0 ? 0 : quote.totalMonthly;
  if (total <= 0 && !opts.force) return null;

  const [invoice] = await tx
    .insert(subscriptionInvoices)
    .values({
      groupId,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      billingCycle: "monthly",
      memberCount: inputs.activeMembers,
      memberFee: String(quote.memberFee),
      vehicleFee: String(quote.vehicleFee),
      activityFee: String(quote.activityFee),
      activityFlow: String(inputs.annualGrossFlow),
      totalAmount: String(total),
      status: total <= 0 ? "paid" : "pending",
    })
    .onConflictDoNothing()
    .returning();
  if (!invoice) {
    // Created at the same moment elsewhere (the unique index caught it).
    const raced = await tx.query.subscriptionInvoices.findFirst({
      where: and(eq(subscriptionInvoices.groupId, groupId), eq(subscriptionInvoices.periodStart, period.periodStart)),
    });
    return raced ? { invoice: raced, created: false } : null;
  }
  return { invoice, created: true };
}

/** Pays an invoice from the group's prepaid wallet. Locks the wallet row; refuses if the balance is short. */
export async function payInvoiceFromWallet(tx: Tx, groupId: number, invoiceId: number): Promise<{ error: string } | { ok: true }> {
  const invoice = await tx.query.subscriptionInvoices.findFirst({
    where: and(eq(subscriptionInvoices.id, invoiceId), eq(subscriptionInvoices.groupId, groupId)),
  });
  if (!invoice) return { error: "Invoice not found" };
  if (invoice.status === "paid") return { error: "This invoice is already paid" };

  const amount = Number(invoice.totalAmount);
  if (amount <= 0) {
    await tx.update(subscriptionInvoices).set({ status: "paid" }).where(eq(subscriptionInvoices.id, invoiceId));
    return { ok: true };
  }
  const [wallet] = await tx.select().from(groupWallets).where(eq(groupWallets.groupId, groupId)).for("update");
  if (!wallet || Number(wallet.balance) < amount) return { error: "Insufficient wallet balance" };

  const [payment] = await tx
    .insert(platformPayments)
    .values({ groupId, amount: String(amount), status: "paid", type: "subscription" })
    .returning();
  const [updatedWallet] = await tx
    .update(groupWallets)
    .set({ balance: sql`${groupWallets.balance} - ${amount}`, updatedAt: new Date() })
    .where(eq(groupWallets.groupId, groupId))
    .returning();
  await tx.insert(walletTransactions).values({
    groupId,
    type: "fee_deduction",
    amount: String(amount),
    balanceAfter: updatedWallet.balance,
    relatedPaymentId: payment.id,
    note: `Subscription invoice #${invoiceId} (${invoice.periodStart} – ${invoice.periodEnd})`,
  });
  await tx.update(subscriptionInvoices).set({ status: "paid", paymentId: payment.id }).where(eq(subscriptionInvoices.id, invoiceId));
  return { ok: true };
}
