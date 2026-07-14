import { z } from "zod";

export const mgrFrequencies = ["weekly", "biweekly", "monthly"] as const;

export const updateMgrConfigSchema = z.object({
  mgrFrequency: z.enum(mgrFrequencies),
  mgrRecipientsPerCycle: z.coerce.number().int().positive(),
  mgrStartDate: z.string().trim().optional(),
  mgrContributionAmount: z.coerce.number().nonnegative().optional(),
});

export const setTurnsSchema = z.object({
  memberId: z.coerce.number().int().positive(),
  turnsTotal: z.coerce.number().int().min(1),
});

export const signAgreementSchema = z.object({
  platformTerms: z.literal("on"),
  groupTerms: z.literal("on"),
  financialAcknowledged: z.literal("on"),
  digitalSignature: z.string().trim().min(1, "Type your full name to sign"),
});

export type UpdateMgrConfigInput = z.infer<typeof updateMgrConfigSchema>;
export type SetTurnsInput = z.infer<typeof setTurnsSchema>;
export type SignAgreementInput = z.infer<typeof signAgreementSchema>;
