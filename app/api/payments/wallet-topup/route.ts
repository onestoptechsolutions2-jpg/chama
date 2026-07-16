import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { platformPayments } from "@/lib/db/schema";
import { walletTopupSchema } from "@/lib/validation/payments";
import { normalizeKenyanPhone } from "@/lib/domain/payments";
import { triggerMpesaStkPush } from "@/lib/payments/intasend";

/**
 * Same shape as /api/payments/platform-fee — a session-gated Route Handler
 * sitting next to /api/payments/callback, which credits the wallet once
 * IntaSend confirms the payment (see that route). The wallet itself never
 * takes custody of anything beyond this prepaid fee-credit balance.
 */
export async function POST(req: Request) {
  const session = await requireRole("admin", "treasurer");
  const groupId = session.activeMembership.groupId;

  const body = await req.json().catch(() => null);
  const parsed = walletTopupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { amount, phone } = parsed.data;
  const normalizedPhone = normalizeKenyanPhone(phone);

  const payment = await withTenant(groupId, async (tx) => {
    const [payment] = await tx
      .insert(platformPayments)
      .values({
        groupId,
        amount: String(amount),
        phone: normalizedPhone,
        status: "pending",
        type: "wallet_topup",
      })
      .returning();
    return payment;
  });

  try {
    const stkResult = await triggerMpesaStkPush({
      amount,
      phoneNumber: normalizedPhone,
      apiRef: String(payment.id),
    });

    await withTenant(groupId, (tx) =>
      tx
        .update(platformPayments)
        .set({
          invoiceId: stkResult.invoice.invoice_id,
          mpesaReference: stkResult.invoice.mpesa_reference || null,
          updatedAt: new Date(),
        })
        .where(eq(platformPayments.id, payment.id)),
    );

    return NextResponse.json({ ok: true, paymentId: payment.id, amount });
  } catch (err) {
    await withTenant(groupId, (tx) =>
      tx
        .update(platformPayments)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(platformPayments.id, payment.id)),
    );
    const message = err instanceof Error ? err.message : "STK push failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
