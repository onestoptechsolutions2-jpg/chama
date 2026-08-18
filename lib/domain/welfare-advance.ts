// defaultDueDate is deliberately NOT duplicated here — welfare advances
// reuse lib/domain/loans.ts's defaultDueDate directly at the call site
// (app/(dashboard)/welfare/welfare-data.ts), same due-date math as a loan.

export function computeAdvanceFee(principal: number, feePct: number): number {
  return Math.round(principal * (feePct / 100) * 100) / 100;
}

export function computeAdvanceTotalRepayable(principal: number, feePct: number): number {
  return Math.round((principal + computeAdvanceFee(principal, feePct)) * 100) / 100;
}

/** Sum of what's still owed across a member's active/overdue advances — the figure a new-advance request is checked against (policy's maxOutstandingAdvancePerMember). */
export function computeOutstandingAdvanceExposure(
  advances: { amountRemaining: string | number; status: string }[],
): number {
  return advances
    .filter((a) => a.status === "active" || a.status === "overdue")
    .reduce((sum, a) => sum + Number(a.amountRemaining), 0);
}

export function isAdvanceOverdue(dueDate: string, now: Date): boolean {
  return new Date(dueDate).getTime() < now.getTime();
}
