import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { groups, mgrSlots, platformPayments } from "@/lib/db/schema";
import { triggerPlatformFeeSchema } from "@/lib/validation/payments";
import { calcPlatformFee, normalizeKenyanPhone } from "@/lib/domain/payments";
import { triggerMpesaStkPush } from "@/lib/payments/intasend";

/**
 * Session-gated (admin only) — IntaSend never calls this one, only our own
 * UI, so this could have been a Server Action. It's a Route Handler instead
 * purely to sit next to /api/payments/callback under one /api/payments/*
 * surface; the auth model is identical to any other admin-only Server
 * Action (requireRole, no separate API key).
 */
export async function POST(req: Request) {
  const session = await requireRole("admin");
  const groupId = session.activeMembership.groupId;

  const body = await req.json().catch(() => null);
  const parsed = triggerPlatformFeeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { mgrSlotId, phone } = parsed.data;

  const result = await withTenant(groupId, async (tx) => {
    const slot = await tx.query.mgrSlots.findFirst({
      where: eq(mgrSlots.id, mgrSlotId),
    });
    if (!slot || slot.groupId !== groupId) {
      return { error: "Slot not found" as const };
    }
    if (!slot.payoutAmount) {
      return { error: "Slot has no payout amount set" as const };
    }

    const group = await tx.query.groups.findFirst({ where: eq(groups.id, groupId) });
    if (!group) return { error: "Group not found" as const };

    const feePct = Number(group.mgrFeePct);
    const fee = calcPlatformFee(Number(slot.payoutAmount), feePct);
    const normalizedPhone = normalizeKenyanPhone(phone);

    const [payment] = await tx
      .insert(platformPayments)
      .values({
        groupId,
        mgrSlotId,
        amount: String(fee),
        feePct: String(feePct),
        phone: normalizedPhone,
        status: "pending",
        type: "mgr_fee",
      })
      .returning();

    return { payment, fee, normalizedPhone };
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const { payment, fee, normalizedPhone } = result;

  try {
    const stkResult = await triggerMpesaStkPush({
      amount: fee,
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

    return NextResponse.json({ ok: true, paymentId: payment.id, fee });
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
