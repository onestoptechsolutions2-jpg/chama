"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { groups } from "@/lib/db/schema";
import { PAYMENT_PURPOSES, parsePaymentCsv } from "@/lib/domain/payment-matching";
import { runCommand } from "@/lib/commands/run";
import { actorFromSession } from "@/lib/commands/actor";
import { assignPayment, ignorePayment, importPayments } from "@/lib/commands/payments";

export type PaymentsState = { error?: string; message?: string } | null;

const setupSchema = z.object({
  paybillNumber: z
    .string()
    .trim()
    .regex(/^\d{5,7}$/, "A paybill or till number is 5–7 digits")
    .optional()
    .or(z.literal("")),
  paymentDefaultType: z.enum(PAYMENT_PURPOSES as [string, ...string[]]),
});

/** Paybill/till number and what an unlabelled payment counts as; creates the M-Pesa link on first save. */
export async function savePaymentSetupAction(_prev: PaymentsState, formData: FormData): Promise<PaymentsState> {
  const session = await requirePermission("settings.manage");
  const parsed = setupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const groupId = session.activeMembership.groupId;
  await withTenant(groupId, async (tx) => {
    const group = await tx.query.groups.findFirst({ where: eq(groups.id, groupId), columns: { c2bToken: true } });
    await tx
      .update(groups)
      .set({
        paybillNumber: parsed.data.paybillNumber || null,
        paymentDefaultType: parsed.data.paymentDefaultType,
        c2bToken: group?.c2bToken ?? randomBytes(24).toString("base64url"),
        updatedAt: new Date(),
      })
      .where(eq(groups.id, groupId));
  });
  revalidatePath("/dashboard/payments");
  return { message: "Saved." };
}

/** New M-Pesa link (the old one stops working) — if the link was shared by mistake. */
export async function rotateMpesaLinkAction(): Promise<void> {
  const session = await requirePermission("settings.manage");
  const groupId = session.activeMembership.groupId;
  await withTenant(groupId, (tx) =>
    tx.update(groups).set({ c2bToken: randomBytes(24).toString("base64url") }).where(eq(groups.id, groupId)),
  );
  revalidatePath("/dashboard/payments");
}

export async function importPaymentsAction(_prev: PaymentsState, formData: FormData): Promise<PaymentsState> {
  const session = await requirePermission("money.record");
  const file = formData.get("file");
  const source = formData.get("source") === "checkoff" ? "checkoff" : "bank";
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file" };
  if (file.size > 5_000_000) return { error: "The file must be smaller than 5 MB" };
  const parsed = parsePaymentCsv(await file.text(), `${source}:${file.name}`);
  if ("error" in parsed) return { error: parsed.error };

  const result = await runCommand(actorFromSession(session), importPayments, {
    payments: parsed.rows.map((r) => ({ ...r, source })),
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/dashboard/payments");
  const { matched, unmatched, duplicate } = result.data;
  return {
    message: `${matched} recorded automatically, ${unmatched} need you to match them${duplicate ? `, ${duplicate} were already imported` : ""}.`,
  };
}

export async function assignPaymentAction(paymentId: number, memberId: number, purpose: string): Promise<{ error: string } | null> {
  const session = await requirePermission("money.record");
  const result = await runCommand(actorFromSession(session), assignPayment, { paymentId, memberId, purpose });
  revalidatePath("/dashboard/payments");
  return result.ok ? null : { error: result.error };
}

export async function ignorePaymentAction(paymentId: number): Promise<{ error: string } | null> {
  const session = await requirePermission("money.record");
  const result = await runCommand(actorFromSession(session), ignorePayment, { paymentId });
  revalidatePath("/dashboard/payments");
  return result.ok ? null : { error: result.error };
}
