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

/**
 * Own schema/action (see updateCapitalPolicyAction) rather than folded into
 * updateSettingsSchema above — same reasoning updateProductAccessAction
 * already uses for product toggles: this is a distinct concern (allocation
 * risk policy, not group configuration), and it has its own validation
 * range that shouldn't leak into the general settings form.
 */
export const updateCapitalPolicySchema = z.object({
  // Empty string clears the policy back to "unset" (see
  // lib/domain/capital.ts's computeAllocationDrift) rather than defaulting
  // to some assumed target on the group's behalf.
  targetLoanDeploymentPct: z
    .union([z.literal(""), z.coerce.number().min(0).max(100)])
    .optional(),
});

export type UpdateCapitalPolicyInput = z.infer<typeof updateCapitalPolicySchema>;

/**
 * Own schema/action (see updateCapitalPolicyAction above) for the same
 * reason — a distinct concern from general group config. Genuinely missing
 * until now: groups.loanInterestRate/loanMaxMultiplier/loanRepaymentMonths/
 * loanLatePenalty have driven every loan computation (lib/domain/loans.ts)
 * since Phase 2, but no Settings tab ever let a group actually change them
 * from the seeded defaults (20%, 3x, 6 months, Ksh 500) — this closes that
 * gap, surfaced while building the vehicle-activation wizard.
 */
export const updateLoanSettingsSchema = z.object({
  loanInterestRate: z.coerce.number().min(0).max(100).optional(),
  loanMaxMultiplier: z.coerce.number().positive().optional(),
  loanRepaymentMonths: z.coerce.number().int().positive().optional(),
  loanLatePenalty: z.coerce.number().nonnegative().optional(),
  // 0 means the group has deliberately opted out of requiring guarantors —
  // see lib/domain/guarantors.ts's hasMinimumAcceptedGuarantors.
  loanMinGuarantors: z.coerce.number().int().min(0).max(10).optional(),
});

export type UpdateLoanSettingsInput = z.infer<typeof updateLoanSettingsSchema>;
