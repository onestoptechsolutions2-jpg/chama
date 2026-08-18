import { z } from "zod";

export const welfareClaimTypes = [
  "medical",
  "bereavement",
  "emergency",
  "education",
  "maternity",
  "disability",
  "other",
] as const;

export const welfareReserves = ["emergency", "long_term", "advance"] as const;

/**
 * The unified "Request Help" submission — replaces submitClaimSchema. Can
 * carry any combination of the three amounts (the hybrid-assistance
 * mechanism); at least one must be positive.
 */
export const submitWelfareRequestSchema = z
  .object({
    reason: z.enum(welfareClaimTypes),
    beneficiaryName: z.string().trim().optional(),
    beneficiaryRel: z.string().trim().optional(),
    description: z.string().trim().optional(),
    requestedEmergencyAmount: z.coerce.number().nonnegative().default(0),
    requestedLongTermAmount: z.coerce.number().nonnegative().default(0),
    requestedAdvanceAmount: z.coerce.number().nonnegative().default(0),
  })
  .refine(
    (v) => v.requestedEmergencyAmount + v.requestedLongTermAmount + v.requestedAdvanceAmount > 0,
    { message: "Request at least one type of assistance", path: ["requestedEmergencyAmount"] },
  );

/** tier1-only: a single staff member's decision (replaces reviewClaimSchema). */
export const reviewWelfareRequestSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  approvedEmergencyAmount: z.coerce.number().nonnegative().optional(),
  approvedLongTermAmount: z.coerce.number().nonnegative().optional(),
  approvedAdvanceAmount: z.coerce.number().nonnegative().optional(),
  rejectionReason: z.string().trim().optional(),
});

export const respondToWelfareApprovalSchema = z.object({
  decision: z.enum(["accepted", "declined"]),
  comment: z.string().trim().optional(),
});

export const recordAdvanceRepaymentSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  reference: z.string().trim().optional(),
});

export const allocateToWelfareFundSchema = z.object({
  reserve: z.enum(welfareReserves),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  note: z.string().trim().optional(),
});

export type SubmitWelfareRequestInput = z.infer<typeof submitWelfareRequestSchema>;
export type ReviewWelfareRequestInput = z.infer<typeof reviewWelfareRequestSchema>;
export type RespondToWelfareApprovalInput = z.infer<typeof respondToWelfareApprovalSchema>;
export type RecordAdvanceRepaymentInput = z.infer<typeof recordAdvanceRepaymentSchema>;
export type AllocateToWelfareFundInput = z.infer<typeof allocateToWelfareFundSchema>;
