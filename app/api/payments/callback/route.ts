import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { withPlatformAdmin } from "@/lib/db/rls";
import {
  platformPayments,
  paymentWebhookEvents,
  groupWallets,
  walletTransactions,
} from "@/lib/db/schema";
import { isValidIntasendChallenge } from "@/lib/domain/payments";
import type { IntasendWebhookPayload } from "@/lib/payments/intasend";

/**
 * Public — IntaSend calls this directly, it can't authenticate like a
 * normal session user. Verification is the `challenge` field equality
 * check (lib/domain/payments.ts), not an HMAC signature — that's genuinely
 * how IntaSend's webhooks work, not a shortcut taken here.
 *
 * Can't run through withTenant() because we don't know which tenant the
 * payload belongs to until we've looked up the payment by invoice_id — it
 * uses withPlatformAdmin() instead, the same RLS escape hatch the
 * super-admin surface uses, for the same reason (genuinely cross-tenant by
 * nature, not just "forgot to scope it").
 */
export async function POST(req: Request) {
  const payload = (await req.json().catch(() => null)) as IntasendWebhookPayload | null;
  if (!payload) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const verified = isValidIntasendChallenge(payload);

  // Log every attempt — valid or not — before doing anything else. An
  // invalid-challenge event is itself worth a permanent record (it's either
  // a misconfiguration or a spoofing attempt).
  await withPlatformAdmin((tx) =>
    tx.insert(paymentWebhookEvents).values({
      provider: "intasend",
      invoiceId: payload.invoice_id ?? null,
      payload,
      challengeValid: verified,
    }),
  );

  if (!verified) {
    return NextResponse.json({ error: "Invalid challenge" }, { status: 401 });
  }

  const status =
    payload.state === "COMPLETE" ? "paid" : payload.state === "FAILED" ? "failed" : "pending";

  // Note: unlike the STK-push response (which includes invoice.mpesa_reference),
  // IntaSend's webhook payload itself doesn't carry an M-Pesa receipt
  // number — only state/invoice_id/api_ref/account (the payer's identifier).
  // mpesaReference is set (if ever) from the original trigger response, not here.
  //
  // Wallet crediting happens in the same transaction as the status update,
  // gated on the row's PREVIOUS status (fetched with FOR UPDATE) rather than
  // just "status === paid" — IntaSend can and does resend the same webhook,
  // and without this guard a resend would double-credit the wallet.
  await withPlatformAdmin(async (tx) => {
    const [existing] = await tx
      .select()
      .from(platformPayments)
      .where(eq(platformPayments.invoiceId, payload.invoice_id))
      .for("update");
    if (!existing) return;

    await tx
      .update(platformPayments)
      .set({ status, updatedAt: new Date() })
      .where(eq(platformPayments.invoiceId, payload.invoice_id));

    if (existing.type === "wallet_topup" && status === "paid" && existing.status !== "paid") {
      const [wallet] = await tx
        .insert(groupWallets)
        .values({ groupId: existing.groupId, balance: existing.amount })
        .onConflictDoUpdate({
          target: groupWallets.groupId,
          set: {
            balance: sql`${groupWallets.balance} + ${existing.amount}`,
            updatedAt: new Date(),
          },
        })
        .returning();

      await tx.insert(walletTransactions).values({
        groupId: existing.groupId,
        type: "topup",
        amount: existing.amount,
        balanceAfter: wallet.balance,
        relatedPaymentId: existing.id,
        note: "M-Pesa top-up",
      });
    }
  });

  return NextResponse.json({ ok: true });
}
