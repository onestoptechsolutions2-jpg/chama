import { z } from "zod";

/**
 * Zod only enforces "a real positive amount" here — the actual configurable
 * floor is the group's own `minLoanAmount`, checked in the action (where
 * `group` is already fetched) against `Number(group.minLoanAmount)`. This
 * used to be a hardcoded MIN_LOAN_AMOUNT=1000 applied identically to every
 * group; see docs/architecture.md's hardcoded-values sweep.
 */
export const repaymentMonthsOptions = [3, 6, 9, 12] as const;

export const applyForLoanSchema = z.object({
  amountRequested: z.coerce.number().positive("Amount must be greater than 0"),
  purpose: z.string().trim().optional(),
  repaymentMonths: z.coerce.number().int().positive(),
});

export const createLoanSchema = z.object({
  memberId: z.coerce.number().int().positive(),
  principal: z.coerce.number().positive("Amount must be greater than 0"),
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

export const respondToGuaranteeRequestSchema = z.object({
  decision: z.enum(["accepted", "declined"]),
});

export type ApplyForLoanInput = z.infer<typeof applyForLoanSchema>;
export type CreateLoanInput = z.infer<typeof createLoanSchema>;
export type RecordRepaymentInput = z.infer<typeof recordRepaymentSchema>;
export type ReviewApplicationInput = z.infer<typeof reviewApplicationSchema>;
export type RespondToGuaranteeRequestInput = z.infer<typeof respondToGuaranteeRequestSchema>;
