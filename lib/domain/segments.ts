import type { GroupType, ProductFlags } from "./products";
import { RULE_TEMPLATES, type RuleTemplate } from "./rule-templates";
import { DEFAULT_FUNERAL_BENEFITS, type BenefitItem } from "./welfare-benefits";

/**
 * The four kinds of group the product is built for, as ready-made setups.
 * Picking one at "Start a group" switches on the right products, sets
 * sensible money rules and adds a short starter rule book — so a group is
 * running in minutes, and Settings is for changes, not setup. Every number
 * here is a starting point the group edits; none is enforced as a constant.
 */
export type Segment = "table_banking" | "boda_boda" | "welfare_funeral" | "employee_welfare" | "other";

export type SegmentTemplate = {
  label: string;
  /** One line shown on the picker. */
  pitch: string;
  type: GroupType;
  products: ProductFlags;
  /** Group settings columns (plain numbers/strings; the caller converts numerics). */
  settings: {
    sharePrice: number;
    sharesPerMember: number;
    meetingDay: string | null;
    loanInterestRate?: number;
    loanMaxMultiplier?: number;
    loanRepaymentMonths?: number;
    loanMinGuarantors?: number;
    fineLateness: number;
    fineAbsence: number;
  };
  /** Welfare policy start: a fixed amount per member per period, and an optional benefit table. */
  welfare?: { fixedAmount: number; benefits?: BenefitItem[] };
  ruleTemplateIds: string[];
};

export const SEGMENTS: Record<Segment, SegmentTemplate> = {
  table_banking: {
    label: "Women's table banking",
    pitch: "Weekly meetings, shares, loans from the pool, year-end share-out.",
    type: "chama",
    products: { loans: true, mgr: true, welfare: false, projects: false },
    settings: {
      sharePrice: 500,
      sharesPerMember: 1,
      meetingDay: "Saturday",
      loanInterestRate: 10,
      loanMaxMultiplier: 3,
      loanRepaymentMonths: 3,
      loanMinGuarantors: 1,
      fineLateness: 50,
      fineAbsence: 100,
    },
    ruleTemplateIds: [
      "general-eligibility",
      "general-exit",
      "contributions-due-date",
      "contributions-method",
      "loans-eligibility",
      "loans-guarantors",
      "loans-default",
      "fines-lateness",
      "fines-absence",
      "meetings-frequency",
    ],
  },
  boda_boda: {
    label: "Boda-boda group",
    pitch: "Daily small payments by paybill, bike loans, accident support.",
    type: "selfhelp",
    products: { loans: true, mgr: false, welfare: true, projects: false },
    settings: {
      sharePrice: 100,
      sharesPerMember: 1,
      meetingDay: null,
      loanInterestRate: 10,
      loanMaxMultiplier: 2,
      loanRepaymentMonths: 6,
      loanMinGuarantors: 2,
      fineLateness: 50,
      fineAbsence: 100,
    },
    welfare: { fixedAmount: 50 },
    ruleTemplateIds: [
      "general-eligibility",
      "general-exit",
      "contributions-method",
      "contributions-proof",
      "loans-eligibility",
      "loans-guarantors",
      "loans-default",
      "welfare-qualifying-events",
      "welfare-verification",
    ],
  },
  welfare_funeral: {
    label: "Welfare / funeral group",
    pitch: "A fixed monthly amount; set payouts when a member or family dies.",
    type: "welfare",
    products: { loans: false, mgr: false, welfare: true, projects: false },
    settings: { sharePrice: 0, sharesPerMember: 1, meetingDay: null, fineLateness: 0, fineAbsence: 0 },
    welfare: { fixedAmount: 200, benefits: DEFAULT_FUNERAL_BENEFITS },
    ruleTemplateIds: [
      "general-eligibility",
      "general-exit",
      "contributions-due-date",
      "contributions-method",
      "welfare-qualifying-events",
      "welfare-window",
      "welfare-cap",
      "welfare-verification",
    ],
  },
  employee_welfare: {
    label: "Employee welfare",
    pitch: "Monthly payroll deductions; a committee approves claims.",
    type: "welfare",
    products: { loans: false, mgr: false, welfare: true, projects: false },
    settings: { sharePrice: 0, sharesPerMember: 1, meetingDay: null, fineLateness: 0, fineAbsence: 0 },
    welfare: { fixedAmount: 500, benefits: DEFAULT_FUNERAL_BENEFITS },
    ruleTemplateIds: [
      "general-eligibility",
      "general-exit",
      "welfare-qualifying-events",
      "welfare-window",
      "welfare-cap",
      "welfare-verification",
    ],
  },
  other: {
    label: "Something else",
    pitch: "Start blank and switch on what you need in Settings.",
    type: "chama",
    products: { loans: false, mgr: false, welfare: false, projects: false },
    settings: { sharePrice: 0, sharesPerMember: 1, meetingDay: null, fineLateness: 0, fineAbsence: 0 },
    ruleTemplateIds: ["general-eligibility", "general-exit"],
  },
};

export const SEGMENT_ORDER: Segment[] = ["table_banking", "boda_boda", "welfare_funeral", "employee_welfare", "other"];

export function isSegment(value: unknown): value is Segment {
  return typeof value === "string" && value in SEGMENTS;
}

/** The starter rules for a segment, in rule-book order. Unknown ids are skipped. */
export function segmentRules(segment: Segment): RuleTemplate[] {
  const byId = new Map(RULE_TEMPLATES.map((t) => [t.id, t]));
  return SEGMENTS[segment].ruleTemplateIds.map((id) => byId.get(id)).filter((t): t is RuleTemplate => !!t);
}
