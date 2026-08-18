import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  boolean,
  numeric,
  date,
  timestamp,
  unique,
  uniqueIndex,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ── Enums ──────────────────────────────────────────────────────────────────
export const groupTypeEnum = pgEnum("group_type", [
  "chama",
  "welfare",
  "hybrid",
  "selfhelp",
]);

export const membershipRoleEnum = pgEnum("membership_role", [
  "admin",
  "treasurer",
  "secretary",
  "member",
]);

export const membershipStatusEnum = pgEnum("membership_status", [
  "pending",
  "active",
  "rejected",
  "suspended",
]);

export const platformRoleEnum = pgEnum("platform_role", ["owner", "support"]);

export const kycIdTypeEnum = pgEnum("kyc_id_type", ["national_id", "passport"]);

export const ruleCategoryEnum = pgEnum("rule_category", [
  "general",
  "contributions",
  "loans",
  "mgr",
  "welfare",
  "fines",
  "meetings",
  "projects",
  "other",
]);

export const ruleAppliesToEnum = pgEnum("rule_applies_to", [
  "all",
  "chama",
  "welfare",
  "selfhelp",
  "hybrid",
]);

export const contributionTypeEnum = pgEnum("contribution_type", [
  "capital",
  "security",
  "mgr",
  "welfare",
  "personal_savings",
  "project",
  "other",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "paid",
  "pending",
  "waived",
]);

// Bug 3 in the rewrite plan: the original app inserted fines.type = 'absent'
// or 'late' directly from attendance status, but the CHECK constraint (and
// this enum) only ever allowed 'absence'/'lateness'. attendanceStatusToFineType()
// in lib/domain/fines.ts is the one place that maps between the two — see
// how each of the 9 bugs is prevented by design in docs/architecture.md.
export const fineTypeEnum = pgEnum("fine_type", [
  "lateness",
  "absence",
  "rule_violation",
  "loan_default",
  "other",
]);

export const fineStatusEnum = pgEnum("fine_status", ["pending", "paid", "waived"]);

export const meetingTypeEnum = pgEnum("meeting_type", [
  "regular",
  "special",
  "emergency",
  "agm",
]);

export const attendanceStatusEnum = pgEnum("attendance_status", [
  "present",
  "absent",
  "late",
  "excused",
]);

export const loanStatusEnum = pgEnum("loan_status", [
  "pending",
  "active",
  "extended",
  "overdue",
  "cleared",
  "rejected",
]);

