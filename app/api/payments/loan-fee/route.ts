import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { loans, platformPayments } from "@/lib/db/schema";
import { triggerLoanFeeSchema } from "@/lib/validation/payments";
import { computeTransactionFee } from "@/lib/domain/billing";
import { normalizeKenyanPhone } from "@/lib/domain/payments";
import { triggerMpesaStkPush } from "@/lib/payments/intasend";

/**
 * Same shape as /api/payments/platform-fee — a session-gated Route Handler
 * sitting next to /api/payments/callback, triggered by our own UI (the
 * loan disbursement principal itself moves outside the app; this charges
 * the platform's separate service fee for tracking/processing it).
 */
export async function POST(req: Request) {
  const session = await requireRole("admin");
  const groupId = session.activeMembership.groupId;

  const body = await req.json().catch(() => null);
  const parsed = triggerLoanFeeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { loanId, phone } = parsed.data;

  const result = await withTenant(groupId, async (tx) => {
    const loan = await tx.query.loans.findFirst({
      where: and(eq(loans.id, loanId), eq(loans.groupId, groupId)),
    });
    if (!loan) return { error: "Loan not found" as const };

    const existingFee = await tx.query.platformPayments.findFirst({
      where: and(
        eq(platformPayments.loanId, loanId),
        eq(platformPayments.type, "loan_fee"),
        eq(platformPayments.status, "paid"),
      ),
    });
    if (existingFee) {
      return { error: "This loan's disbursement fee has already been charged" as const };
    }

    const fee = computeTransactionFee("loan_disbursement", Number(loan.principal));
    const normalizedPhone = normalizeKenyanPhone(phone);

    const [payment] = await tx
      .insert(platformPayments)
      .values({
        groupId,
        loanId,
        amount: String(fee),
        phone: normalizedPhone,
        status: "pending",
        type: "loan_fee",
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
