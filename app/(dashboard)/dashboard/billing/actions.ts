"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { billingPeriod, ensureMonthlyInvoice, payInvoiceFromWallet } from "@/lib/billing/invoices";

export type BillingActionState = { error: string } | { ok: true } | null;

/**
 * Generates this month's invoice now (it is also created automatically each
 * month by /api/cron/invoices — lib/billing/invoices.ts). Blocked when one
 * already exists for the period.
 */
export async function generateInvoiceAction(): Promise<{ error: string } | { ok: true; invoiceId: number }> {
  const session = await requirePermission("billing.invoice");
  const groupId = session.activeMembership.groupId;
  const result = await withTenant(groupId, async (tx) => {
    const r = await ensureMonthlyInvoice(tx, groupId, billingPeriod(), { force: true });
    if (!r) return { error: "Nothing to invoice" as const };
    if (!r.created) return { error: "An invoice for this period already exists" as const };
    return { ok: true as const, invoiceId: r.invoice.id };
  });
  if ("ok" in result) revalidatePath("/dashboard/billing");
  return result;
}

export async function chargeInvoiceFromWalletAction(
  invoiceId: number,
): Promise<{ error: string } | { ok: true }> {
  const session = await requirePermission("billing.pay");
  const groupId = session.activeMembership.groupId;
  const result = await withTenant(groupId, (tx) => payInvoiceFromWallet(tx, groupId, invoiceId));
  if ("ok" in result) {
    revalidatePath("/dashboard/billing");
    revalidatePath("/dashboard/wallet");
  }
  return result;
}
