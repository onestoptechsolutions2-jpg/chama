import "server-only";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { loanRepayments, loans } from "@/lib/db/schema";
import { selfDealingError } from "@/lib/auth/permissions";
import { nairobiToday } from "@/lib/domain/dates";
import { defineCommand, done, fail } from "./types";

/**
 * Money back in on a loan. The loan row is locked first so two repayments
 * recorded at once can't both read the old balance. Officials can't record
 * repayments on their own loan (maker–checker).
 */
export const recordLoanRepayment = defineCommand({
  name: "loans.recordRepayment",
  description: "Record a repayment against a member's active loan.",
  permission: "loans.manage",
  input: z.object({
    loanId: z.coerce.number().int().positive(),
    amount: z.coerce.number().positive("Amount must be greater than 0"),
    reference: z.string().trim().max(100).optional().transform((v) => v || undefined),
  }),
  run: async (tx, actor, input) => {
    const [loan] = await tx
      .select()
      .from(loans)
      .where(and(eq(loans.id, input.loanId), eq(loans.groupId, actor.groupId)))
      .for("update");
    if (!loan) return fail("Loan not found", 404);
    if (loan.status === "cleared") return fail("This loan is already fully repaid");
    const self = selfDealingError(actor.memberId, loan.memberId, "record a loan repayment");
    if (self) return fail(self, 403);

    await tx.insert(loanRepayments).values({
      groupId: actor.groupId,
      loanId: loan.id,
      amount: String(input.amount),
      reference: input.reference ?? null,
      recordedBy: actor.userId,
    });

    const remaining = Math.max(0, Number(loan.amountRemaining) - input.amount);
    const status = remaining <= 0 ? "cleared" : loan.status;
    await tx
      .update(loans)
      .set({
        amountRemaining: String(remaining),
        status,
        clearedDate: status === "cleared" ? nairobiToday() : loan.clearedDate,
        updatedAt: new Date(),
      })
      .where(eq(loans.id, loan.id));
    return done({ loanId: loan.id, memberId: loan.memberId, remaining, cleared: status === "cleared" });
  },
});
