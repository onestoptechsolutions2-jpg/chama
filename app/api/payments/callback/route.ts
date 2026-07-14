import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withPlatformAdmin } from "@/lib/db/rls";
import { platformPayments, paymentWebhookEvents } from "@/lib/db/schema";
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
  await withPlatformAdmin((tx) =>
    tx
      .update(platformPayments)
      .set({ status, updatedAt: new Date() })
      .where(eq(platformPayments.invoiceId, payload.invoice_id)),
  );

  return NextResponse.json({ ok: true });
}