export const loanApplicationStatusEnum = pgEnum("loan_application_status", [
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);

export const loanGuarantorStatusEnum = pgEnum("loan_guarantor_status", [
  "pending",
  "accepted",
  "declined",
  "released",
]);

export const welfareClaimTypeEnum = pgEnum("welfare_claim_type", [
  "medical",
  "bereavement",
  "emergency",
  "education",
  "maternity",
  "disability",
  "other",
]);

export const welfareClaimStatusEnum = pgEnum("welfare_claim_status", [
  "pending",
  "under_review",
  "approved",
  "rejected",
  "disbursed",
]);

// Phase 8: the collective welfare fund replacing the old welfare_claims
// model — see the welfare_* tables below for the full design.
export const welfareFundingMethodEnum = pgEnum("welfare_funding_method", [
  "fixed_amount",
  "pct_collections",
  "pct_contribution",
  "manual",
]);

export const welfareReserveEnum = pgEnum("welfare_reserve", [
  "emergency",
  "long_term",
  "advance",
]);

export const welfareLedgerEntryTypeEnum = pgEnum("welfare_ledger_entry_type", [
  "allocation_in",
  "grant_out",
  "advance_out",
  "repayment_in",
  "reversal",
  "adjustment_in",
  "adjustment_out",
]);

export const welfareRequestStatusEnum = pgEnum("welfare_request_status", [
  "pending",
  "under_review",
  "approved",
  "rejected",
  "disbursed",
  "cancelled",
]);

export const welfareApprovalStatusEnum = pgEnum("welfare_approval_status", [
  "pending",
  "accepted",
  "declined",
]);

export const welfareAdvanceStatusEnum = pgEnum("welfare_advance_status", [
  "active",
  "paid",
  "overdue",
  "defaulted",
  "written_off",
]);

// Generic, reusable across future features — deliberately not welfare-named.
export const notificationCategoryEnum = pgEnum("notification_category", [
  "info",
  "success",
  "warning",
  "action_required",
]);

export const projectStatusEnum = pgEnum("project_status", [
  "planning",
  "active",
  "on_hold",
  "completed",
  "cancelled",
]);

export const mgrCycleStatusEnum = pgEnum("mgr_cycle_status", [
  "planned",
  "active",
  "completed",
  "closed",
]);

export const mgrSlotStatusEnum = pgEnum("mgr_slot_status", [
  "open",
  "claimed",
  "auto_assigned",
  "paid",
  "skipped",
]);

export const mgrFrequencyEnum = pgEnum("mgr_frequency", ["weekly", "biweekly", "monthly"]);

export const paymentStatusTypeEnum = pgEnum("platform_payment_status", [
  "pending",
  "paid",
  "failed",
  "cancelled",
]);

export const paymentTypeEnum = pgEnum("platform_payment_type", [
  "mgr_fee",
  "subscription",
  "wallet_topup",
  "loan_fee",
  "other",
]);

export const billingCycleEnum = pgEnum("billing_cycle", ["monthly", "annual"]);

export const walletTransactionTypeEnum = pgEnum("wallet_transaction_type", [
  "topup",
  "fee_deduction",
  "refund",
]);

export const contributionDueStatusEnum = pgEnum("contribution_due_status", [
  "pending",
  "paid",
  "overdue",
  "waived",
]);

// ── Groups (tenants) ─────────────────────────────────────────────────────
export const groups = pgTable("groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: groupTypeEnum("type").notNull(),
  registrationNo: text("registration_no"),
  description: text("description"),
  logoUrl: text("logo_url"),
  foundedDate: date("founded_date"),
  currency: text("currency").notNull().default("KES"),

  // Meeting defaults
  meetingDay: text("meeting_day"),
  meetingTime: text("meeting_time").default("15:00"),
  meetingVenue: text("meeting_venue"),

  // Visibility / membership
  isPublic: boolean("is_public").notNull().default(true),
  requireApproval: boolean("require_approval").notNull().default(true),
  maxMembers: integer("max_members"),
  // Recomputed (not just set-once) by lib/domain/officials.ts's
  // computeRegistrationComplete whenever a role changes — true once the
  // group has at least one active admin, treasurer, and secretary. Gates
  // public discoverability and new-member approval; existing operations
  // for the founding admin are NOT blocked by this (see docs/architecture.md).
  registrationComplete: boolean("registration_complete").notNull().default(false),

  // Product entitlements — a group's access to loans/MGR/welfare/projects
  // is an explicit, independently toggleable flag (Settings > Products),
  // not implied by `type` anymore. `type` is now just a descriptive label
  // and the default these get seeded to at creation
  // (lib/domain/products.ts's defaultProductsForType) — changing it later
  // doesn't change access, only these flags do. See docs/architecture.md.
  loansEnabled: boolean("loans_enabled").notNull().default(false),
  mgrEnabled: boolean("mgr_enabled").notNull().default(false),
  welfareEnabled: boolean("welfare_enabled").notNull().default(false),
  projectsEnabled: boolean("projects_enabled").notNull().default(false),

  // Contribution settings
  sharePrice: numeric("share_price", { precision: 14, scale: 2 })
    .notNull()
    .default("2000"),
  sharesPerMember: integer("shares_per_member").notNull().default(1),
  contributionDay: integer("contribution_day").notNull().default(1),

  // Loan settings
  loanInterestRate: numeric("loan_interest_rate", { precision: 5, scale: 2 })
    .notNull()
    .default("20.00"),
  loanMaxMultiplier: numeric("loan_max_multiplier", { precision: 5, scale: 2 })
    .notNull()
    .default("3.00"),
  loanRepaymentMonths: integer("loan_repayment_months").notNull().default(6),
  loanLatePenalty: numeric("loan_late_penalty", { precision: 14, scale: 2 })
    .notNull()
    .default("500"),
  // How many guarantors must have accepted (see loan_guarantors below)
  // before a self-service loan application can be approved. Doesn't gate
  // staff-direct loan creation — see reviewApplicationAction/createLoanAction
  // in app/(dashboard)/loans/actions.ts for the reasoning.
  loanMinGuarantors: integer("loan_min_guarantors").notNull().default(1),

  // MGR settings
  mgrPoolAmount: numeric("mgr_pool_amount", { precision: 14, scale: 2 }).default(
    "0",
  ),
  mgrMemberCount: integer("mgr_member_count").default(2),
  mgrFrequency: mgrFrequencyEnum("mgr_frequency").notNull().default("monthly"),
  mgrCycleDay: integer("mgr_cycle_day").default(1),
  mgrRecipientsPerCycle: integer("mgr_recipients_per_cycle").default(1),
  mgrStartDate: date("mgr_start_date"),
  mgrContributionAmount: numeric("mgr_contribution_amount", {
    precision: 12,
    scale: 2,
  }),
  mgrFeePct: numeric("mgr_fee_pct", { precision: 5, scale: 2 })
    .notNull()
    .default("5.00"),
  mgrTerms: text("mgr_terms"),

  // Fine settings
  fineLateness: numeric("fine_lateness", { precision: 14, scale: 2 })
    .notNull()
    .default("100"),
  fineAbsence: numeric("fine_absence", { precision: 14, scale: 2 })
    .notNull()
    .default("200"),
  fineRuleViolation: numeric("fine_rule_violation", {
    precision: 14,
    scale: 2,
  })
    .notNull()
    .default("500"),

  // Capital allocation policy — nullable/unset means the group hasn't
  // configured one yet (see lib/domain/capital.ts's computeAllocationDrift,
  // which returns null rather than flagging drift when this is unset). What
  // fraction of the capital pool (sum of members.capital — deliberately NOT
  // security or personal_savings, which the schema already treats as
  // separate, non-lendable pools) the group intends to typically have out
  // on loan at once.
  targetLoanDeploymentPct: numeric("target_loan_deployment_pct", {
    precision: 5,
    scale: 2,
  }),

  // Platform
  platformTerms: text("platform_terms"),

  // Contact
  phone: text("phone"),
  email: text("email"),

  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Users (login identity — NOT the source of per-group role) ──────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").unique(),
  phone: text("phone"),
  idNumber: text("id_number"),
  passwordHash: text("password_hash").notNull(),
  // Genuinely global role (not scoped to any group) — for the super-admin surface only.
  // Deliberately distinct from group_memberships.role, which is the per-group source of truth.
  platformRole: platformRoleEnum("platform_role"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Members (financial profile per user-in-group) ──────────────────────────
// userId is unique PER GROUP, not globally — a user with financial profiles
// in two different groups (the whole point of multi-tenancy) needs two rows
// here, one per group. A bare column-level .unique() would only allow a user
// to ever have one members row on the entire platform; see docs/architecture.md
// Phase 6 notes for the migration that fixed this from a global to a
// composite (user_id, group_id) constraint.
export const members = pgTable(
  "members",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    idNumber: text("id_number"),

    // KYC — captured once per person, propagated across every group a user
    // belongs to (see updateMyKycAction / approveMembershipAction /
    // createGroupAction) rather than re-collected per group. Lives here
    // (not on `users`) because a members row is the canonical "real person
    // in this group" even before they have a login — staff can add a
    // member with no account yet. All nullable: a member can exist before
    // KYC is complete; kycCompletedAt is stamped once the required set for
    // their current role (see lib/domain/officials.ts) is present.
    idType: kycIdTypeEnum("id_type"),
    idDocumentUrl: text("id_document_url"),
    photoUrl: text("photo_url"),
    signatureUrl: text("signature_url"),
    address: text("address"),
    kycCompletedAt: timestamp("kyc_completed_at", { withTimezone: true }),

    capital: numeric("capital", { precision: 14, scale: 2 }).notNull().default("0"),
    security: numeric("security", { precision: 14, scale: 2 }).notNull().default("0"),
    personalSavings: numeric("personal_savings", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    welfareBalance: numeric("welfare_balance", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    totalFines: numeric("total_fines", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    limitReduced: boolean("limit_reduced").notNull().default(false),

    active: boolean("active").notNull().default(true),
    notes: text("notes"),
    joinedDate: date("joined_date").notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("members_user_group_unique").on(t.userId, t.groupId),
    index("members_group_id_idx").on(t.groupId),
  ],
);

// ── Group memberships — the multi-tenancy join table & sole role source ────
export const groupMemberships = pgTable(
  "group_memberships",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull().default("member"),
    // Distinct from createdAt (date joined the group) — a member can join
    // as a plain member and be appointed to an office later; this tracks
    // when their *current* role was actually assigned.
    roleAssignedAt: timestamp("role_assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    status: membershipStatusEnum("status").notNull().default("pending"),
    joinMessage: text("join_message"),
    reviewedBy: integer("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    // Stamped automatically the moment this membership becomes active
    // (approveMembershipAction, or the founding admin's own insert in
    // createGroupAction) — the group's rule set applies inherently, not
    // via a separate opt-in consent step like the MGR agreement gate.
    rulesAcceptedAt: timestamp("rules_accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("group_memberships_user_group_unique").on(t.userId, t.groupId),
    index("group_memberships_group_id_idx").on(t.groupId),
  ],
);

// ── Sessions — DB-backed cookie auth, carries active tenant server-side ────
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // opaque random token
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  activeGroupId: integer("active_group_id").references(() => groups.id, {
    onDelete: "set null",
  }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Rules (group bylaws) ────────────────────────────────────────────────
export const rules = pgTable(
  "rules",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    ruleNumber: text("rule_number").notNull(),
    category: ruleCategoryEnum("category").notNull().default("general"),
    title: text("title"),
    description: text("description").notNull(),
    penaltyAmount: numeric("penalty_amount", { precision: 14, scale: 2 }),
    appliesTo: ruleAppliesToEnum("applies_to").notNull().default("all"),
    active: boolean("active").notNull().default(true),
    effectiveDate: date("effective_date").notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rules_group_id_idx").on(t.groupId)],
);

// ── Announcements ────────────────────────────────────────────────────────
export const announcements = pgTable(
  "announcements",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    pinned: boolean("pinned").notNull().default(false),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("announcements_group_id_idx").on(t.groupId)],
);

// ── Contributions ────────────────────────────────────────────────────────
// group_id and member_id both indexed: group_id backs the RLS filter every
// query already applies, member_id backs per-member lookups (statement
// page's merged timeline, the welfare fund's collected aggregate).
export const contributions = pgTable(
  "contributions",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    type: contributionTypeEnum("type").notNull(),
    month: integer("month"),
    year: integer("year"),
    status: paymentStatusEnum("status").notNull().default("paid"),
    reference: text("reference"),
    notes: text("notes"),
    recordedBy: integer("recorded_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("contributions_group_id_idx").on(t.groupId),
    index("contributions_member_id_idx").on(t.memberId),
  ],
);

// ── Fines ────────────────────────────────────────────────────────────────
export const fines = pgTable(
  "fines",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    type: fineTypeEnum("type").notNull().default("other"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    reason: text("reason"),
    status: fineStatusEnum("status").notNull().default("pending"),
    meetingDate: date("meeting_date"),
    recordedBy: integer("recorded_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("fines_group_id_idx").on(t.groupId)],
);

// ── Meetings ─────────────────────────────────────────────────────────────
export const meetings = pgTable(
  "meetings",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    meetingDate: date("meeting_date").notNull(),
    meetingType: meetingTypeEnum("meeting_type").notNull().default("regular"),
    venue: text("venue"),
    agenda: text("agenda"),
    minutes: text("minutes"),
    quorumMet: boolean("quorum_met"),
    chairedBy: text("chaired_by"),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("meetings_group_id_idx").on(t.groupId)],
);

// ── Meeting attendance ───────────────────────────────────────────────────
// Denormalized group_id (the original schema only had meeting_id -> meetings.group_id)
// so RLS can filter this table directly instead of via a subquery on meetings.
export const attendance = pgTable(
  "attendance",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    meetingId: integer("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    status: attendanceStatusEnum("status").notNull().default("absent"),
    fineIssued: boolean("fine_issued").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("attendance_meeting_member_unique").on(t.meetingId, t.memberId),
    index("attendance_group_id_idx").on(t.groupId),
  ],
);

// ── Loans ────────────────────────────────────────────────────────────────
// Three indexes, each backing a real hot path: group_id for RLS/tenant
// scoping, member_id for the "does this member already have an outstanding
// loan" check every loan action runs, and the (status, due_date) composite
// for the loan-overdue cron — which scans across EVERY group's loans every
// day, so it grows with total platform size, not any one group's size.
export const loans = pgTable(
  "loans",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    principal: numeric("principal", { precision: 14, scale: 2 }).notNull(),
    interestRate: numeric("interest_rate", { precision: 5, scale: 2 }).notNull(),
    totalRepayable: numeric("total_repayable", { precision: 14, scale: 2 }).notNull(),
    amountRemaining: numeric("amount_remaining", { precision: 14, scale: 2 }).notNull(),
    status: loanStatusEnum("status").notNull().default("active"),
    extended: boolean("extended").notNull().default(false),
    limitReducedByExtension: boolean("limit_reduced_by_extension").notNull().default(false),
    purpose: text("purpose"),
    issuedDate: date("issued_date").notNull().defaultNow(),
    dueDate: date("due_date"),
    clearedDate: date("cleared_date"),
    overdueFlaggedAt: timestamp("overdue_flagged_at", { withTimezone: true }),
    penaltyTotal: numeric("penalty_total", { precision: 14, scale: 2 }).notNull().default("0"),
    approvedBy: integer("approved_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("loans_group_id_idx").on(t.groupId),
    index("loans_member_id_idx").on(t.memberId),
    index("loans_status_due_date_idx").on(t.status, t.dueDate),
  ],
);

// ── Loan repayments ──────────────────────────────────────────────────────
// Denormalized group_id (same reasoning as attendance) so RLS applies directly.
export const loanRepayments = pgTable(
  "loan_repayments",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    loanId: integer("loan_id")
      .notNull()
      .references(() => loans.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    reference: text("reference"),
    notes: text("notes"),
    recordedBy: integer("recorded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("loan_repayments_group_id_idx").on(t.groupId),
    index("loan_repayments_loan_id_idx").on(t.loanId),
  ],
);

// ── Loan applications (member self-service) ─────────────────────────────
export const loanApplications = pgTable(
  "loan_applications",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    amountRequested: numeric("amount_requested", { precision: 14, scale: 2 }).notNull(),
    purpose: text("purpose"),
    repaymentMonths: integer("repayment_months").notNull().default(3),
    status: loanApplicationStatusEnum("status").notNull().default("pending"),
    reviewedBy: integer("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNotes: text("review_notes"),
    loanId: integer("loan_id").references(() => loans.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("loan_applications_group_id_idx").on(t.groupId)],
);

// ── Loan guarantors — real consent, not just a listed name ─────────────
// Exactly one of applicationId/loanId is set, never both: a guarantor is
// requested against a self-service loan_application (before staff can
// approve it — see reviewApplicationAction) or attached directly to a
// staff-created loan (auto-accepted, since staff already vouch for it
// directly — see createLoanAction). When an application is approved,
// reviewApplicationAction re-points these rows' applicationId -> loanId
// rather than creating new ones, so the acceptance record carries over
// intact instead of being re-requested.
export const loanGuarantors = pgTable(
  "loan_guarantors",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    applicationId: integer("application_id").references(() => loanApplications.id, {
      onDelete: "cascade",
    }),
    loanId: integer("loan_id").references(() => loans.id, { onDelete: "cascade" }),
    // The guarantor — a members row, not the borrower.
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    status: loanGuarantorStatusEnum("status").notNull().default("pending"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (t) => [
    // A member can't be asked to guarantee the same application twice.
    unique("loan_guarantors_application_member_unique").on(t.applicationId, t.memberId),
    index("loan_guarantors_group_id_idx").on(t.groupId),
    // Backs "how many loans is this member currently guaranteeing" —
    // computeGuarantorExposure's query, checked on every new request.
    index("loan_guarantors_member_id_idx").on(t.memberId),
    index("loan_guarantors_loan_id_idx").on(t.loanId),
  ],
);

// ── Welfare claims — DEPRECATED (Phase 8). Superseded by welfare_requests/
// welfare_grants below: this table only ever supported a single-approver,
// no-fund-balance-check disbursement with no concept of a collective fund.
// Nothing writes to it anymore; its history was migrated forward into the
// new model by drizzle/0036_phase8_welfare_backfill.sql. Kept, not dropped,
// since a hard drop can't be verified safe for production data from a
// read-only pass over the code — see docs/architecture.md Phase 8 notes.
export const welfareClaims = pgTable(
  "welfare_claims",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    beneficiaryName: text("beneficiary_name"),
    beneficiaryRel: text("beneficiary_rel"),
    claimType: welfareClaimTypeEnum("claim_type").notNull().default("other"),
    amountRequested: numeric("amount_requested", { precision: 14, scale: 2 }).notNull(),
    amountApproved: numeric("amount_approved", { precision: 14, scale: 2 }),
    status: welfareClaimStatusEnum("status").notNull().default("pending"),
    description: text("description"),
    reviewedBy: integer("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    disbursedAt: timestamp("disbursed_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("welfare_claims_group_id_idx").on(t.groupId)],
);

// ── Welfare policy — one row per group, the configurable collective-fund
// engine (funding method, reserve-allocation split, caps, cooldowns,
// approval-tier thresholds). Its own table rather than columns on `groups`
// (unlike loan settings) because its ~18-field surface would meaningfully
// bloat that table — precedented by groupWallets's one-row-per-group shape.
export const welfarePolicies = pgTable("welfare_policies", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id")
    .notNull()
    .unique()
    .references(() => groups.id, { onDelete: "cascade" }),
  fundingMethod: welfareFundingMethodEnum("funding_method").notNull().default("manual"),
  fundingFixedAmount: numeric("funding_fixed_amount", { precision: 14, scale: 2 }),
  fundingPct: numeric("funding_pct", { precision: 5, scale: 2 }),
  // emergency + longTerm + advance must sum to 100 — validated in
  // lib/domain/welfare-policy.ts's validateAllocationSplit, not a DB CHECK
  // (numeric rounding makes an exact-100 constraint brittle at the DB layer).
  emergencyAllocationPct: numeric("emergency_allocation_pct", { precision: 5, scale: 2 })
    .notNull()
    .default("50"),
  longTermAllocationPct: numeric("long_term_allocation_pct", { precision: 5, scale: 2 })
    .notNull()
    .default("30"),
  advanceAllocationPct: numeric("advance_allocation_pct", { precision: 5, scale: 2 })
    .notNull()
    .default("20"),
  maxEmergencyGrant: numeric("max_emergency_grant", { precision: 14, scale: 2 })
    .notNull()
    .default("20000"),
  maxLongTermGrant: numeric("max_long_term_grant", { precision: 14, scale: 2 })
    .notNull()
    .default("50000"),
  maxAdvance: numeric("max_advance", { precision: 14, scale: 2 }).notNull().default("30000"),
  maxOutstandingAdvancePerMember: numeric("max_outstanding_advance_per_member", {
    precision: 14,
    scale: 2,
  })
    .notNull()
    .default("30000"),
  minEmergencyReserveFloor: numeric("min_emergency_reserve_floor", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  maxClaimsPerMemberPerYear: integer("max_claims_per_member_per_year").notNull().default(2),
  cooldownDays: integer("cooldown_days").notNull().default(30),
  minTenureMonths: integer("min_tenure_months").notNull().default(0),
  advanceFeePct: numeric("advance_fee_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  advanceMaxRepaymentMonths: integer("advance_max_repayment_months").notNull().default(6),
  // Approval tiers: up to tier1MaxAmount = single staff (admin/treasurer)
  // decision; up to tier2MaxAmount = 2 co-signing officials; above that =
  // all 3 officials (tier3) — see lib/domain/welfare-approval.ts.
  tier1MaxAmount: numeric("tier1_max_amount", { precision: 14, scale: 2 })
    .notNull()
    .default("10000"),
  tier2MaxAmount: numeric("tier2_max_amount", { precision: 14, scale: 2 })
    .notNull()
    .default("30000"),
  allowOverdraft: boolean("allow_overdraft").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Welfare fund — one row per group, cached reserve balances. Same
// cached-balance-plus-append-only-ledger pattern as groupWallets/
// walletTransactions (below), generalized to 3 named reserves instead of 1.
export const welfareFunds = pgTable("welfare_funds", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id")
    .notNull()
    .unique()
    .references(() => groups.id, { onDelete: "cascade" }),
  emergencyBalance: numeric("emergency_balance", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  longTermBalance: numeric("long_term_balance", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  advanceBalance: numeric("advance_balance", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  lifetimeCollected: numeric("lifetime_collected", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  lifetimeGrantsDisbursed: numeric("lifetime_grants_disbursed", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  lifetimeAdvancesDisbursed: numeric("lifetime_advances_disbursed", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  lifetimeRecovered: numeric("lifetime_recovered", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Welfare requests — the single member submission; can carry emergency +
// long-term + advance amounts simultaneously (the hybrid-assistance
// mechanism — see welfareGrants/welfareAdvances below, which turns an
// approved request into two distinct financial instruments so a member
// never owes a grant amount, only an advance).
export const welfareRequests = pgTable(
  "welfare_requests",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    reason: welfareClaimTypeEnum("reason").notNull().default("other"),
    beneficiaryName: text("beneficiary_name"),
    beneficiaryRel: text("beneficiary_rel"),
    description: text("description"),
    requestedEmergencyAmount: numeric("requested_emergency_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    requestedLongTermAmount: numeric("requested_long_term_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    requestedAdvanceAmount: numeric("requested_advance_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    approvedEmergencyAmount: numeric("approved_emergency_amount", { precision: 14, scale: 2 }),
    approvedLongTermAmount: numeric("approved_long_term_amount", { precision: 14, scale: 2 }),
    approvedAdvanceAmount: numeric("approved_advance_amount", { precision: 14, scale: 2 }),
    // Snapshotted at submission from lib/domain/welfare-approval.ts's
    // resolveApprovalTier — the policy's thresholds can change later
    // without rewriting an in-flight request's required approval path.
    approvalTier: text("approval_tier").notNull().default("tier1"),
    status: welfareRequestStatusEnum("status").notNull().default("pending"),
    reviewedBy: integer("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    disbursedAt: timestamp("disbursed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("welfare_requests_group_id_idx").on(t.groupId),
    index("welfare_requests_member_id_idx").on(t.memberId),
    index("welfare_requests_status_idx").on(t.status),
    // Fail-safe, DB-level backstop for "no simultaneous emergency claims per
    // member" (also checked in app code at submission — this guards the
    // race between two concurrent submissions, same reasoning as every
    // other DB-level constraint in this schema backing an app-level check).
    uniqueIndex("welfare_requests_member_open_emergency_unique")
      .on(t.memberId)
      .where(
        sql`${t.requestedEmergencyAmount} > 0 AND ${t.status} IN ('pending', 'under_review')`,
      ),
  ],
);

// ── Welfare grants — the non-repayable financial record. At most one per
// request; reserve-level detail (how much came from which reserve) lives in
// welfareLedger below — this is just the summary the member/admin see.
export const welfareGrants = pgTable(
  "welfare_grants",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    requestId: integer("request_id")
      .notNull()
      .unique()
      .references(() => welfareRequests.id, { onDelete: "cascade" }),
    emergencyAmount: numeric("emergency_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    longTermAmount: numeric("long_term_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    disbursedAt: timestamp("disbursed_at", { withTimezone: true }).notNull().defaultNow(),
    disbursedBy: integer("disbursed_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("welfare_grants_group_id_idx").on(t.groupId)],
);

// ── Welfare advances — the repayable financial record, mirrors `loans`. At
// most one per request. A member's outstanding obligation is always exactly
// this table's amountRemaining, never the grant amount from the same
// request (see welfareGrants above) — a combined grant+advance request
// produces both rows, but the member only ever owes the advance principal.
export const welfareAdvances = pgTable(
  "welfare_advances",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    requestId: integer("request_id")
      .notNull()
      .unique()
      .references(() => welfareRequests.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    principal: numeric("principal", { precision: 14, scale: 2 }).notNull(),
    feePct: numeric("fee_pct", { precision: 5, scale: 2 }).notNull().default("0"),
    feeAmount: numeric("fee_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    totalRepayable: numeric("total_repayable", { precision: 14, scale: 2 }).notNull(),
    amountRemaining: numeric("amount_remaining", { precision: 14, scale: 2 }).notNull(),
    status: welfareAdvanceStatusEnum("status").notNull().default("active"),
    issuedDate: date("issued_date").notNull().defaultNow(),
    dueDate: date("due_date").notNull(),
    clearedDate: date("cleared_date"),
    disbursedBy: integer("disbursed_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("welfare_advances_group_id_idx").on(t.groupId),
    index("welfare_advances_member_id_idx").on(t.memberId),
    index("welfare_advances_status_due_date_idx").on(t.status, t.dueDate),
  ],
);

// ── Welfare advance repayments — mirrors loan_repayments exactly.
export const welfareAdvanceRepayments = pgTable(
  "welfare_advance_repayments",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    advanceId: integer("advance_id")
      .notNull()
      .references(() => welfareAdvances.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    reference: text("reference"),
    notes: text("notes"),
    recordedBy: integer("recorded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("welfare_advance_repayments_group_id_idx").on(t.groupId),
    index("welfare_advance_repayments_advance_id_idx").on(t.advanceId),
  ],
);

// ── Welfare approvals — tier2/tier3 co-sign record, same request/response
// shape as loan_guarantors: memberId is the specific officeholder resolved
// at request-creation time (not a role looked up fresh at response time),
// role is a snapshot for display/audit. Unlike loan guarantors there's no
// "extra pool" beyond the 3 officials — a decline here hard-rejects the
// request rather than waiting on a wider quorum, since there's no one else
// to fall back on. See docs/architecture.md Phase 8 notes.
export const welfareApprovals = pgTable(
  "welfare_approvals",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    requestId: integer("request_id")
      .notNull()
      .references(() => welfareRequests.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull(),
    status: welfareApprovalStatusEnum("status").notNull().default("pending"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    comment: text("comment"),
  },
  (t) => [
    unique("welfare_approvals_request_member_unique").on(t.requestId, t.memberId),
    index("welfare_approvals_group_id_idx").on(t.groupId),
    index("welfare_approvals_member_id_idx").on(t.memberId),
    index("welfare_approvals_request_id_idx").on(t.requestId),
  ],
);

// ── Welfare ledger — immutable, same pattern as wallet_transactions/
// mgr_slot_events: no UPDATE/DELETE RLS policy exists for this table at all
// (see drizzle/0035_phase8_welfare_policy_ledger_rls.sql), so corrections
// must be new reversal/adjustment rows, never edits.
export const welfareLedger = pgTable(
  "welfare_ledger",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    reserve: welfareReserveEnum("reserve").notNull(),
    entryType: welfareLedgerEntryTypeEnum("entry_type").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    balanceAfter: numeric("balance_after", { precision: 14, scale: 2 }).notNull(),
    relatedRequestId: integer("related_request_id").references(() => welfareRequests.id, {
      onDelete: "set null",
    }),
    relatedAdvanceId: integer("related_advance_id").references(() => welfareAdvances.id, {
      onDelete: "set null",
    }),
    relatedContributionId: integer("related_contribution_id").references(
      () => contributions.id,
      { onDelete: "set null" },
    ),
    note: text("note"),
    recordedBy: integer("recorded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("welfare_ledger_group_id_idx").on(t.groupId),
    index("welfare_ledger_reserve_idx").on(t.reserve),
    index("welfare_ledger_related_request_id_idx").on(t.relatedRequestId),
    index("welfare_ledger_related_advance_id_idx").on(t.relatedAdvanceId),
  ],
);

// ── Projects (selfhelp / hybrid) ─────────────────────────────────────────
export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    targetAmount: numeric("target_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    collectedAmount: numeric("collected_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    status: projectStatusEnum("status").notNull().default("planning"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("projects_group_id_idx").on(t.groupId)],
);

// ── Project contributions ────────────────────────────────────────────────
// Denormalized group_id (same reasoning as attendance/loan_repayments).
export const projectContributions = pgTable(
  "project_contributions",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    reference: text("reference"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("project_contributions_group_id_idx").on(t.groupId)],
);

// ── MGR cycles ───────────────────────────────────────────────────────────
export const mgrCycles = pgTable(
  "mgr_cycles",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    cycleNumber: integer("cycle_number").notNull(),
    status: mgrCycleStatusEnum("status").notNull().default("planned"),
    scheduledDate: date("scheduled_date"),
    slotCount: integer("slot_count").notNull().default(1),
    payoutPerSlot: numeric("payout_per_slot", { precision: 12, scale: 2 }),
    totalContributions: numeric("total_contributions", { precision: 12, scale: 2 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("mgr_cycles_group_cycle_unique").on(t.groupId, t.cycleNumber)],
);

// ── MGR slots — one row per recipient slot within a cycle ────────────────
export const mgrSlots = pgTable(
  "mgr_slots",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    cycleId: integer("cycle_id").references(() => mgrCycles.id, { onDelete: "set null" }),
    cycleNumber: integer("cycle_number").notNull(),
    slotNumber: integer("slot_number").notNull(),
    memberId: integer("member_id").references(() => members.id, { onDelete: "set null" }),
    status: mgrSlotStatusEnum("status").notNull().default("open"),
    payoutAmount: numeric("payout_amount", { precision: 12, scale: 2 }),
    scheduledDate: date("scheduled_date"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    // The actual MGR payout happens outside the app (cash/M-Pesa between
    // members directly) — this is the one piece of evidence the app can
    // capture that it really happened, e.g. an M-Pesa confirmation code.
    // Optional (not every group will use it), but strongly encouraged in
    // the UI when marking a slot paid. See mgrSlotEvents below for the
    // immutable log of who set this and when.
    payoutReference: text("payout_reference"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("mgr_slots_group_cycle_slot_unique").on(t.groupId, t.cycleNumber, t.slotNumber),
  ],
);

// ── MGR slot events — immutable audit log, not just app convention ────────
// No UPDATE or DELETE policy exists for this table at all (see
// drizzle/0020_phase7_mgr_slot_events.sql) — under RLS with FORCE, a
// command with no matching policy is denied outright, for every role
// except one with BYPASSRLS (which chama_app deliberately doesn't have).
// This means even a compromised admin session, or a bug in this app's own
// code, cannot rewrite MGR history — only ever append to it. The actual
// payout still happens outside the app and nothing here can stop an admin
// from lying about it, but every claim/reassignment/paid-marking is now
// permanently attributed to a real user at a real time, which is the
// realistic, achievable "fraud prevention" for a system that can't itself
// move the money.
export const mgrSlotEvents = pgTable(
  "mgr_slot_events",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    slotId: integer("slot_id")
      .notNull()
      .references(() => mgrSlots.id, { onDelete: "cascade" }),
    actorUserId: integer("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorRole: membershipRoleEnum("actor_role"),
    action: text("action").notNull(),
    fromStatus: mgrSlotStatusEnum("from_status"),
    toStatus: mgrSlotStatusEnum("to_status"),
    fromMemberId: integer("from_member_id").references(() => members.id, { onDelete: "set null" }),
    toMemberId: integer("to_member_id").references(() => members.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("mgr_slot_events_group_id_idx").on(t.groupId),
    index("mgr_slot_events_slot_id_idx").on(t.slotId),
  ],
);

// ── MGR member turns ─────────────────────────────────────────────────────
export const mgrMemberTurns = pgTable(
  "mgr_member_turns",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    turnsTotal: integer("turns_total").notNull().default(1),
    contributionMultiplier: numeric("contribution_multiplier", { precision: 5, scale: 2 })
      .notNull()
      .default("1.0"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("mgr_member_turns_group_member_unique").on(t.groupId, t.memberId)],
);

// ── MGR agreements (4-field legal signature, gates participation) ───────
// Deliberately scoped per (user, cycle) — not just (user, group) like the
// original migration's constraint — since financial terms (contribution
// amount, payout amount) can differ between cycles and each cycle's
// agreement should be a distinct, re-signable record.
export const mgrAgreements = pgTable(
  "mgr_agreements",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cycleId: integer("cycle_id")
      .notNull()
      .references(() => mgrCycles.id, { onDelete: "cascade" }),
    platformTerms: boolean("platform_terms").notNull().default(false),
    groupTerms: boolean("group_terms").notNull().default(false),
    financialAcknowledged: boolean("financial_acknowledged").notNull().default(false),
    digitalSignature: text("digital_signature").notNull(),
    signedAt: timestamp("signed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("mgr_agreements_user_cycle_unique").on(t.userId, t.cycleId),
    index("mgr_agreements_group_id_idx").on(t.groupId),
  ],
);

// ── Platform payments (IntaSend M-Pesa STK push, e.g. the 5% MGR fee) ────
// invoice_id indexed too — that's the column the (unauthenticated, public)
// webhook callback keys every lookup on, and that table only grows.
export const platformPayments = pgTable(
  "platform_payments",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    mgrSlotId: integer("mgr_slot_id").references(() => mgrSlots.id, { onDelete: "set null" }),
    // Set when type = 'loan_fee' — the same "charge a service fee via STK push
    // for an event that happened outside the app" pattern mgrSlotId already
    // uses, extended to loan disbursement (see lib/domain/billing.ts's
    // computeTransactionFee).
    loanId: integer("loan_id").references(() => loans.id, { onDelete: "set null" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    feePct: numeric("fee_pct", { precision: 5, scale: 2 }).notNull().default("5.00"),
    phone: text("phone"),
    invoiceId: text("invoice_id"),
    mpesaReference: text("mpesa_reference"),
    status: paymentStatusTypeEnum("status").notNull().default("pending"),
    type: paymentTypeEnum("type").notNull().default("mgr_fee"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("platform_payments_group_id_idx").on(t.groupId),
    index("platform_payments_invoice_id_idx").on(t.invoiceId),
  ],
);

// ── Subscription invoices — computed by lib/domain/billing.ts's pricing
// engine (member band + vehicle band + activity band), one row per billing
// period. Snapshots the inputs (member count, which vehicles, the flow
// figure) alongside the computed amounts, so a past invoice stays
// explainable even after the group's membership/vehicles/activity later
// change — recomputing live would silently rewrite history. `paymentId`
// links to the platform_payments row once a charge is actually triggered
// (STK push or wallet deduction); an invoice can exist with no linked
// payment yet (just computed, not charged).
export const subscriptionInvoices = pgTable(
  "subscription_invoices",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    billingCycle: billingCycleEnum("billing_cycle").notNull().default("monthly"),
    memberCount: integer("member_count").notNull(),
    memberFee: numeric("member_fee", { precision: 14, scale: 2 }).notNull(),
    vehicleFee: numeric("vehicle_fee", { precision: 14, scale: 2 }).notNull(),
    activityFee: numeric("activity_fee", { precision: 14, scale: 2 }).notNull(),
    activityFlow: numeric("activity_flow", { precision: 14, scale: 2 }).notNull(),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
    status: paymentStatusTypeEnum("status").notNull().default("pending"),
    paymentId: integer("payment_id").references(() => platformPayments.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("subscription_invoices_group_id_idx").on(t.groupId)],
);

// ── Group wallet — a prepaid balance for PLATFORM FEES ONLY, never member
// savings. Explicitly non-custodial: this doesn't hold contributions, loan
// principal, or welfare funds — those are still recorded against member
// balances and reconciled via M-Pesa directly, same as before. `balance`
// is a fast-read cache; walletTransactions (below) is the append-only
// source of truth it's derived from, always updated together in the same
// transaction. See docs/architecture.md.
export const groupWallets = pgTable("group_wallets", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id")
    .notNull()
    .unique()
    .references(() => groups.id, { onDelete: "cascade" }),
  balance: numeric("balance", { precision: 14, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Wallet transactions — immutable, same pattern as mgr_slot_events: no
// UPDATE/DELETE RLS policy exists for this table at all (see
// 00XX_wallet_rls.sql), so it can't be edited or erased by the app's own
// role regardless of what a bug or a compromised session tries.
export const walletTransactions = pgTable(
  "wallet_transactions",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    type: walletTransactionTypeEnum("type").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    balanceAfter: numeric("balance_after", { precision: 14, scale: 2 }).notNull(),
    relatedPaymentId: integer("related_payment_id").references(() => platformPayments.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("wallet_transactions_group_id_idx").on(t.groupId)],
);

// ── Contribution dues — expected-payment tracking, drives the overdue-fine cron ──
export const contributionDues = pgTable(
  "contribution_dues",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    dueDate: date("due_date").notNull(),
    amountDue: numeric("amount_due", { precision: 14, scale: 2 }).notNull(),
    amountPaid: numeric("amount_paid", { precision: 14, scale: 2 }).notNull().default("0"),
    status: contributionDueStatusEnum("status").notNull().default("pending"),
    fineId: integer("fine_id").references(() => fines.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("contribution_dues_group_member_date_unique").on(t.groupId, t.memberId, t.dueDate),
    // Backs fineOverdueDues' cross-tenant scan (cron/contribution-dues) —
    // like loans_status_due_date_idx, this grows with total platform size,
    // not any one group's size, since the cron has no group_id filter.
    index("contribution_dues_status_due_date_idx").on(t.status, t.dueDate),
  ],
);

// ── Payment webhook events — raw audit log, not tenant-scoped for reads ──
// (the webhook handler doesn't know which tenant a payload belongs to until
// it looks up invoice_id, so this can't run through withTenant/RLS like
// everything else; it's written by trusted system code only).
export const paymentWebhookEvents = pgTable("payment_webhook_events", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().default("intasend"),
  invoiceId: text("invoice_id"),
  payload: jsonb("payload").notNull(),
  // Did IntaSend's `challenge` field match our configured shared secret.
  challengeValid: boolean("challenge_valid").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Cron run audit log — same "not tenant-scoped" reasoning as above ─────
export const cronRuns = pgTable("cron_runs", {
  id: serial("id").primaryKey(),
  jobName: text("job_name").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  rowsAffected: integer("rows_affected"),
  status: text("status").notNull().default("running"),
  errorMessage: text("error_message"),
});

// ── Notifications — generic, reusable in-app notification store (not
// welfare-specific, even though welfare is the first feature to populate
// it). No email/SMS delivery — in-app only, refetch-on-navigation, no live
// push. sourceType/sourceId are free text/no-FK since the source table
// varies per feature and shouldn't require a schema change to add a new one.
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: notificationCategoryEnum("category").notNull().default("info"),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    sourceType: text("source_type"),
    sourceId: integer("source_id"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_group_id_idx").on(t.groupId),
    index("notifications_user_id_read_at_idx").on(t.userId, t.readAt),
  ],
);

// ── Relations ────────────────────────────────────────────────────────────
export const groupsRelations = relations(groups, ({ many }) => ({
  memberships: many(groupMemberships),
  members: many(members),
  rules: many(rules),
  announcements: many(announcements),
  contributions: many(contributions),
  fines: many(fines),
  meetings: many(meetings),
  loans: many(loans),
  loanApplications: many(loanApplications),
  loanGuarantors: many(loanGuarantors),
  welfareClaims: many(welfareClaims),
  welfareRequests: many(welfareRequests),
  notifications: many(notifications),
  projects: many(projects),
  mgrCycles: many(mgrCycles),
  mgrSlots: many(mgrSlots),
  mgrMemberTurns: many(mgrMemberTurns),
  platformPayments: many(platformPayments),
  contributionDues: many(contributionDues),
  subscriptionInvoices: many(subscriptionInvoices),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(groupMemberships),
  sessions: many(sessions),
}));

export const membersRelations = relations(members, ({ one }) => ({
  group: one(groups, { fields: [members.groupId], references: [groups.id] }),
  user: one(users, { fields: [members.userId], references: [users.id] }),
}));

export const groupMembershipsRelations = relations(groupMemberships, ({ one }) => ({
  user: one(users, { fields: [groupMemberships.userId], references: [users.id] }),
  group: one(groups, { fields: [groupMemberships.groupId], references: [groups.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
  activeGroup: one(groups, {
    fields: [sessions.activeGroupId],
    references: [groups.id],
  }),
}));

export const rulesRelations = relations(rules, ({ one }) => ({
  group: one(groups, { fields: [rules.groupId], references: [groups.id] }),
}));

export const announcementsRelations = relations(announcements, ({ one }) => ({
  group: one(groups, { fields: [announcements.groupId], references: [groups.id] }),
  author: one(users, { fields: [announcements.createdBy], references: [users.id] }),
}));

export const contributionsRelations = relations(contributions, ({ one }) => ({
  group: one(groups, { fields: [contributions.groupId], references: [groups.id] }),
  member: one(members, { fields: [contributions.memberId], references: [members.id] }),
  recordedByUser: one(users, {
    fields: [contributions.recordedBy],
    references: [users.id],
  }),
}));

export const finesRelations = relations(fines, ({ one }) => ({
  group: one(groups, { fields: [fines.groupId], references: [groups.id] }),
  member: one(members, { fields: [fines.memberId], references: [members.id] }),
  recordedByUser: one(users, { fields: [fines.recordedBy], references: [users.id] }),
}));

export const meetingsRelations = relations(meetings, ({ one, many }) => ({
  group: one(groups, { fields: [meetings.groupId], references: [groups.id] }),
  createdByUser: one(users, { fields: [meetings.createdBy], references: [users.id] }),
  attendance: many(attendance),
}));

export const attendanceRelations = relations(attendance, ({ one }) => ({
  group: one(groups, { fields: [attendance.groupId], references: [groups.id] }),
  meeting: one(meetings, { fields: [attendance.meetingId], references: [meetings.id] }),
  member: one(members, { fields: [attendance.memberId], references: [members.id] }),
}));

export const loansRelations = relations(loans, ({ one, many }) => ({
  group: one(groups, { fields: [loans.groupId], references: [groups.id] }),
  member: one(members, { fields: [loans.memberId], references: [members.id] }),
  approvedByUser: one(users, { fields: [loans.approvedBy], references: [users.id] }),
  repayments: many(loanRepayments),
  guarantors: many(loanGuarantors),
}));

export const loanRepaymentsRelations = relations(loanRepayments, ({ one }) => ({
  group: one(groups, { fields: [loanRepayments.groupId], references: [groups.id] }),
  loan: one(loans, { fields: [loanRepayments.loanId], references: [loans.id] }),
  recordedByUser: one(users, { fields: [loanRepayments.recordedBy], references: [users.id] }),
}));

export const loanApplicationsRelations = relations(loanApplications, ({ one, many }) => ({
  group: one(groups, { fields: [loanApplications.groupId], references: [groups.id] }),
  member: one(members, { fields: [loanApplications.memberId], references: [members.id] }),
  reviewedByUser: one(users, { fields: [loanApplications.reviewedBy], references: [users.id] }),
  loan: one(loans, { fields: [loanApplications.loanId], references: [loans.id] }),
  guarantors: many(loanGuarantors),
}));

export const loanGuarantorsRelations = relations(loanGuarantors, ({ one }) => ({
  group: one(groups, { fields: [loanGuarantors.groupId], references: [groups.id] }),
  application: one(loanApplications, {
    fields: [loanGuarantors.applicationId],
    references: [loanApplications.id],
  }),
  loan: one(loans, { fields: [loanGuarantors.loanId], references: [loans.id] }),
  member: one(members, { fields: [loanGuarantors.memberId], references: [members.id] }),
}));

export const welfareClaimsRelations = relations(welfareClaims, ({ one }) => ({
  group: one(groups, { fields: [welfareClaims.groupId], references: [groups.id] }),
  member: one(members, { fields: [welfareClaims.memberId], references: [members.id] }),
  reviewedByUser: one(users, { fields: [welfareClaims.reviewedBy], references: [users.id] }),
}));

export const welfarePoliciesRelations = relations(welfarePolicies, ({ one }) => ({
  group: one(groups, { fields: [welfarePolicies.groupId], references: [groups.id] }),
}));

export const welfareFundsRelations = relations(welfareFunds, ({ one }) => ({
  group: one(groups, { fields: [welfareFunds.groupId], references: [groups.id] }),
}));

export const welfareRequestsRelations = relations(welfareRequests, ({ one, many }) => ({
  group: one(groups, { fields: [welfareRequests.groupId], references: [groups.id] }),
  member: one(members, { fields: [welfareRequests.memberId], references: [members.id] }),
  reviewedByUser: one(users, { fields: [welfareRequests.reviewedBy], references: [users.id] }),
  grant: one(welfareGrants, {
    fields: [welfareRequests.id],
    references: [welfareGrants.requestId],
  }),
  advance: one(welfareAdvances, {
    fields: [welfareRequests.id],
    references: [welfareAdvances.requestId],
  }),
  approvals: many(welfareApprovals),
}));

export const welfareGrantsRelations = relations(welfareGrants, ({ one }) => ({
  group: one(groups, { fields: [welfareGrants.groupId], references: [groups.id] }),
  request: one(welfareRequests, {
    fields: [welfareGrants.requestId],
    references: [welfareRequests.id],
  }),
  disbursedByUser: one(users, { fields: [welfareGrants.disbursedBy], references: [users.id] }),
}));

export const welfareAdvancesRelations = relations(welfareAdvances, ({ one, many }) => ({
  group: one(groups, { fields: [welfareAdvances.groupId], references: [groups.id] }),
  request: one(welfareRequests, {
    fields: [welfareAdvances.requestId],
    references: [welfareRequests.id],
  }),
  member: one(members, { fields: [welfareAdvances.memberId], references: [members.id] }),
  disbursedByUser: one(users, { fields: [welfareAdvances.disbursedBy], references: [users.id] }),
  repayments: many(welfareAdvanceRepayments),
}));

export const welfareAdvanceRepaymentsRelations = relations(
  welfareAdvanceRepayments,
  ({ one }) => ({
    group: one(groups, { fields: [welfareAdvanceRepayments.groupId], references: [groups.id] }),
    advance: one(welfareAdvances, {
      fields: [welfareAdvanceRepayments.advanceId],
      references: [welfareAdvances.id],
    }),
    recordedByUser: one(users, {
      fields: [welfareAdvanceRepayments.recordedBy],
      references: [users.id],
    }),
  }),
);

export const welfareApprovalsRelations = relations(welfareApprovals, ({ one }) => ({
  group: one(groups, { fields: [welfareApprovals.groupId], references: [groups.id] }),
  request: one(welfareRequests, {
    fields: [welfareApprovals.requestId],
    references: [welfareRequests.id],
  }),
  member: one(members, { fields: [welfareApprovals.memberId], references: [members.id] }),
}));

export const welfareLedgerRelations = relations(welfareLedger, ({ one }) => ({
  group: one(groups, { fields: [welfareLedger.groupId], references: [groups.id] }),
  relatedRequest: one(welfareRequests, {
    fields: [welfareLedger.relatedRequestId],
    references: [welfareRequests.id],
  }),
  relatedAdvance: one(welfareAdvances, {
    fields: [welfareLedger.relatedAdvanceId],
    references: [welfareAdvances.id],
  }),
  relatedContribution: one(contributions, {
    fields: [welfareLedger.relatedContributionId],
    references: [contributions.id],
  }),
  recordedByUser: one(users, { fields: [welfareLedger.recordedBy], references: [users.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  group: one(groups, { fields: [notifications.groupId], references: [groups.id] }),
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  group: one(groups, { fields: [projects.groupId], references: [groups.id] }),
  createdByUser: one(users, { fields: [projects.createdBy], references: [users.id] }),
  contributions: many(projectContributions),
}));

export const projectContributionsRelations = relations(projectContributions, ({ one }) => ({
  group: one(groups, { fields: [projectContributions.groupId], references: [groups.id] }),
  project: one(projects, { fields: [projectContributions.projectId], references: [projects.id] }),
  member: one(members, { fields: [projectContributions.memberId], references: [members.id] }),
}));

export const mgrCyclesRelations = relations(mgrCycles, ({ one, many }) => ({
  group: one(groups, { fields: [mgrCycles.groupId], references: [groups.id] }),
  slots: many(mgrSlots),
  agreements: many(mgrAgreements),
}));

export const mgrSlotsRelations = relations(mgrSlots, ({ one, many }) => ({
  group: one(groups, { fields: [mgrSlots.groupId], references: [groups.id] }),
  cycle: one(mgrCycles, { fields: [mgrSlots.cycleId], references: [mgrCycles.id] }),
  member: one(members, { fields: [mgrSlots.memberId], references: [members.id] }),
  events: many(mgrSlotEvents),
}));

export const mgrSlotEventsRelations = relations(mgrSlotEvents, ({ one }) => ({
  group: one(groups, { fields: [mgrSlotEvents.groupId], references: [groups.id] }),
  slot: one(mgrSlots, { fields: [mgrSlotEvents.slotId], references: [mgrSlots.id] }),
  actor: one(users, { fields: [mgrSlotEvents.actorUserId], references: [users.id] }),
  fromMember: one(members, {
    fields: [mgrSlotEvents.fromMemberId],
    references: [members.id],
    relationName: "mgrSlotEventFromMember",
  }),
  toMember: one(members, {
    fields: [mgrSlotEvents.toMemberId],
    references: [members.id],
    relationName: "mgrSlotEventToMember",
  }),
}));

export const mgrMemberTurnsRelations = relations(mgrMemberTurns, ({ one }) => ({
  group: one(groups, { fields: [mgrMemberTurns.groupId], references: [groups.id] }),
  member: one(members, { fields: [mgrMemberTurns.memberId], references: [members.id] }),
}));

export const mgrAgreementsRelations = relations(mgrAgreements, ({ one }) => ({
  group: one(groups, { fields: [mgrAgreements.groupId], references: [groups.id] }),
  user: one(users, { fields: [mgrAgreements.userId], references: [users.id] }),
  cycle: one(mgrCycles, { fields: [mgrAgreements.cycleId], references: [mgrCycles.id] }),
}));

export const platformPaymentsRelations = relations(platformPayments, ({ one }) => ({
  group: one(groups, { fields: [platformPayments.groupId], references: [groups.id] }),
  mgrSlot: one(mgrSlots, { fields: [platformPayments.mgrSlotId], references: [mgrSlots.id] }),
  loan: one(loans, { fields: [platformPayments.loanId], references: [loans.id] }),
}));

export const subscriptionInvoicesRelations = relations(subscriptionInvoices, ({ one }) => ({
  group: one(groups, { fields: [subscriptionInvoices.groupId], references: [groups.id] }),
  payment: one(platformPayments, {
    fields: [subscriptionInvoices.paymentId],
    references: [platformPayments.id],
  }),
}));

export const groupWalletsRelations = relations(groupWallets, ({ one }) => ({
  group: one(groups, { fields: [groupWallets.groupId], references: [groups.id] }),
}));

export const walletTransactionsRelations = relations(walletTransactions, ({ one }) => ({
  group: one(groups, { fields: [walletTransactions.groupId], references: [groups.id] }),
  relatedPayment: one(platformPayments, {
    fields: [walletTransactions.relatedPaymentId],
    references: [platformPayments.id],
  }),
}));

export const contributionDuesRelations = relations(contributionDues, ({ one }) => ({
  group: one(groups, { fields: [contributionDues.groupId], references: [groups.id] }),
  member: one(members, { fields: [contributionDues.memberId], references: [members.id] }),
  fine: one(fines, { fields: [contributionDues.fineId], references: [fines.id] }),
}));
