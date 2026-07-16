import { z } from "zod";

export const triggerPlatformFeeSchema = z.object({
  mgrSlotId: z.coerce.number().int().positive(),
  phone: z.string().trim().min(9, "A valid phone number is required"),
});

export type TriggerPlatformFeeInput = z.infer<typeof triggerPlatformFeeSchema>;

export const walletTopupSchema = z.object({
  amount: z.coerce.number().positive("Enter an amount greater than zero"),
  phone: z.string().trim().min(9, "A valid phone number is required"),
});

export type WalletTopupInput = z.infer<typeof walletTopupSchema>;
