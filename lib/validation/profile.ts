import { z } from "zod";

/**
 * Every field optional — a member can save KYC progress incrementally
 * (fill in the ID number today, upload a photo next week). Whether it's
 * actually *complete* is a separate question, answered by
 * lib/domain/officials.ts's isKycComplete against whichever fields ended
 * up filled.
 */
export const updateKycSchema = z.object({
  idType: z.enum(["national_id", "passport"]).optional().or(z.literal("")),
  idNumber: z.string().trim().max(50).optional().or(z.literal("")),
  idDocumentUrl: z.string().trim().url().optional().or(z.literal("")),
  phone: z
    .string()
    .trim()
    .regex(/^0\d{9}$/, "Phone must be a 10-digit number starting with 0")
    .optional()
    .or(z.literal("")),
  photoUrl: z.string().trim().url().optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  signatureUrl: z.string().trim().url().optional().or(z.literal("")),
});

export type UpdateKycInput = z.infer<typeof updateKycSchema>;
