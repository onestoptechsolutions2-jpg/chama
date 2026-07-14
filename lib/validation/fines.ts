import { z } from "zod";

export const fineTypes = [
  "lateness",
  "absence",
  "rule_violation",
  "loan_default",
  "other",
] as const;

export const createFineSchema = z.object({
  memberId: z.coerce.number().int().positive(),
  type: z.enum(fineTypes),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  reason: z.string().trim().optional().or(z.literal("")),
});

export type CreateFineInput = z.infer<typeof createFineSchema>;
