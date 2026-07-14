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

export const submitClaimSchema = z.object({
  claimType: z.enum(welfareClaimTypes),
  amountRequested: z.coerce.number().positive("Amount must be greater than 0"),
  beneficiaryName: z.string().trim().optional(),
  beneficiaryRel: z.string().trim().optional(),
  description: z.string().trim().optional(),
});

export const reviewClaimSchema = z.object({
  decision: z.enum(["under_review", "approved", "rejected", "disbursed"]),
  amountApproved: z.coerce.number().positive().optional(),
  rejectionReason: z.string().trim().optional(),
});

export type SubmitClaimInput = z.infer<typeof submitClaimSchema>;
export type ReviewClaimInput = z.infer<typeof reviewClaimSchema>;
