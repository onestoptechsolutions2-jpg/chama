/**
 * The subscription price — four plain plans a treasurer can understand at a
 * glance (docs/product-plan.md §5), instead of the earlier member / vehicle
 * / activity bands. Pure and DB-free: the caller supplies the active member
 * count and the group's segment.
 *
 *   Free        up to 10 members                         Ksh 0
 *   Group       up to 50 members     Ksh 400/month  or 4,000/year
 *   Large group up to 300 members    Ksh 900/month  or 9,000/year
 *   Employer    employee welfare     Ksh 30 per member per month (employer pays)
 *   Over 300 members → custom quote (estimate shown).
 *
 * Prices are a product decision to test, kept here in one place; every
 * plan includes the core features. Transaction fees (below) stay separate.
 */
export type PlanId = "free" | "group" | "large" | "employer" | "custom";

export type Plan = {
  id: PlanId;
  label: string;
  maxMembers: number | null;
  monthly: number;
  /** Annual price when paid up front (two months free). */
  annual: number;
  smsPerMonth: number;
};

export const PLANS: Record<Exclude<PlanId, "employer" | "custom">, Plan> = {
  free: { id: "free", label: "Free", maxMembers: 10, monthly: 0, annual: 0, smsPerMonth: 20 },
  group: { id: "group", label: "Group", maxMembers: 50, monthly: 400, annual: 4000, smsPerMonth: 200 },
  large: { id: "large", label: "Large group", maxMembers: 300, monthly: 900, annual: 9000, smsPerMonth: 600 },
};

export const EMPLOYER_PER_MEMBER_MONTHLY = 30;
/** Estimate per member per month above 300 members (a real quote is agreed with the group). */
const CUSTOM_PER_MEMBER_MONTHLY = 3;

export type ActiveVehicles = {
  welfare: boolean;
  investment: boolean;
  tableBanking: boolean;
};

export type SubscriptionQuoteInput = {
  activeMembers: number;
  /** lib/domain/segments.ts — employee welfare is billed per member to the employer. */
  segment?: string | null;
  /** Kept for the invoice snapshot; no longer changes the price. */
  vehicles?: ActiveVehicles;
  annualGrossFlow?: number;
};

export type SubscriptionQuote = {
  plan: PlanId;
  tierLabel: string;
  /** Plan fee for a year at the monthly rate (stored on invoices as member_fee). */
  memberFee: number;
  /** Always 0 now; columns kept so old invoices still read. */
  vehicleFee: number;
  activityFee: number;
  totalMonthly: number;
  /** Twelve months at the monthly rate. */
  totalAnnual: number;
  /** Paying a year up front. */
  annualUpfront: number;
  smsPerMonth: number;
  isCustomQuote: boolean;
};

export function pickPlan(activeMembers: number, segment?: string | null): PlanId {
  if (segment === "employee_welfare") return "employer";
  if (activeMembers <= PLANS.free.maxMembers!) return "free";
  if (activeMembers <= PLANS.group.maxMembers!) return "group";
  if (activeMembers <= PLANS.large.maxMembers!) return "large";
  return "custom";
}

export function computeSubscriptionQuote(input: SubscriptionQuoteInput): SubscriptionQuote {
  const members = Math.max(0, input.activeMembers);
  const plan = pickPlan(members, input.segment);
  let monthly: number;
  let annualUpfront: number;
  let label: string;
  let sms: number;
  if (plan === "employer") {
    monthly = members * EMPLOYER_PER_MEMBER_MONTHLY;
    annualUpfront = monthly * 10;
    label = "Employer";
    sms = members;
  } else if (plan === "custom") {
    monthly = PLANS.large.monthly + (members - PLANS.large.maxMembers!) * CUSTOM_PER_MEMBER_MONTHLY;
    annualUpfront = monthly * 10;
    label = "Custom";
    sms = PLANS.large.smsPerMonth + (members - PLANS.large.maxMembers!) * 2;
  } else {
    monthly = PLANS[plan].monthly;
    annualUpfront = PLANS[plan].annual;
    label = PLANS[plan].label;
    sms = PLANS[plan].smsPerMonth;
  }
  return {
    plan,
    tierLabel: label,
    memberFee: monthly * 12,
    vehicleFee: 0,
    activityFee: 0,
    totalMonthly: monthly,
    totalAnnual: monthly * 12,
    annualUpfront,
    smsPerMonth: sms,
    isCustomQuote: plan === "custom",
  };
}

// ── Transaction fees (separate, itemized, never bundled into the quote) ──

export type TransactionEventType = "loan_disbursement" | "loan_repayment";

/**
 * Rates are directional, sized to leave margin over a plausible M-Pesa
 * pass-through cost — NOT confirmed against IntaSend's actual merchant
 * rate, which their public pricing page doesn't disclose. Verify before
 * these numbers go live (see the pricing review's "open item" note).
 */
const TRANSACTION_RATES: Record<TransactionEventType, number> = {
  loan_disbursement: 0.0075, // 0.75% — highest-value, highest-dispute-risk event
  loan_repayment: 0.005, // 0.5% — kept low deliberately; taxing on-time repayment is the wrong incentive
};

export function computeTransactionFee(eventType: TransactionEventType, amount: number): number {
  return Math.round(amount * TRANSACTION_RATES[eventType] * 100) / 100;
}
