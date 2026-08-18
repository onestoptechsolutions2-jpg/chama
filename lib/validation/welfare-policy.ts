import { z } from "zod";
import { validateAllocationSplit } from "@/lib/domain/welfare-policy";

export const welfareFundingMethods = [
  "fixed_amount",
  "pct_collections",
  "pct_contribution",
  "manual",
] as const;

/**
 * Every field optional, same pattern as updateLoanSettingsSchema — the
 * Settings-page form and the wizard's activation-time config step both post
 * a subset of these. allowOverdraft is a checkbox handled directly from
 * formData in the action (formData.get("allowOverdraft") === "on"), same
 * convention as every other boolean flag in this codebase, so it isn't
 * parsed here.
 */
export const updateWelfarePolicySchema = z
  .object({
    fundingMethod: z.enum(welfareFundingMethods).optional(),
    fundingFixedAmount: z.coerce.number().nonnegative().optional(),
    fundingPct: z.coerce.number().min(0).max(100).optional(),
    emergencyAllocationPct: z.coerce.number().min(0).max(100).optional(),
    longTermAllocationPct: z.coerce.number().min(0).max(100).optional(),
    advanceAllocationPct: z.coerce.number().min(0).max(100).optional(),
    maxEmergencyGrant: z.coerce.number().nonnegative().optional(),
    maxLongTermGrant: z.coerce.number().nonnegative().optional(),
    maxAdvance: z.coerce.number().nonnegative().optional(),
    maxOutstandingAdvancePerMember: z.coerce.number().nonnegative().optional(),
    minEmergencyReserveFloor: z.coerce.number().nonnegative().optional(),
    maxClaimsPerMemberPerYear: z.coerce.number().int().min(0).optional(),
    cooldownDays: z.coerce.number().int().min(0).optional(),
    minTenureMonths: z.coerce.number().int().min(0).optional(),
    advanceFeePct: z.coerce.number().min(0).max(100).optional(),
    advanceMaxRepaymentMonths: z.coerce.number().int().positive().optional(),
    tier1MaxAmount: z.coerce.number().nonnegative().optional(),
    tier2MaxAmount: z.coerce.number().nonnegative().optional(),
  })
  .refine(
    (v) => {
      // Only enforced when a save touches all three together — a partial
      // settings-form edit of one field shouldn't be blocked by the other
      // two's stale values; the wizard's activation-time submit always
      // sends all three, so that's the real enforcement point.
      if (
        v.emergencyAllocationPct === undefined ||
        v.longTermAllocationPct === undefined ||
        v.advanceAllocationPct === undefined
      ) {
        return true;
      }
      return (
        validateAllocationSplit({
          emergencyPct: v.emergencyAllocationPct,
          longTermPct: v.longTermAllocationPct,
          advancePct: v.advanceAllocationPct,
        }) === null
      );
    },
    {
      message: "Emergency, long-term, and advance allocations must sum to 100%",
      path: ["advanceAllocationPct"],
    },
  );

export type UpdateWelfarePolicyInput = z.infer<typeof updateWelfarePolicySchema>;
