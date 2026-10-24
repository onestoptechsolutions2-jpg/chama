import { NextResponse } from "next/server";
import { withPlatformAdmin } from "@/lib/db/rls";
import { paymentWebhookEvents } from "@/lib/db/schema";
import { isValidIntasendChallenge } from "@/lib/domain/payments";
import { settlePayout } from "@/lib/payments/payouts";

/**
 * Public — IntaSend's send-money events for group-wallet withdrawals (the
 * callback_url given when a payout is sent). Sent every time the payout's
 * status changes; verified by the shared `challenge`, logged first like the
 * collections webhook, then settled (lib/payments/payouts.ts).
 */
export async function POST(req: Request) {
  const payload = (await req.json().catch(() => null)) as
    | ({ tracking_id?: string; challenge?: string } & Parameters<typeof settlePayout>[1])
    | null;
  if (!payload) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const verified = isValidIntasendChallenge(payload);
  await withPlatformAdmin((tx) =>
    tx.insert(paymentWebhookEvents).values({ provider: "intasend-payout", invoiceId: payload.tracking_id ?? null, payload, challengeValid: verified }),
  );
  if (!verified) return NextResponse.json({ error: "Invalid challenge" }, { status: 401 });
  if (payload.tracking_id) await settlePayout(payload.tracking_id, payload);
  return NextResponse.json({ ok: true });
}
