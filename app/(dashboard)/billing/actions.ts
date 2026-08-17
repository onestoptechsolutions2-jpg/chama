"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { subscriptionInvoices, platformPayments, groupWallets, walletTransactions } from "@/lib/db/schema";
import { computeSubscriptionQuote } from "@/lib/domain/billing";
import { computeGroupBillingInputs } from "./data";

export type BillingActionState = { error: string } | { ok: true } | null;

/**
 * `date.toISOString().split("T")[0]` converts through UTC first — in a
 * timezone ahead of UTC (e.g. Africa/Nairobi, UTC+3) that silently shifts a
 * locally-constructed calendar date backward by a day (the exact bug class
 * documented in docs/architecture.md's Phase 5 notes, bug #2, for contribution
 * due dates). Formatting from the Date's own local components instead —
 * same fix already used in app/api/cron/contribution-dues/route.ts —
 * avoids the UTC round-trip entirely.
 */
function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Computes this period's quote and freezes it into a new subscription_invoices
 * row (status: pending) — no charge is triggered here. Deliberately a manual
 * trigger, same honesty as the existing MGR-fee flow: nothing in this app
 * bills automatically yet (see docs/architecture.md's billing roadmap note).
 * One admin-visible period per calendar month; calling this again mid-month
 * doesn't duplicate — it's blocked while an invoice for the current period
 * already exists.
 */
export async function generateInvoiceAction(): Promise<{ error: string } | { ok: true; invoiceId: number }> {
  const session = await requireRole("admin");
  const groupId = session.activeMembership.groupId;

  const now = new Date();
  const periodStart = toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));
  const periodEnd = toLocalDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  const result = await withTenant(groupId, async (tx) => {
    const existing = await tx.query.subscriptionInvoices.findFirst({
      where: and(
        eq(subscriptionInvoices.groupId, groupId),
        eq(subscriptionInvoices.periodStart, periodStart),
      ),
    });
    if (existing) return { error: "An invoice for this period already exists" as const };

    const inputs = await computeGroupBillingInputs(tx, groupId);
    const quote = computeSubscriptionQuote(inputs);

    const [invoice] = await tx
      .insert(subscriptionInvoices)
      .values({
        groupId,
        periodStart,
        periodEnd,
        billingCycle: "monthly",
        memberCount: inputs.activeMembers,
        memberFee: String(quote.memberFee),
        vehicleFee: String(quote.vehicleFee),
        activityFee: String(quote.activityFee),
        activityFlow: String(inputs.annualGrossFlow),
        totalAmount: String(quote.totalAnnual === 0 ? 0 : quote.totalMonthly),
        status: "pending",
      })
      .returning();

    return { ok: true as const, invoiceId: invoice.id };
  });

  if ("ok" in result) {
    revalidatePath("/billing");
  }
  return result;
}

export async function chargeInvoiceFromWalletAction(
  invoiceId: number,
): Promise<{ error: string } | { ok: true }> {
  const session = await requireRole("admin", "treasurer");
  const groupId = session.activeMembership.groupId;

  const result = await withTenant(groupId, async (tx) => {
    const invoice = await tx.query.subscriptionInvoices.findFirst({
      where: and(eq(subscriptionInvoices.id, invoiceId), eq(subscriptionInvoices.groupId, groupId)),
    });
    if (!invoice) return { error: "Invoice not found" as const };
    if (invoice.status === "paid") return { error: "This invoice is already paid" as const };

    const amount = Number(invoice.totalAmount);
    if (amount <= 0) {
      await tx
        .update(subscriptionInvoices)
        .set({ status: "paid" })
        .where(eq(subscriptionInvoices.id, invoiceId));
      return { ok: true as const };
    }

    const [wallet] = await tx
      .select()
      .from(groupWallets)
      .where(eq(groupWallets.groupId, groupId))
      .for("update");
    if (!wallet || Number(wallet.balance) < amount) {
      return { error: "Insufficient wallet balance" as const };
    }

    const [payment] = await tx
      .insert(platformPayments)
      .values({
        groupId,
        amount: String(amount),
        status: "paid",
        type: "subscription",
      })
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

    await tx
      .update(subscriptionInvoices)
      .set({ status: "paid", paymentId: payment.id })
      .where(eq(subscriptionInvoices.id, invoiceId));

    return { ok: true as const };
  });

  if ("ok" in result) {
    revalidatePath("/billing");
    revalidatePath("/wallet");
  }
  return result;
}
