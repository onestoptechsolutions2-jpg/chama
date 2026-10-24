import { z } from "zod";
import { payoutDestinationSchema } from "./payout";

export const createFundSchema = z.object({
  ref: z.string().trim().min(1).max(100),
  deceasedName: z.string().trim().min(2).max(120),
  name: z.string().trim().max(120).optional(),
  /** Defaults to DEFAULT_FUND_DAYS from today. */
  closesOn: z.string().trim().optional(),
  targetKes: z.coerce.number().int().positive().max(100_000_000).optional(),
  committee: z
    .array(z.object({ name: z.string().trim().min(2).max(80), phone: z.string().trim(), role: z.enum(["chair", "treasurer", "secretary"]) }))
    .min(1)
    .max(3),
  branches: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  payout: payoutDestinationSchema.optional(),
  webhookUrl: z
    .string()
    .url()
    .refine((u) => u.startsWith("https://") || process.env.NODE_ENV !== "production", "webhookUrl must be https")
    .optional(),
});

export const giftSchema = z.object({
  name: z.string().trim().max(80).default(""),
  phone: z.string().trim().min(9, "Enter a valid Safaricom number"),
  amount: z.coerce.number(),
  branch: z.string().trim().max(60).optional().nullable(),
  message: z.string().trim().max(140).optional().nullable(),
  anonymous: z.boolean().optional(),
});

export const convertFundSchema = z.object({
  members: z.array(z.object({ name: z.string().trim().max(80), phone: z.string().trim() })).max(300).default([]),
});
