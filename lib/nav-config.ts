import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ScrollText,
  Users,
  UserCheck,
  Gavel,
  CalendarDays,
  Settings,
  Landmark,
  Wallet,
  WalletCards,
  PieChart,
  Receipt,
  FileText,
  HeartHandshake,
  Hammer,
  RefreshCw,
  HelpCircle,
  UserCircle,
  Lightbulb,
  Webhook,
  ShieldCheck,
  History,
  Banknote,
  Smartphone,
} from "lucide-react";
import { can, type GroupPermission, type MembershipLike } from "@/lib/auth/permissions";

export type NavSection = "main" | "money" | "group" | "account";

/** Menu groups, in the order they appear. */
export const navSections: { id: NavSection; label: string }[] = [
  { id: "main", label: "Main" },
  { id: "money", label: "Money" },
  { id: "group", label: "Group" },
  { id: "account", label: "Account" },
];

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * The permission needed to see this item (lib/auth/permissions.ts) — the
   * same one the page itself enforces with requirePermission(), so the menu
   * and the page can't disagree. It covers both role and product switch.
   * Omit for items every member of every group sees.
   */
  permission?: GroupPermission;
  /**
   * Short (1-2 sentence) explanation of what this page is for and how to
   * use it — the single source both the sidebar's tooltip-free nav and
   * /guide (components/feature/role-guide.tsx) draw from, so the in-app
   * guide can never drift out of sync with what's actually in the menu the
   * way a separate help doc would.
   */
  guide: string;
  /** Which menu group the item sits under (see navSections). */
  section: NavSection;
};

/**
 * Single source of truth for the authenticated nav — consumed by both the
 * server-rendered sidebar ((dashboard)/layout.tsx) and each page's own
 * requirePermission() check, so role/product gating can't drift
 * between "what's in the menu" and "what the page actually allows" the way
 * it did in the old App.jsx/Layout.jsx split.
 *
 * Extended phase-by-phase as each feature is built — see the plan's phased
 * build order. Only list items for pages that actually exist yet.
 */
