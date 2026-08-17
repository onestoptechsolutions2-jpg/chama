import type { ProductFlags } from "./products";

export type RuleCategory =
  | "general"
  | "contributions"
  | "loans"
  | "mgr"
  | "welfare"
  | "fines"
  | "meetings"
  | "projects"
  | "other";

export type RuleTemplate = {
  /** Stable slug, not a DB id — templates aren't stored, only what a group picks and amends is. */
  id: string;
  category: RuleCategory;
  title: string;
  description: string;
  suggestedPenaltyAmount?: number;
};

/**
 * Which product gates a category's templates, if any. Four of the nine
 * rule categories map 1:1 onto a toggleable vehicle (Settings > Products —
 * lib/domain/products.ts) — a group with Table Banking off shouldn't be
 * offered loan-default templates. The rest (general/contributions/fines/
 * meetings/other) apply to every group regardless of which vehicles it
 * runs, so they're never gated.
 */
const CATEGORY_PRODUCT: Partial<Record<RuleCategory, keyof ProductFlags>> = {
  loans: "loans",
  mgr: "mgr",
  welfare: "welfare",
  projects: "projects",
};

/**
 * A starter library of common, Kenyan-chama/table-banking-standard rules —
 * written as complete, ready-to-use sentences with reasonable defaults
 * (not fill-in-the-blank placeholders), since the point is a group picks
 * one and amends the specifics to fit them, not fills out a form from
 * scratch. Numbers are chosen to be consistent with this app's own
 * business-rule defaults where one exists (lib/domain/constants.ts,
 * groups.loanInterestRate/loanMaxMultiplier) rather than invented fresh.
 */
