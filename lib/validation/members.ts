import { z } from "zod";
import { optionalEmail, optionalPhone } from "./identity";

export const createMemberSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: optionalPhone,
  email: optionalEmail,
  idNumber: z.string().trim().optional().or(z.literal("")),
  capital: z.coerce.number().nonnegative().default(0),
  security: z.coerce.number().nonnegative().default(0),
});

export const contributionTypes = [
  "capital",
  "security",
  "personal_savings",
  "welfare",
] as const;

export const recordContributionSchema = z.object({
  memberId: z.coerce.number().int().positive(),
  type: z.enum(contributionTypes),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  reference: z.string().trim().optional().or(z.literal("")),
  notes: z.string().trim().optional().or(z.literal("")),
});

export type CreateMemberInput = z.infer<typeof createMemberSchema>;
export type RecordContributionInput = z.infer<typeof recordContributionSchema>;
