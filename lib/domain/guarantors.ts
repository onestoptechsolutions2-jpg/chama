import { MAX_CONCURRENT_GUARANTEES } from "./constants";

/**
 * Guarantors are real consent, not a listed name: a requested guarantor
 * sits in `loan_guarantors` as `status: "pending"` until they explicitly
 * accept or decline (respondToGuaranteeRequestAction), and a self-service
 * loan application can't be approved until enough have accepted (see
 * reviewApplicationAction). Staff-direct loan creation auto-accepts —
 * staff are already vouching for the loan directly, the same trust level
 * every other staff-direct action in this app already carries.
 */

export type GuarantorEligibilityInput = {
  /** The prospective guarantor is the borrower themselves. */
  isSelf: boolean;
  isActiveMember: boolean;
  /** The prospective guarantor has a loan of their own currently flagged overdue. */
  hasOwnOverdueLoan: boolean;
  /** How many other loans this member is currently an accepted guarantor for (not yet cleared/rejected). */
  currentGuaranteeCount: number;
};

export type GuarantorEligibilityResult = { eligible: true } | { eligible: false; reason: string };

export function checkGuarantorEligibility(
  input: GuarantorEligibilityInput,
): GuarantorEligibilityResult {
  if (input.isSelf) return { eligible: false, reason: "A member cannot guarantee their own loan" };
  if (!input.isActiveMember) return { eligible: false, reason: "Guarantor must be an active member" };
  if (input.hasOwnOverdueLoan) {
    return { eligible: false, reason: "This member has a defaulted loan of their own" };
  }
  if (input.currentGuaranteeCount >= MAX_CONCURRENT_GUARANTEES) {
    return {
      eligible: false,
      reason: `Already guaranteeing the maximum of ${MAX_CONCURRENT_GUARANTEES} loans`,
    };
  }
  return { eligible: true };
}

export type GuarantorStatus = "pending" | "accepted" | "declined" | "released";

/** How many of a loan/application's guarantor requests have actually been accepted — the number that counts toward the group's minimum, not the number requested. */
export function countAcceptedGuarantors(guarantors: { status: GuarantorStatus }[]): number {
  return guarantors.filter((g) => g.status === "accepted").length;
}

/**
 * The gate reviewApplicationAction checks before letting an application
 * become a loan. `minRequired` is the group's configured
 * `loanMinGuarantors` — a group that sets this to 0 is deliberately opting
 * out of the requirement entirely (e.g. a small, high-trust group), so 0
 * always passes.
 */
export function hasMinimumAcceptedGuarantors(
  guarantors: { status: GuarantorStatus }[],
  minRequired: number,
): boolean {
  if (minRequired <= 0) return true;
  return countAcceptedGuarantors(guarantors) >= minRequired;
}
