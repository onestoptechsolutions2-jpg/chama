import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { subscriptionInvoices, platformPayments } from "@/lib/db/schema";
import { triggerSubscriptionInvoiceSchema } from "@/lib/validation/payments";
import { normalizeKenyanPhone } from "@/lib/domain/payments";
import { triggerMpesaStkPush } from "@/lib/payments/intasend";

/**
 * Same shape as /api/payments/platform-fee and /loan-fee — charges an
 * already-generated (see generateInvoiceAction), still-pending
 * subscription_invoices row via M-Pesa STK push.
 */
export async function POST(req: Request) {
  const session = await requireRole("admin", "treasurer");
  const groupId = session.activeMembership.groupId;

  const body = await req.json().catch(() => null);
  const parsed = triggerSubscriptionInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { invoiceId, phone } = parsed.data;

  const result = await withTenant(groupId, async (tx) => {
    const invoice = await tx.query.subscriptionInvoices.findFirst({
      where: and(eq(subscriptionInvoices.id, invoiceId), eq(subscriptionInvoices.groupId, groupId)),
    });
    if (!invoice) return { error: "Invoice not found" as const };
    if (invoice.status === "paid") return { error: "This invoice is already paid" as const };

    const amount = Number(invoice.totalAmount);
    if (amount <= 0) return { error: "This invoice has nothing owing" as const };

    const normalizedPhone = normalizeKenyanPhone(phone);

    const [payment] = await tx
      .insert(platformPayments)
      .values({
        groupId,
        amount: String(amount),
        phone: normalizedPhone,
        status: "pending",
        type: "subscription",
      })
      .returning();

    await tx
      .update(subscriptionInvoices)
      .set({ paymentId: payment.id })
      .where(eq(subscriptionInvoices.id, invoiceId));

    return { payment, amount, normalizedPhone };
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const { payment, amount, normalizedPhone } = result;

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
