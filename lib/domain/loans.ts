type MemberForLimit = {
  capital: string | number;
  security: string | number;
  personalSavings: string | number;
  limitReduced: boolean;
};

type GroupForLimit = {
  loanMaxMultiplier: string | number;
};

export function totalSavings(member: MemberForLimit): number {
  return Number(member.capital) + Number(member.security) + Number(member.personalSavings);
}

/**
 * Bug 9 (docs/architecture.md): the original app exposed a configurable
 * groups.loan_max_multiplier (default 3x) in Settings, but the actual
 * approval logic hardcoded limit = 2x total savings (1x after an extension
 * flags limit_reduced) and ignored that column entirely — the setting did
 * nothing. This is the one place the limit is computed; it always reads the
 * group's actual configured multiplier, and both the staff-approval path
 * and the member self-service application path call this same function, so
 * there is only one formula in the codebase that could be wrong.
 */
export function computeLoanLimit(member: MemberForLimit, group: GroupForLimit): number {
  const savings = totalSavings(member);
  const multiplier = member.limitReduced ? 1 : Number(group.loanMaxMultiplier);
  return savings * multiplier;
}

export function computeTotalRepayable(principal: number, interestRatePct: number): number {
  return Math.round(principal * (1 + interestRatePct / 100));
}

export function defaultDueDate(issuedDate: Date, repaymentMonths: number): string {
  const d = new Date(issuedDate);
  d.setMonth(d.getMonth() + repaymentMonths);
  return d.toISOString().split("T")[0];
}

export function isActiveLoanStatus(status: string): boolean {
  return status === "active" || status === "extended" || status === "overdue";
}
