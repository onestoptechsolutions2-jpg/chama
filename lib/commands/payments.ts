import "server-only";
import { z } from "zod";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import { groups, incomingPayments, loans, members } from "@/lib/db/schema";
import { matchPayment, PAYMENT_PURPOSES, type PaymentPurpose } from "@/lib/domain/payment-matching";
import { announce, applyContribution, loadGroup, type RecordedContribution } from "./contributions";
import { applyRepayment } from "./loans";
import { defineCommand, done, fail, type Actor, type CommandResult } from "./types";

const OPEN_LOAN = ["active", "extended", "overdue"] as const;

const paymentSchema = z.object({
  source: z.enum(["mpesa", "bank", "checkoff"]),
  externalId: z.string().trim().min(1).max(120),
  amount: z.coerce.number().positive(),
  payerPhone: z.string().trim().max(40).nullish(),
  payerName: z.string().trim().max(200).nullish(),
  accountRef: z.string().trim().max(300).nullish(),
  receivedAt: z.coerce.date(),
  raw: z.unknown().optional(),
});
type PaymentInput = z.infer<typeof paymentSchema>;

type Applied =
  | { kind: "contribution"; contribution: RecordedContribution }
  | { kind: "loan"; loanId: number };

/** Records the money against the member: a contribution, or a repayment on their oldest open loan. */
async function applyToMember(
  tx: Tx,
  actor: Actor,
  group: typeof groups.$inferSelect,
  memberId: number,
  purpose: PaymentPurpose,
  amount: number,
  reference: string,
): Promise<CommandResult<Applied>> {
  if (purpose === "loan") {
    if (!actor.products.loans) return fail("Loans are switched off for this group");
    const loan = await tx.query.loans.findFirst({
      where: and(eq(loans.groupId, actor.groupId), eq(loans.memberId, memberId), inArray(loans.status, [...OPEN_LOAN])),
      orderBy: [asc(loans.createdAt)],
    });
    if (!loan) return fail("This member has no open loan to repay");
    const r = await applyRepayment(tx, actor, { loanId: loan.id, amount, reference });
    return r.ok ? done({ kind: "loan", loanId: loan.id }) : r;
  }
  const c = await applyContribution(tx, actor, group, { memberId, type: purpose, amount, reference, notes: undefined });
  return c.ok ? done({ kind: "contribution", contribution: c.data }) : c;
}

type Outcome = "matched" | "unmatched" | "duplicate";

/** Stores one incoming payment (once — duplicates are ignored) and applies it when the member is clear. */
async function receiveOne(
  tx: Tx,
  actor: Actor,
  group: typeof groups.$inferSelect,
  roster: { id: number; memberNumber: string | null; phone: string | null }[],
  p: PaymentInput,
  receipts: RecordedContribution[],
): Promise<Outcome> {
  const [row] = await tx
    .insert(incomingPayments)
    .values({
      groupId: actor.groupId,
      source: p.source,
      externalId: p.externalId,
      amount: String(p.amount),
      payerPhone: p.payerPhone ?? null,
      payerName: p.payerName ?? null,
      accountRef: p.accountRef ?? null,
      receivedAt: p.receivedAt,
      raw: (p.raw ?? null) as object | null,
    })
    .onConflictDoNothing()
    .returning({ id: incomingPayments.id });
  if (!row) return "duplicate";

  const defaultPurpose = (PAYMENT_PURPOSES as string[]).includes(group.paymentDefaultType)
    ? (group.paymentDefaultType as PaymentPurpose)
    : "capital";
  const match = matchPayment(
    { accountRef: p.accountRef ?? null, payerPhone: p.payerPhone ?? null },
    roster,
    defaultPurpose,
    { scanNarration: p.source === "bank" },
  );
  if (!match) return "unmatched";

  // A savepoint, so a payment that can't be applied (e.g. "loan" with no
  // open loan) stays in the inbox instead of failing the whole batch.
  const applied = await tx
    .transaction(async (sp) => {
      const r = await applyToMember(sp, actor, group, match.memberId, match.purpose, p.amount, p.externalId);
      if (!r.ok) throw new Error(r.error);
      return r.data;
    })
    .catch(() => null);
  if (!applied) return "unmatched";

  await tx
    .update(incomingPayments)
    .set({
      status: "matched",
      memberId: match.memberId,
      appliedAs: match.purpose,
      contributionId: applied.kind === "contribution" ? applied.contribution.contributionId : null,
      loanId: applied.kind === "loan" ? applied.loanId : null,
    })
    .where(eq(incomingPayments.id, row.id));
  if (applied.kind === "contribution") receipts.push(applied.contribution);
  return "matched";
}

