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
  FileText,
  HeartHandshake,
  Hammer,
  RefreshCw,
  HelpCircle,
  UserCircle,
} from "lucide-react";
import type { MembershipRole } from "@/lib/auth/session";
import type { ProductFlags } from "@/lib/domain/products";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Roles that can see this item. Omit to allow every role. */
  roles?: MembershipRole[];
  /**
   * Which product this item belongs to — gated on the group's
   * Settings > Products toggle (lib/domain/products.ts), independent of
   * `groupType` now. Omit for items every group always has (dashboard,
   * members, statement, rules, wallet, etc).
   */
  product?: keyof ProductFlags;
  /**
   * Short (1-2 sentence) explanation of what this page is for and how to
   * use it — the single source both the sidebar's tooltip-free nav and
   * /guide (components/feature/role-guide.tsx) draw from, so the in-app
   * guide can never drift out of sync with what's actually in the menu the
   * way a separate help doc would.
   */
  guide: string;
};

/**
 * Single source of truth for the authenticated nav — consumed by both the
 * server-rendered sidebar ((dashboard)/layout.tsx) and each page's own
 * requireRole()/group-type check, so role/group-type gating can't drift
 * between "what's in the menu" and "what the page actually allows" the way
 * it did in the old App.jsx/Layout.jsx split.
 *
 * Extended phase-by-phase as each feature is built — see the plan's phased
 * build order. Only list items for pages that actually exist yet.
 */
export const navItems: NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
    guide: "An overview of the group: member count, balances, pending fines, and the next meeting.",
  },
  {
    href: "/members",
    label: "Members",
    icon: Users,
    roles: ["admin", "treasurer", "secretary"],
    guide:
      "The member roster and each member's financial profile — capital, security, savings, fines. Admins and treasurers can add members and record contributions directly here; admins can also create a login for a member who doesn't have one yet.",
  },
  {
    href: "/pending-members",
    label: "Pending members",
    icon: UserCheck,
    roles: ["admin", "treasurer"],
    guide:
      "Join requests from people who found this group via public discovery (/discover). Approving one activates their membership and automatically creates their member financial-profile row — rejecting just declines the request, nothing is created.",
  },
  {
    href: "/fines",
    label: "Fines",
    icon: Gavel,
    roles: ["admin", "treasurer", "secretary"],
    guide:
      "Every fine issued to a member — lateness, absence, rule violations, loan defaults — and whether it's been paid. Meetings auto-generate attendance fines; this is where you record manual ones and mark any of them paid.",
  },
  {
    href: "/meetings",
    label: "Meetings",
    icon: CalendarDays,
    roles: ["admin", "treasurer", "secretary"],
    guide:
      "Schedule meetings and record attendance. Marking someone absent or late automatically creates the corresponding fine — you don't need to also go add it in Fines.",
  },
  {
    href: "/loans",
    label: "Loans",
    icon: Landmark,
    roles: ["admin", "treasurer"],
    product: "loans",
    guide:
      "Approve or reject member-submitted loan applications, disburse and track active loans, and record repayments. A member's loan limit is a multiple of their total savings (configurable in Settings), enforced automatically — you can't approve past it.",
  },
  {
    href: "/loans/apply",
    label: "My Loan",
    icon: Wallet,
    roles: ["member"],
    product: "loans",
    guide:
      "Apply for a loan up to your current limit (shown on this page), track your active loan's balance and due date, or cancel a pending application before staff review it.",
  },
  {
    href: "/mgr",
    label: "Merry-Go-Round",
    icon: RefreshCw,
    product: "mgr",
    guide:
      "The rotating-payout schedule. You'll be asked to sign a one-time agreement before you can claim a slot in the active cycle. Members claim open slots themselves (or staff can auto-assign/reassign); staff mark a slot paid once the actual payout has happened outside the app — that action is permanently logged against their account and can't be edited or deleted later, specifically so payouts stay accountable.",
  },
  {
    href: "/welfare",
    label: "Welfare",
    icon: HeartHandshake,
    product: "welfare",
    guide:
      "Submit and review welfare claims (medical, bereavement, emergency, etc.) against the group's welfare fund, and see the fund's running balance.",
  },
  {
    href: "/projects",
    label: "Projects",
    icon: Hammer,
    product: "projects",
    guide:
      "Table-banking style projects the group is funding together — track each project's target vs. collected amount and who's contributed.",
  },
  {
    href: "/statement",
    label: "Statement",
    icon: FileText,
    guide:
      "One merged timeline of your own contributions, fines, and loan activity — the closest thing to a bank statement for your standing in this group.",
  },
  {
    href: "/rules",
    label: "Rules",
    icon: ScrollText,
    guide: "The group's bylaws, each optionally tied to a penalty amount if referenced when issuing a fine.",
  },
  {
    href: "/wallet",
    label: "Wallet",
    icon: WalletCards,
    roles: ["admin", "treasurer"],
    guide:
      "A prepaid balance for the platform's own fees only — never member savings, contributions, or loan funds, which are still tracked separately and reconciled via M-Pesa directly. Top it up once and platform fees (like the MGR payout fee) get deducted instantly with no phone prompt each time, instead of triggering a fresh M-Pesa push per event.",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    roles: ["admin", "treasurer", "secretary"],
    guide:
      "The group's configurable business rules — share price, contribution day, loan interest/limit multiplier, fine amounts, meeting defaults. Changing these here is what actually takes effect; nothing else overrides them.",
  },
  {
    href: "/profile",
    label: "My Profile",
    icon: UserCircle,
    guide:
      "Your own KYC details — ID number, ID document, photo, and (for admins/treasurers/secretaries) address and signature. Filled in once here, it's reused automatically for every other group you belong to, not re-collected each time.",
  },
  {
    href: "/guide",
    label: "Guide",
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
export function getVisibleNavItems(
  activeMembership: { role: MembershipRole; products: ProductFlags } | null,
): NavItem[] {
  return navItems.filter((item) => {
    if (item.roles) {
      if (!activeMembership || !item.roles.includes(activeMembership.role)) {
        return false;
      }
    }
    if (item.product) {
      if (!activeMembership || !activeMembership.products[item.product]) {
        return false;
      }
    }
    return true;
  });
}
