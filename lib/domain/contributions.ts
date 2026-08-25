import { MIN_PERSONAL_SAVINGS_INCREMENT } from "./constants";

/**
 * The original app only enforced a minimum increment on personal_savings
 * contributions (capital/security had no such floor) — preserved here as
 * the one place that rule is checked, rather than duplicated per call site.
 *
 * `minIncrement` defaults to the platform constant only for callers that
 * genuinely have no group in scope (e.g. a unit test); real call sites
 * should always pass the group's own `minPersonalSavingsIncrement` — this
 * used to be hardcoded to the constant unconditionally, the same class of
 * bug bug #9 (loan limit ignoring loanMaxMultiplier) already fixed
 * elsewhere in this app (see docs/architecture.md).
 */
export function validateContributionAmount(
  type: string,
  amount: number,
  minIncrement: number = MIN_PERSONAL_SAVINGS_INCREMENT,
): string | null {
  if (type === "personal_savings" && amount < minIncrement) {
    return `Personal savings contributions must be at least Ksh ${minIncrement}`;
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
