/**
 * "Capital position" — turns the group's existing ledger into an allocation
 * view instead of just a record of what already happened (see
 * docs/architecture.md's post-Phase-7 entry for the reasoning).
 *
 * Deliberately scoped to the CAPITAL pool only (sum of members.capital), not
 * capital+security+personalSavings combined: security is a collateral/
 * insurance deposit and personal savings is individually-owned money the
 * group merely holds — neither is meant to be lent out the way share
 * capital is in standard chama/table-banking practice. Conflating them
 * would overstate "deployable" capital and understate the loan-deployment
 * percentage. Welfare and projects are separate special-purpose pools,
 * reported alongside for visibility but not folded into the capital
 * allocation math either.
 *
 * welfareAvailable (Phase 8) is read directly from the welfare fund's own
 * cached reserve balances (welfare_funds.emergency/long_term/advance) —
 * previously this was collected-minus-disbursed derived from contributions/
 * welfare_claims, which the new ledger-backed fund makes unnecessary.
 */

export type CapitalPools = {
  capitalPool: number;
  securityPool: number;
  personalSavingsPool: number;
  welfareAvailable: number;
  /** @deprecated kept for compatibility with older callers/tests; prefer welfareAvailable. */
  welfareCollected?: number;
  /** @deprecated kept for compatibility with older callers/tests; prefer welfareAvailable. */
  welfareDisbursed?: number;
  projectsCommitted: number;
  /** Sum of loans.principal for active/extended/overdue loans — cash actually drawn from the capital pool. */
  loanPrincipalOutstanding: number;
  /** Sum of loans.amountRemaining for the same loans — includes accrued interest not yet repaid. */
  loanReceivableOutstanding: number;
};

export type CapitalPosition = {
  capitalPool: number;
  loanPrincipalOutstanding: number;
  loanReceivableOutstanding: number;
  /** capitalPool - loanPrincipalOutstanding, floored at 0. */
  reserve: number;
  /** % of capitalPool currently out on loan. 0 when capitalPool is 0. */
  loanDeploymentPct: number;
  /** True when loanPrincipalOutstanding exceeds capitalPool — a data/timing flag, not something the UI should treat as a normal state. */
  overextended: boolean;
  securityPool: number;
  personalSavingsPool: number;
  welfareAvailable: number;
  projectsCommitted: number;
};

export function computeCapitalPosition(pools: CapitalPools): CapitalPosition {
  const {
    capitalPool,
    securityPool,
    personalSavingsPool,
    welfareAvailable,
    welfareCollected,
    welfareDisbursed,
    projectsCommitted,
    loanPrincipalOutstanding,
    loanReceivableOutstanding,
  } = pools;

  const normalizedWelfareAvailable =
    Number(welfareAvailable ?? (Number(welfareCollected ?? 0) - Number(welfareDisbursed ?? 0)));

  const overextended = loanPrincipalOutstanding > capitalPool;
  const reserve = Math.max(0, capitalPool - loanPrincipalOutstanding);
  const loanDeploymentPct =
    capitalPool > 0 ? Math.min(100, (loanPrincipalOutstanding / capitalPool) * 100) : 0;

  return {
    capitalPool,
    loanPrincipalOutstanding,
    loanReceivableOutstanding,
    reserve,
    loanDeploymentPct,
    overextended,
    securityPool,
    personalSavingsPool,
    welfareAvailable: Math.max(0, normalizedWelfareAvailable),
    projectsCommitted,
  };
}

export type AllocationDriftSeverity = "on_target" | "over_deployed" | "under_deployed";

export type AllocationDrift = {
  targetPct: number;
  actualPct: number;
  /** actualPct - targetPct; positive means more is out on loan than targeted. */
  deltaPts: number;
  severity: AllocationDriftSeverity;
};

/** How far actual deployment can sit from the target before it's flagged, in percentage points. */
const DRIFT_TOLERANCE_PTS = 15;

/**
 * Returns null when the group hasn't set a target yet — advisory only, no
 * default is assumed on its behalf. Called with the group's actual
 * loanDeploymentPct (from computeCapitalPosition) and its configured
 * targetLoanDeploymentPct (nullable groups column).
 */
export function computeAllocationDrift(
  actualLoanDeploymentPct: number,
  targetLoanDeploymentPct: number | null,
): AllocationDrift | null {
  if (targetLoanDeploymentPct === null) return null;

  const deltaPts = actualLoanDeploymentPct - targetLoanDeploymentPct;
  const severity: AllocationDriftSeverity =
    deltaPts > DRIFT_TOLERANCE_PTS
      ? "over_deployed"
      : deltaPts < -DRIFT_TOLERANCE_PTS
        ? "under_deployed"
        : "on_target";

  return { targetPct: targetLoanDeploymentPct, actualPct: actualLoanDeploymentPct, deltaPts, severity };
}
