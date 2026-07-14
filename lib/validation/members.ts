import { z } from "zod";

export const createMemberSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim().optional().or(z.literal("")),
  email: z.string().trim().email().optional().or(z.literal("")),
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
    email: z.string().trim().email().optional().or(z.literal("")),
    phone: z
      .string()
      .trim()
      .regex(/^0\d{9}$/, "Phone must be a 10-digit number starting with 0")
      .optional()
      .or(z.literal("")),
    password: z.string().min(6, "Password must be at least 6 characters"),
  })
  .refine((data) => data.email || data.phone, {
    message: "Email or phone is required",
    path: ["email"],
  });

export type CreateMemberInput = z.infer<typeof createMemberSchema>;
export type RecordContributionInput = z.infer<typeof recordContributionSchema>;
export type CreateLoginInput = z.infer<typeof createLoginSchema>;
