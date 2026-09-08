import { z } from "zod";

export const groupDocumentCategories = [
  "constitution",
  "bank_details",
  "registration_certificate",
  "minutes",
  "other",
] as const;

export const uploadGroupDocumentSchema = z.object({
  title: z.string().trim().min(1, "Give this document a title"),
  category: z.enum(groupDocumentCategories),
  fileUrl: z.string().trim().url("Upload a file first"),
});

export const complianceObligationTypes = ["agm", "annual_returns", "custom"] as const;

export const createComplianceObligationSchema = z.object({
  type: z.enum(complianceObligationTypes),
  title: z.string().trim().min(1, "Give this obligation a title"),
  dueDate: z.string().trim().min(1, "Pick a due date"),
  recurrenceMonths: z.coerce.number().int().positive().optional(),
  notes: z.string().trim().optional(),
});

export type UploadGroupDocumentInput = z.infer<typeof uploadGroupDocumentSchema>;
export type CreateComplianceObligationInput = z.infer<typeof createComplianceObligationSchema>;
