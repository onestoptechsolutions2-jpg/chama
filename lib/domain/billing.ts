/**
 * The subscription pricing engine — implements the member/vehicle/activity
 * model from the Laitor pricing strategy review. Deliberately pure and
 * DB-free like every other lib/domain/* module: the caller supplies already-
 * queried numbers (active member count, which vehicles are active, trailing
 * 12-month gross financial activity), this computes the price.
 *
 * Three additive bands, each pricing a genuinely different thing:
 *   1. Member band  — headcount/administrative load
 *   2. Vehicle band — which financial products are switched on, weighted by
 *      actual operational/risk complexity, not a flat per-count step
 *   3. Activity band — real financial throughput, NOT account balance (a
 *      group with Ksh 10M sitting idle pays nothing extra here)
 *
 * Transaction fees (computeTransactionFee) are a separate, itemized layer —
 * never bundled into the annual quote — modeling the direct generalization
 * of the one fee mechanism already live in this codebase (calcPlatformFee /
 * groups.mgrFeePct) to loan disbursement and repayment events.
 */

// ── Member band ──────────────────────────────────────────────────────────

type MemberBand = { max: number; fee: number };

/** Ordered ascending by `max`; the last entry's `max` is the ceiling before "custom". */
const MEMBER_BANDS: MemberBand[] = [
  { max: 15, fee: 1200 },
  { max: 30, fee: 2400 },
  { max: 50, fee: 3600 },
  { max: 75, fee: 5000 },
  { max: 100, fee: 6500 },
  { max: 150, fee: 8500 },
  { max: 250, fee: 12000 },
];

/** Illustrative marginal rate used only past the last real band (250+) — a real quote there should be a human-negotiated custom one. */
const CUSTOM_MEMBER_MARGINAL_RATE = 50;

export type MemberFeeResult = { fee: number; isCustomQuote: boolean };

/**
 * Members 1-15 pay nothing unless the group has at least one paid vehicle
 * active (Starter tier) — otherwise the smallest, most price-sensitive
 * groups never clear a free incumbent's price floor (see the pricing
 * review's Chamasoft comparison) and Laitor never gets the chance to
 * demonstrate the features that would justify paying at all.
 */
export function computeMemberFee(activeMembers: number, hasAnyPaidVehicle: boolean): MemberFeeResult {
  const band = MEMBER_BANDS.find((b) => activeMembers <= b.max);
  if (band) {
    if (band.max === 15 && !hasAnyPaidVehicle) return { fee: 0, isCustomQuote: false };
    return { fee: band.fee, isCustomQuote: false };
  }
  const last = MEMBER_BANDS[MEMBER_BANDS.length - 1];
  const over = activeMembers - last.max;
  return { fee: last.fee + over * CUSTOM_MEMBER_MARGINAL_RATE, isCustomQuote: true };
}

// ── Vehicle band ─────────────────────────────────────────────────────────

export type ActiveVehicles = {
  welfare: boolean;
  /** "Investment" in the pricing review's language — projects in this schema. */
  investment: boolean;
  /** "Table Banking" in the pricing review's language — loans in this schema. */
  tableBanking: boolean;
};

const VEHICLE_FEES: Record<keyof ActiveVehicles, number> = {
  welfare: 400,
  investment: 900,
  tableBanking: 1800,
};

const VEHICLE_FEE_CAP = 3500;

export function computeVehicleFee(vehicles: ActiveVehicles): number {
  const total = (Object.keys(VEHICLE_FEES) as (keyof ActiveVehicles)[]).reduce(
    (sum, key) => sum + (vehicles[key] ? VEHICLE_FEES[key] : 0),
    0,
  );
  return Math.min(VEHICLE_FEE_CAP, total);
}

export function hasAnyPaidVehicle(vehicles: ActiveVehicles): boolean {
  return vehicles.welfare || vehicles.investment || vehicles.tableBanking;
}

// ── Activity band ────────────────────────────────────────────────────────

type ActivityBand = { max: number; fee: number };

const ACTIVITY_BANDS: ActivityBand[] = [
  { max: 1_000_000, fee: 0 },
  { max: 3_000_000, fee: 1_000 },
  { max: 5_000_000, fee: 2_000 },
  { max: 10_000_000, fee: 4_000 },
  { max: 25_000_000, fee: 7_500 },
  { max: 50_000_000, fee: 12_500 },
];

/** Never a proxy for payment-processing cost — see computeTransactionFee for that. This prices support/complexity load only. */
const CUSTOM_ACTIVITY_RATE = 0.0004; // 0.04%, the illustrative rate from the pricing review

export type ActivityFeeResult = { fee: number; isCustomQuote: boolean };

export function computeActivityFee(annualGrossFlow: number): ActivityFeeResult {
  const band = ACTIVITY_BANDS.find((b) => annualGrossFlow <= b.max);
  if (band) return { fee: band.fee, isCustomQuote: false };
  return { fee: Math.round(annualGrossFlow * CUSTOM_ACTIVITY_RATE), isCustomQuote: true };
}

// ── Full subscription quote ─────────────────────────────────────────────

export type SubscriptionQuoteInput = {
  activeMembers: number;
  vehicles: ActiveVehicles;
  annualGrossFlow: number;
};

export type SubscriptionQuote = {
  memberFee: number;
  vehicleFee: number;
  activityFee: number;
  totalAnnual: number;
  totalMonthly: number;
  isCustomQuote: boolean;
  /** Display label only — the price is always the computed one above, never gated by tier. */
  tierLabel: "Starter" | "Community" | "Finance" | "Pro";
};

const ANNUAL_DISCOUNT_RATE = 0.15;

export function computeSubscriptionQuote(input: SubscriptionQuoteInput): SubscriptionQuote {
  const paidVehicle = hasAnyPaidVehicle(input.vehicles);
  const member = computeMemberFee(input.activeMembers, paidVehicle);
  const vehicleFee = computeVehicleFee(input.vehicles);
  const activity = computeActivityFee(input.annualGrossFlow);

  const totalAnnual = member.fee + vehicleFee + activity.fee;
  const totalMonthly = Math.round((totalAnnual / 12) * 100) / 100;

  let tierLabel: SubscriptionQuote["tierLabel"] = "Starter";
  if (totalAnnual === 0) tierLabel = "Starter";
  else if (input.vehicles.tableBanking) tierLabel = input.vehicles.investment ? "Pro" : "Finance";
  else tierLabel = "Community";

  return {
    memberFee: member.fee,
    vehicleFee,
    activityFee: activity.fee,
    totalAnnual,
    totalMonthly,
    isCustomQuote: member.isCustomQuote || activity.isCustomQuote,
    tierLabel,
  };
}

/** The ~15% discount for committing to annual billing instead of paying the monthly-equivalent 12 times — matches the pricing review's stated discount. */
export function computeAnnualDiscountedCharge(totalAnnual: number): number {
  return Math.round(totalAnnual * (1 - ANNUAL_DISCOUNT_RATE));
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
