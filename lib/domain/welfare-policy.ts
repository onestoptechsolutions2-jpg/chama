export type WelfareFundingMethod =
  | "fixed_amount"
  | "pct_collections"
  | "pct_contribution"
  | "manual";

/**
 * How much of THIS welfare-type contribution event routes into the
 * collective fund. There's no season/cycle-close mechanism in this app (see
 * docs/architecture.md Phase 8 notes) to hang a true "skim a % off every
 * contribution type" batch job off of, so pct_collections is approximated
 * as a percentage of this welfare contribution's own amount, same as
 * pct_contribution — both are computed identically here; the distinction is
 * preserved in the schema for future extension.
 */
export function computeContributionAllocation(input: {
  method: WelfareFundingMethod;
  contributionAmount: number;
  fixedAmount: number | null;
  pct: number | null;
}): number {
  switch (input.method) {
    case "fixed_amount":
      return Math.min(input.fixedAmount ?? 0, input.contributionAmount);
    case "pct_collections":
    case "pct_contribution":
      return (input.contributionAmount * (input.pct ?? 0)) / 100;
    case "manual":
      return 0;
  }
}

export type AllocationSplit = {
  emergencyPct: number;
  longTermPct: number;
  advancePct: number;
};

const SPLIT_TOLERANCE = 0.01;

export function validateAllocationSplit(split: AllocationSplit): string | null {
  if (split.emergencyPct < 0 || split.longTermPct < 0 || split.advancePct < 0) {
    return "Allocation percentages cannot be negative";
  }
  const total = split.emergencyPct + split.longTermPct + split.advancePct;
  if (Math.abs(total - 100) > SPLIT_TOLERANCE) {
    return `Emergency, long-term, and advance allocations must sum to 100% (currently ${total}%)`;
  }
  return null;
}

/**
 * Remainder-safe: emergency and long-term are rounded to the cent first,
 * advance takes whatever's left over, so the three always sum to exactly
 * `amount` — never a cent more or less from independent rounding.
 */
export function splitAcrossReserves(
  amount: number,
  split: AllocationSplit,
): { emergency: number; longTerm: number; advance: number } {
  const emergency = Math.round(((amount * split.emergencyPct) / 100) * 100) / 100;
  const longTerm = Math.round(((amount * split.longTermPct) / 100) * 100) / 100;
  const advance = Math.round((amount - emergency - longTerm) * 100) / 100;
  return { emergency, longTerm, advance };
}
