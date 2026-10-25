import { z } from "zod";
import { optionalPhone } from "./identity";

/** An uploaded file: a public Blob URL, or a private one served by the app (/api/files/kyc/…). */
const fileRef = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\/api\/files\/kyc\/[\w./-]+$/.test(v) || z.string().url().safeParse(v).success, "Upload the file again")
  .optional();

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
  idDocumentUrl: fileRef,
  phone: optionalPhone,
  photoUrl: fileRef,
  address: z.string().trim().max(500).optional().or(z.literal("")),
  signatureUrl: fileRef,
});

export type UpdateKycInput = z.infer<typeof updateKycSchema>;
