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

export const createLoginSchema = z
  .object({
    email: optionalEmail,
    phone: optionalPhone,
    // Only needed when a new account is created; an existing account is linked as-is.
    password: z
      .string()
      .optional()
      .transform((v) => v || undefined)
      .refine((v) => v === undefined || v.length >= 8, "Password must be at least 8 characters"),
  })
  .refine((data) => data.email || data.phone, {
    message: "Email or phone is required",
    path: ["email"],
  });

export type CreateMemberInput = z.infer<typeof createMemberSchema>;
export type RecordContributionInput = z.infer<typeof recordContributionSchema>;
export type CreateLoginInput = z.infer<typeof createLoginSchema>;
