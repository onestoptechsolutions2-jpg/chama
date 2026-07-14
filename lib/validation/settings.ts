import { z } from "zod";

/**
 * Every field optional — the single settings form submits whichever section
 * (Group / Contributions / Fines) the admin edited, and updateSettingsAction
 * does one partial UPDATE against `groups`. This is the merge of the
 * original app's two overlapping group.js/settings.js routers into one
 * write path (see docs/architecture.md).
 */
export const updateSettingsSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  meetingDay: z.string().trim().optional(),
  meetingTime: z.string().trim().optional(),
  meetingVenue: z.string().trim().optional(),
  sharePrice: z.coerce.number().nonnegative().optional(),
  sharesPerMember: z.coerce.number().int().positive().optional(),
  contributionDay: z.coerce.number().int().min(1).max(31).optional(),
  fineLateness: z.coerce.number().nonnegative().optional(),
  fineAbsence: z.coerce.number().nonnegative().optional(),
  fineRuleViolation: z.coerce.number().nonnegative().optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
