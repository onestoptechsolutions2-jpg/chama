/**
 * Year-end share-out for table banking: each member gets back their savings
 * plus a share of what the group earned (loan interest, fines paid, other
 * income, minus expenses), less anything they still owe.
 *
 * Two ways to share the earnings, both common:
 * - "savings": in proportion to each member's savings at the end;
 * - "time": in proportion to shilling-days — money saved in January earns
 *   more than the same money saved in November. Fairer when people save
 *   unevenly; this is the default.
 *
 * Pure and deterministic; rounding leftovers (a few shillings) go to the
 * group, never invented.
 */
export type ShareOutMethod = "savings" | "time";

export type ShareOutMember = {
  memberId: number;
  name: string;
  /** Savings that count for the share-out at period end (shares + personal savings). */
  savings: number;
  /** Savings paid in during the period, for the time-weighted method. Dates are YYYY-MM-DD. */
  deposits: { date: string; amount: number }[];
  /** Savings already held before the period started (earn for the whole period). */
  openingSavings: number;
  loanBalance: number;
  unpaidFines: number;
};

export type ShareOutInput = {
  members: ShareOutMember[];
  periodStart: string;
  periodEnd: string;
  interestEarned: number;
  finesCollected: number;
  otherIncome: number;
  expenses: number;
  method: ShareOutMethod;
};

export type ShareOutLine = {
  memberId: number;
  name: string;
  savings: number;
  weightPct: number;
  earnings: number;
  deductions: number;
  payout: number;
  /** Still owed after the share-out, when deductions exceed savings + earnings. */
  stillOwes: number;
};

export type ShareOutResult = {
  profit: number;
  lines: ShareOutLine[];
  totals: { savings: number; earnings: number; deductions: number; payout: number; stillOwes: number };
  /** Shillings left from rounding down; stays with the group. */
  roundingLeftover: number;
};

const DAY = 86_400_000;
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);

function daysBetween(from: string, to: string): number {
  return Math.max(0, Math.round((toMs(to) - toMs(from)) / DAY));
}

/** Shilling-days a member's savings earned within the period. */
export function shillingDays(m: ShareOutMember, periodStart: string, periodEnd: string): number {
  const total = daysBetween(periodStart, periodEnd) + 1;
  let weight = Math.max(0, m.openingSavings) * total;
  for (const d of m.deposits) {
    if (d.date < periodStart || d.date > periodEnd) continue;
    weight += d.amount * (daysBetween(d.date, periodEnd) + 1);
  }
  return weight;
}

export function computeShareOut(input: ShareOutInput): ShareOutResult {
  const profit = Math.max(0, input.interestEarned + input.finesCollected + input.otherIncome - input.expenses);
  const weights = input.members.map((m) =>
    input.method === "time" ? shillingDays(m, input.periodStart, input.periodEnd) : Math.max(0, m.savings),
  );
  const totalWeight = weights.reduce((s, w) => s + w, 0);

  const lines: ShareOutLine[] = input.members.map((m, i) => {
    const share = totalWeight > 0 ? weights[i] / totalWeight : 0;
    const earnings = Math.floor(profit * share);
    const deductions = Math.max(0, m.loanBalance) + Math.max(0, m.unpaidFines);
    const gross = m.savings + earnings;
    return {
      memberId: m.memberId,
      name: m.name,
      savings: m.savings,
      weightPct: Math.round(share * 10000) / 100,
      earnings,
      deductions,
      payout: Math.max(0, gross - deductions),
      stillOwes: Math.max(0, deductions - gross),
    };
  });

  const sum = (k: keyof Pick<ShareOutLine, "savings" | "earnings" | "deductions" | "payout" | "stillOwes">) =>
    lines.reduce((s, l) => s + l[k], 0);
  const totals = { savings: sum("savings"), earnings: sum("earnings"), deductions: sum("deductions"), payout: sum("payout"), stillOwes: sum("stillOwes") };
  return { profit, lines, totals, roundingLeftover: Math.round((profit - totals.earnings) * 100) / 100 };
}

/** Interest inside a repayment: the loan's interest share of every shilling repaid. */
export function interestPortion(repayment: number, principal: number, totalRepayable: number): number {
  if (totalRepayable <= 0 || totalRepayable <= principal) return 0;
  return repayment * ((totalRepayable - principal) / totalRepayable);
}
