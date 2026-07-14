import { z } from "zod";
import { MIN_LOAN_AMOUNT } from "@/lib/domain/constants";

export const repaymentMonthsOptions = [3, 6, 9, 12] as const;

export const applyForLoanSchema = z.object({
  amountRequested: z.coerce
    .number()
    .min(MIN_LOAN_AMOUNT, `Minimum loan amount is Ksh ${MIN_LOAN_AMOUNT}`),
  purpose: z.string().trim().optional(),
  repaymentMonths: z.coerce.number().int().positive(),
});

export const createLoanSchema = z.object({
  memberId: z.coerce.number().int().positive(),
  principal: z.coerce
    .number()
    .min(MIN_LOAN_AMOUNT, `Minimum loan amount is Ksh ${MIN_LOAN_AMOUNT}`),
  purpose: z.string().trim().optional(),
});

export const recordRepaymentSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  reference: z.string().trim().optional(),
});

export const reviewApplicationSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  reviewNotes: z.string().trim().optional(),
});

export type ApplyForLoanInput = z.infer<typeof applyForLoanSchema>;
export type CreateLoanInput = z.infer<typeof createLoanSchema>;
export type RecordRepaymentInput = z.infer<typeof recordRepaymentSchema>;
export type ReviewApplicationInput = z.infer<typeof reviewApplicationSchema>;
