import { MIN_PERSONAL_SAVINGS_INCREMENT } from "./constants";

/**
 * The original app only enforced a minimum increment on personal_savings
 * contributions (capital/security had no such floor) — preserved here as
 * the one place that rule is checked, rather than duplicated per call site.
 */
export function validateContributionAmount(
  type: string,
  amount: number,
): string | null {
  if (type === "personal_savings" && amount < MIN_PERSONAL_SAVINGS_INCREMENT) {
    return `Personal savings contributions must be at least Ksh ${MIN_PERSONAL_SAVINGS_INCREMENT}`;
  }
  return null;
}

/**
 * Which members.* balance column a contribution type increments. `welfare`
 * is deliberately absent (Phase 8) — a welfare-type contribution now feeds
 * the collective welfare fund (app/(dashboard)/dashboard/welfare/welfare-data.ts's
 * allocateContributionToWelfareFund) instead of a per-member balance, since
 * there is no such thing as an individual welfare balance. See
 * lib/db/schema.ts's comment on members.welfareBalance and
 * docs/architecture.md Phase 8 notes.
 */
export const CONTRIBUTION_BALANCE_FIELD = {
  capital: "capital",
  security: "security",
  personal_savings: "personalSavings",
} as const;
