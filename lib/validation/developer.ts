import { z } from "zod";

const WEBHOOK_EVENT_TYPES = [
  "contribution.recorded",
  "loan.approved",
  "loan.rejected",
  "member.joined",
  "mgr.slot.paid",
] as const;

export const createWebhookEndpointSchema = z.object({
  url: z.string().trim().url("Must be a valid URL"),
  description: z.string().trim().optional(),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1, "Pick at least one event"),
});

export type CreateWebhookEndpointInput = z.infer<typeof createWebhookEndpointSchema>;

/** app/api/v1/contributions POST — a subset of recordContributionSchema's shape (lib/validation/members.ts), the notes field dropped since it's a staff-UI-only field with no equivalent integration use case. */
export const recordApiContributionSchema = z.object({
  memberId: z.coerce.number().int().positive(),
  type: z.enum(["capital", "security", "mgr", "welfare", "personal_savings", "project", "other"]),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  reference: z.string().trim().optional(),
});

export type RecordApiContributionInput = z.infer<typeof recordApiContributionSchema>;