export const RULE_TEMPLATES: RuleTemplate[] = [
  // ── General — every group, regardless of which vehicles are active ─────
  {
    id: "general-eligibility",
    category: "general",
    title: "Membership eligibility",
    description:
      "New members are admitted by majority vote of existing active members and must complete KYC (ID, phone, next of kin) before their first contribution is accepted.",
  },
  {
    id: "general-officials-term",
    category: "general",
    title: "Officials' term of office",
    description:
      "Admin, Treasurer, and Secretary serve a one-year term and may be re-elected. A vote of no confidence by two-thirds of active members may remove an official before term end.",
  },
  {
    id: "general-quorum",
    category: "general",
    title: "Quorum for group decisions",
    description:
      "A vote or rule change is only binding if at least two-thirds of active members are present (in person or via the group's agreed remote channel).",
  },
  {
    id: "general-amendment",
    category: "general",
    title: "Amending these rules",
    description:
      "Any rule may be added, amended, or removed by a two-thirds majority vote at a regular or special meeting, with the change recorded in the minutes and reflected here within 7 days.",
  },
  {
    id: "general-exit",
    category: "general",
    title: "Member exit and payout",
    description:
      "A member wishing to leave gives 30 days' written notice. Their capital and personal savings are refunded within 60 days, net of any outstanding loan balance or unpaid fines.",
  },

  // ── Contributions ───────────────────────────────────────────────────────
  {
    id: "contributions-due-date",
    category: "contributions",
    title: "Monthly contribution due date",
    description:
      "Contributions are due by the 5th of each month. Payments made after the 5th but before the 10th are accepted with the standard lateness fine; after the 10th, the amount is treated as missed.",
    suggestedPenaltyAmount: 100,
  },
  {
    id: "contributions-method",
    category: "contributions",
    title: "Accepted payment method",
    description:
      "Contributions are paid via the group's official M-Pesa Paybill/Till only. Cash payments to an official directly are discouraged and must be receipted and banked within 48 hours if unavoidable.",
  },
  {
    id: "contributions-minimum",
    category: "contributions",
    title: "Minimum contribution enforcement",
    description:
      "A contribution below the group's set share price is not accepted as a full month's contribution — the shortfall remains due and continues to accrue toward the lateness fine until topped up.",
  },
  {
    id: "contributions-proof",
    category: "contributions",
    title: "Proof of payment",
    description:
      "The M-Pesa confirmation code (or receipt number) must be provided when a contribution is recorded — an entry with no reference is flagged for the Treasurer to verify before it counts toward the member's balance.",
  },

  // ── Loans (Table Banking) — requires loansEnabled ───────────────────────
  {
    id: "loans-eligibility",
    category: "loans",
    title: "Loan eligibility",
    description:
      "A member must have been active for at least 3 months and have no contributions in arrears to apply for a loan. First-time borrowers may only borrow up to half their computed limit.",
  },
  {
    id: "loans-guarantors",
    category: "loans",
    title: "Guarantor requirement",
    description:
      "Every loan requires at least two guarantors who are active members in good standing (no arrears, no defaulted loan of their own). A guarantor may not guarantee more than two outstanding loans at once.",
  },
  {
    id: "loans-limit",
    category: "loans",
    title: "Loan limit",
    description:
      "A member may borrow up to the group's configured multiple of their total savings (capital, security, and personal savings combined). The limit is halved for one loan cycle after any extension.",
  },
  {
    id: "loans-default",
    category: "loans",
    title: "Consequences of default",
    description:
      "A loan unpaid 30 days past its due date is flagged overdue and attracts the group's configured late penalty. Guarantors become liable for the outstanding balance if it remains unpaid a further 30 days.",
    suggestedPenaltyAmount: 500,
  },
  {
    id: "loans-purpose",
    category: "loans",
    title: "Purpose disclosure",
    description:
      "A borrower states the loan's intended purpose at application. Staff may decline or ask the borrower to revise a purpose the group's rules or bylaws don't permit lending for.",
  },

  // ── MGR / Merry-Go-Round — requires mgrEnabled ──────────────────────────
  {
    id: "mgr-order",
    category: "mgr",
    title: "Rotation order",
    description:
      "The payout order for each cycle is determined by lottery at the start of the cycle unless the group agrees to a fixed seniority order instead, recorded in the meeting minutes.",
  },
  {
    id: "mgr-consistency",
    category: "mgr",
    title: "Staying in rotation",
    description:
      "A member who misses two consecutive MGR contributions forfeits their claimed slot for the current cycle; the slot reopens for another member and they rejoin the rotation from the next cycle.",
  },
  {
    id: "mgr-proof",
    category: "mgr",
    title: "Proof of payout",
    description:
      "The recipient of a payout provides an M-Pesa confirmation code or written acknowledgment when the slot is marked paid — the record is permanent and cannot be edited once entered.",
  },
  {
    id: "mgr-fee",
    category: "mgr",
    title: "Platform fee on payouts",
    description:
      "The group's configured platform fee percentage is deducted from each payout before it's released, and is the recipient's responsibility to settle before the slot is marked complete.",
  },

  // ── Welfare — requires welfareEnabled ────────────────────────────────────
  {
    id: "welfare-qualifying-events",
    category: "welfare",
    title: "Qualifying events",
    description:
      "The welfare fund covers bereavement (member or immediate family), hospitalization exceeding 3 days, and maternity. Other events may be approved case-by-case by staff vote.",
  },
  {
    id: "welfare-window",
    category: "welfare",
    title: "Claim submission window",
    description:
      "A welfare claim must be submitted within 30 days of the qualifying event. Claims submitted later are only considered with a documented, reasonable excuse for the delay.",
  },
  {
    id: "welfare-cap",
    category: "welfare",
    title: "Maximum payout per claim",
    description:
      "A single welfare claim is capped at Ksh 20,000 unless the group votes to approve a higher amount for an exceptional case. A member may not claim more than twice per calendar year.",
    suggestedPenaltyAmount: 20000,
  },
  {
    id: "welfare-verification",
    category: "welfare",
    title: "Verification required",
    description:
      "A claim must include supporting evidence (death certificate, hospital admission note, or equivalent) before it can be approved for disbursement.",
  },

  // ── Fines ────────────────────────────────────────────────────────────────
  {
    id: "fines-lateness",
    category: "fines",
    title: "Meeting lateness fine",
    description:
      "A member arriving more than 15 minutes after a meeting's start time is marked late and fined the group's configured lateness amount.",
    suggestedPenaltyAmount: 100,
  },
  {
    id: "fines-absence",
    category: "fines",
    title: "Absence fine and valid excuses",
    description:
      "An unexcused absence from a scheduled meeting attracts the group's configured absence fine. Illness, bereavement, or prior written notice to the Secretary count as a valid excuse.",
    suggestedPenaltyAmount: 200,
  },
  {
    id: "fines-repeat",
    category: "fines",
    title: "Repeated violations",
    description:
      "A third unexcused absence or rule violation within any 6-month period doubles the standard fine for that violation and may be raised for a formal warning at the next meeting.",
  },

  // ── Meetings ─────────────────────────────────────────────────────────────
  {
    id: "meetings-frequency",
    category: "meetings",
    title: "Meeting frequency",
    description:
      "The group meets monthly on the day agreed in Settings, plus an Annual General Meeting each year to review performance, elect officials, and approve any rule changes.",
  },
  {
    id: "meetings-minutes",
    category: "meetings",
    title: "Minutes and circulation",
    description:
      "The Secretary records minutes for every meeting and shares them with all members within 7 days. Minutes are treated as the authoritative record of decisions made.",
  },
  {
    id: "meetings-agenda",
    category: "meetings",
    title: "Agenda items",
    description:
      "A member wishing to raise an item must submit it to the Secretary at least 2 days before the meeting so it can be added to the agenda in advance.",
  },

  // ── Projects (Investment) — requires projectsEnabled ────────────────────
  {
    id: "projects-approval",
    category: "projects",
    title: "Investment approval",
    description:
      "A new project or investment requires a simple majority vote at a meeting where quorum is met before the group commits any capital toward it.",
  },
  {
    id: "projects-distribution",
    category: "projects",
    title: "Profit distribution",
    description:
      "Returns from a completed project are distributed to contributing members in proportion to their individual contribution toward that project, after group-agreed overheads are deducted.",
  },
  {
    id: "projects-exit",
    category: "projects",
    title: "Withdrawing committed capital",
    description:
      "A member cannot withdraw capital already committed to an active project before its completion or agreed exit date, except by majority vote of the group in exceptional circumstances.",
  },

  // ── Other ────────────────────────────────────────────────────────────────
  {
    id: "other-conflict",
    category: "other",
    title: "Conflict of interest",
    description:
      "An official with a personal or financial interest in a matter before the group (e.g. their own loan application) must declare it and step out of that specific decision.",
  },
  {
    id: "other-records",
    category: "other",
    title: "Access to records",
    description:
      "Any member may request their own contribution, loan, and fine history at any time; group-wide financial records are available to all members on request to the Treasurer.",
  },
];

/** Pure filter — mirrors lib/nav-config.ts's getVisibleNavItems: one place templates get gated by product, safe to call from a Client Component. */
export function visibleRuleTemplates(products: ProductFlags): RuleTemplate[] {
  return RULE_TEMPLATES.filter((t) => {
    const requiredProduct = CATEGORY_PRODUCT[t.category];
    return !requiredProduct || products[requiredProduct];
  });
}