async function loadRoster(tx: Tx, groupId: number) {
  return tx
    .select({ id: members.id, memberNumber: members.memberNumber, phone: members.phone })
    .from(members)
    .where(and(eq(members.groupId, groupId), eq(members.active, true)));
}

/** One payment from M-Pesa (paybill/till confirmation). */
export const receivePayment = defineCommand({
  name: "payments.receive",
  description: "Store an incoming M-Pesa/bank payment and record it against the member it names.",
  permission: "money.record",
  input: paymentSchema,
  run: async (tx, actor, input) => {
    const group = await loadGroup(tx, actor.groupId);
    if (!group) return fail("Group not found", 404);
    const receipts: RecordedContribution[] = [];
    const outcome = await receiveOne(tx, actor, group, await loadRoster(tx, actor.groupId), input, receipts);
    return done({ outcome, receipts });
  },
  afterCommit: (actor, _input, data) => announce(actor, data.receipts),
});

/** A bank statement or payroll check-off file — all rows in one go, re-uploads are harmless. */
export const importPayments = defineCommand({
  name: "payments.import",
  description: "Import a bank statement or payroll check-off file and match each payment to a member.",
  permission: "money.record",
  input: z.object({ payments: z.array(paymentSchema).min(1).max(5000) }),
  run: async (tx, actor, input) => {
    const group = await loadGroup(tx, actor.groupId);
    if (!group) return fail("Group not found", 404);
    const roster = await loadRoster(tx, actor.groupId);
    const receipts: RecordedContribution[] = [];
    const counts = { matched: 0, unmatched: 0, duplicate: 0 };
    for (const p of input.payments) counts[await receiveOne(tx, actor, group, roster, p, receipts)]++;
    return done({ ...counts, receipts });
  },
  afterCommit: (actor, _input, data) => announce(actor, data.receipts),
});

/** A person matches an inbox payment the rules couldn't. */
export const assignPayment = defineCommand({
  name: "payments.assign",
  description: "Match an unmatched incoming payment to a member and record it.",
  permission: "money.record",
  input: z.object({
    paymentId: z.coerce.number().int().positive(),
    memberId: z.coerce.number().int().positive(),
    purpose: z.enum(PAYMENT_PURPOSES as [PaymentPurpose, ...PaymentPurpose[]]),
  }),
  run: async (tx, actor, input) => {
    const [payment] = await tx
      .select()
      .from(incomingPayments)
      .where(and(eq(incomingPayments.id, input.paymentId), eq(incomingPayments.groupId, actor.groupId)))
      .for("update");
    if (!payment) return fail("Payment not found", 404);
    if (payment.status !== "unmatched") return fail("This payment is already handled");
    const group = await loadGroup(tx, actor.groupId);
    if (!group) return fail("Group not found", 404);
    const applied = await applyToMember(tx, actor, group, input.memberId, input.purpose, Number(payment.amount), payment.externalId);
    if (!applied.ok) return applied;
    await tx
      .update(incomingPayments)
      .set({
        status: "matched",
        memberId: input.memberId,
        appliedAs: input.purpose,
        matchedBy: actor.userId,
        contributionId: applied.data.kind === "contribution" ? applied.data.contribution.contributionId : null,
        loanId: applied.data.kind === "loan" ? applied.data.loanId : null,
      })
      .where(eq(incomingPayments.id, payment.id));
    return done({ receipts: applied.data.kind === "contribution" ? [applied.data.contribution] : [] });
  },
  afterCommit: (actor, _input, data) => announce(actor, data.receipts),
});

/** Not group money (e.g. a wrong number) — park it, it stays on record. */
export const ignorePayment = defineCommand({
  name: "payments.ignore",
  description: "Mark an incoming payment as not belonging to any member.",
  permission: "money.record",
  input: z.object({ paymentId: z.coerce.number().int().positive() }),
  run: async (tx, actor, input) => {
    const updated = await tx
      .update(incomingPayments)
      .set({ status: "ignored", matchedBy: actor.userId })
      .where(and(eq(incomingPayments.id, input.paymentId), eq(incomingPayments.groupId, actor.groupId), eq(incomingPayments.status, "unmatched")))
      .returning({ id: incomingPayments.id });
    return updated.length ? done({ paymentId: input.paymentId }) : fail("Payment not found or already handled");
  },
});