export const navItems: NavItem[] = [
  {
    href: "/dashboard",
    section: "main",
    label: "Home",
    icon: LayoutDashboard,
    guide: "An overview of the group: member count, balances, pending fines, and the next meeting.",
  },
  {
    href: "/dashboard/insights",
    section: "group",
    label: "Advice & Reports",
    icon: Lightbulb,
    guide:
      "What's next in the MGR rotation and who's due to receive it, whether the rotation is keeping pace, and plain-language recommendations drawn from the group's own records — capital allocation, welfare fund health, and which members could use a check-in. Admins/treasurers/secretaries also get graphical group-performance reports here (contributions, balances, loan and fine exposure) with CSV export.",
  },
  {
    href: "/dashboard/collect",
    permission: "money.record",
    section: "money",
    label: "Record Money",
    icon: Banknote,
    guide:
      "Meeting day on one screen: type what each member paid (shares, savings, welfare, loan repayment), then save once. If one line is wrong nothing is saved, so you can fix it. Every member with a phone gets an SMS receipt.",
  },
  {
    href: "/dashboard/payments",
    permission: "money.record",
    section: "money",
    label: "Payments",
    icon: Smartphone,
    guide:
      "Money paid to your group's own paybill/till, bank or payroll. Members use their member number as the account (\"12\", \"12 welfare\", \"12 loan\"); matched payments are recorded and receipted automatically. Anything we can't match waits here for you. Bank statements and payroll check-off files are imported here too.",
  },
  {
    href: "/dashboard/members",
    permission: "members.view",
    section: "main",
    label: "Members",
    icon: Users,
    guide:
      "The member roster and each member's financial profile — capital, security, savings, fines. Admins and treasurers add members and record contributions here. Add Member can also send an invite: the person joins with their own account (admins can invite officials this way).",
  },
  {
    href: "/dashboard/pending-members",
    permission: "members.approve",
    section: "main",
    label: "New Requests",
    icon: UserCheck,
    guide:
      "Join requests from people who found this group via public discovery (/discover). Approving one activates their membership and automatically creates their member financial-profile row — rejecting just declines the request, nothing is created.",
  },
  {
    href: "/dashboard/fines",
    permission: "fines.issue",
    section: "money",
    label: "Fines",
    icon: Gavel,
    guide:
      "Every fine issued to a member — lateness, absence, rule violations, loan defaults — and whether it's been paid. Meetings auto-generate attendance fines; this is where you record manual ones and mark any of them paid.",
  },
  {
    href: "/dashboard/meetings",
    permission: "meetings.manage",
    section: "group",
    label: "Meetings",
    icon: CalendarDays,
    guide:
      "Schedule meetings and record attendance. Marking someone absent or late automatically creates the corresponding fine — you don't need to also go add it in Fines.",
  },
  {
    href: "/dashboard/loans",
    permission: "loans.manage",
    section: "money",
    label: "Loans",
    icon: Landmark,
    guide:
      "Approve or reject member-submitted loan applications, disburse and track active loans, and record repayments. A member's loan limit is a multiple of their total savings (configurable in Settings), enforced automatically — you can't approve past it.",
  },
  {
    href: "/dashboard/loans/apply",
    permission: "loans.use",
    section: "money",
    label: "My Loan",
    icon: Wallet,
    guide:
      "Apply for a loan up to your current limit (shown on this page), track your active loan's balance and due date, or cancel a pending application before staff review it.",
  },
  {
    href: "/dashboard/mgr",
    permission: "mgr.use",
    section: "money",
    label: "Mzunguko",
    icon: RefreshCw,
    guide:
      "The rotating-payout schedule. You'll be asked to sign a one-time agreement before you can claim a slot in the active cycle. Members claim open slots themselves (or staff can auto-assign/reassign); staff mark a slot paid once the actual payout has happened outside the app — that action is permanently logged against their account and can't be edited or deleted later, specifically so payouts stay accountable.",
  },
  {
    href: "/dashboard/welfare",
    permission: "welfare.use",
    section: "money",
    label: "Welfare",
    icon: HeartHandshake,
    guide:
      "Submit and review welfare claims (medical, bereavement, emergency, etc.) against the group's welfare fund, and see the fund's running balance.",
  },
  {
    href: "/dashboard/projects",
    permission: "projects.view",
    section: "money",
    label: "Projects",
    icon: Hammer,
    guide:
      "Table-banking style projects the group is funding together — track each project's target vs. collected amount and who's contributed.",
  },
  {
    href: "/dashboard/capital",
    section: "money",
    label: "Group Money",
    icon: PieChart,
    guide:
      "How the group's pooled capital is currently allocated — how much of the capital pool is out on loan versus held in reserve, plus the security, personal savings, welfare, and projects funds tracked alongside it. Visible to every member, not just staff — the point is to make it possible to see the group's money is being used sensibly without asking. Admins can set a target loan-deployment percentage in Settings to get drift alerts here.",
  },
  {
    href: "/dashboard/statement",
    section: "main",
    label: "My Money",
    icon: FileText,
    guide:
      "One merged timeline of your own contributions, fines, and loan activity — the closest thing to a bank statement for your standing in this group.",
  },
  {
    href: "/dashboard/rules",
    section: "group",
    label: "Rules",
    icon: ScrollText,
    guide: "The group's bylaws, each optionally tied to a penalty amount if referenced when issuing a fine.",
  },
  {
    href: "/dashboard/wallet",
    permission: "billing.view",
    section: "money",
    label: "Prepaid Wallet",
    icon: WalletCards,
    guide:
      "A prepaid balance for the platform's own fees only — never member savings, contributions, or loan funds, which are still tracked separately and reconciled via M-Pesa directly. Top it up once and platform fees (like the MGR payout fee) get deducted instantly with no phone prompt each time, instead of triggering a fresh M-Pesa push per event.",
  },
  {
    href: "/dashboard/billing",
    permission: "billing.view",
    section: "money",
    label: "Platform Bill",
    icon: Receipt,
    guide:
      "What this group owes the platform — computed live from your member count, which vehicles (Table Banking, Welfare, Investment) are active, and your real financial activity over the last 12 months, not a flat fee. Admins can generate this period's invoice and charge it, either instantly from the prepaid Wallet or via an M-Pesa STK push.",
  },
  {
    href: "/dashboard/developer",
    permission: "developer.manage",
    section: "account",
    label: "Developer",
    icon: Webhook,
    guide:
      "API keys and webhook endpoints for integrating other systems with this group's data — an accounting sync, a custom dashboard, an SMS gateway. See docs/api.md for the full contract. Not needed unless you're setting up an integration.",
  },
  {
    href: "/dashboard/governance",
    permission: "governance.manage",
    section: "group",
    label: "Group Papers",
    icon: ShieldCheck,
    guide:
      "Group documents (constitution, bank details, registration certificate) and compliance obligations like AGM dates and annual returns — with reminders as they come due. Basic administrative housekeeping, not tied to any financial product.",
  },
  {
    href: "/dashboard/activity",
    permission: "audit.view",
    section: "group",
    label: "Activity",
    icon: History,
    guide:
      "Every recorded change — money in, fines, repayments — with who did it and how (in the app, by M-Pesa, through the API, or by platform support on your behalf). It can't be edited or deleted.",
  },
  {
    href: "/dashboard/settings",
    permission: "settings.view",
    section: "account",
    label: "Settings",
    icon: Settings,
    guide:
      "The group's configurable business rules — share price, contribution day, loan interest/limit multiplier, fine amounts, meeting defaults. Changing these here is what actually takes effect; nothing else overrides them.",
  },
  {
    href: "/dashboard/profile",
    section: "account",
    label: "My Profile",
    icon: UserCircle,
    guide:
      "Your own KYC details — ID number, ID document, photo, and (for admins/treasurers/secretaries) address and signature. Filled in once here, it's reused automatically for every other group you belong to, not re-collected each time.",
  },
  {
    href: "/dashboard/guide",
    section: "account",
    label: "Help",
    icon: HelpCircle,
    guide: "This page — a role-aware explanation of what everything in the sidebar does.",
  },
];

/**
 * Pure filter, shared by every place that needs "which nav items can this
 * membership see" — keeps the rule in exactly one place. `activeMembership`
 * is deliberately just the plain {role, products} shape (not the full
 * Session type) so this has no dependency on server-only code and is safe
 * to call from a Client Component.
 */
export function getVisibleNavItems(activeMembership: MembershipLike | null): NavItem[] {
  return navItems.filter((item) => {
    if (!item.permission) return true;
    return can(activeMembership, item.permission);
  });
}
