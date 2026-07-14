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

/** Which members.* balance column a contribution type increments. */
export const CONTRIBUTION_BALANCE_FIELD = {
  capital: "capital",
  security: "security",
  personal_savings: "personalSavings",
  welfare: "welfareBalance",
} as const;
