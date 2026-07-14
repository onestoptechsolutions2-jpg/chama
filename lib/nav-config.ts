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
  FileText,
  HeartHandshake,
  Hammer,
  RefreshCw,
} from "lucide-react";
import type { GroupType, MembershipRole } from "@/lib/auth/session";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Roles that can see this item. Omit to allow every role. */
  roles?: MembershipRole[];
  /** Group types that unlock this item. Omit to show for every group type. */
  groupTypes?: GroupType[];
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
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  {
    href: "/members",
    label: "Members",
    icon: Users,
    roles: ["admin", "treasurer", "secretary"],
  },
  {
    href: "/pending-members",
    label: "Pending members",
    icon: UserCheck,
    roles: ["admin", "treasurer"],
  },
  {
    href: "/fines",
    label: "Fines",
    icon: Gavel,
    roles: ["admin", "treasurer", "secretary"],
  },
  {
    href: "/meetings",
    label: "Meetings",
    icon: CalendarDays,
    roles: ["admin", "treasurer", "secretary"],
  },
  {
    href: "/loans",
    label: "Loans",
    icon: Landmark,
    roles: ["admin", "treasurer"],
    groupTypes: ["chama", "hybrid", "selfhelp"],
  },
  {
    href: "/loans/apply",
    label: "My Loan",
    icon: Wallet,
    roles: ["member"],
    groupTypes: ["chama", "hybrid", "selfhelp"],
  },
  {
    href: "/mgr",
    label: "Merry-Go-Round",
    icon: RefreshCw,
    groupTypes: ["chama", "hybrid"],
  },
  {
    href: "/welfare",
    label: "Welfare",
    icon: HeartHandshake,
    groupTypes: ["welfare", "hybrid"],
  },
  {
    href: "/projects",
    label: "Projects",
    icon: Hammer,
    groupTypes: ["selfhelp", "hybrid"],
  },
  { href: "/statement", label: "Statement", icon: FileText },
  { href: "/rules", label: "Rules", icon: ScrollText },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    roles: ["admin", "treasurer", "secretary"],
  },
];

/**
 * Pure filter, shared by every place that needs "which nav items can this
 * membership see" — keeps the rule in exactly one place. `activeMembership`
 * is deliberately just the plain {role, groupType} shape (not the full
 * Session type) so this has no dependency on server-only code and is safe
 * to call from a Client Component.
 */
export function getVisibleNavItems(
  activeMembership: { role: MembershipRole; groupType: GroupType } | null,
): NavItem[] {
  return navItems.filter((item) => {
    if (item.roles) {
      if (!activeMembership || !item.roles.includes(activeMembership.role)) {
        return false;
      }
    }
    if (item.groupTypes) {
      if (!activeMembership || !item.groupTypes.includes(activeMembership.groupType)) {
        return false;
      }
    }
    return true;
  });
}
