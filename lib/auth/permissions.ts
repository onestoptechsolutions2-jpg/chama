/**
 * Identity & access management — the one place that says who may do what.
 *
 * Two independent axes:
 * - **Group roles** (`group_memberships.role`): admin, treasurer, secretary,
 *   member. Scoped to one group; a person can hold a different role in each.
 * - **Platform roles** (`users.platform_role`): owner, support, agent. Not
 *   scoped to any group; they unlock the super-admin console and support
 *   "act as" (see lib/auth/support.ts).
 *
 * Every page, Server Action, API route and the nav menu asks `can()` /
 * `requirePermission()` for a named permission instead of listing roles, so
 * changing who may do something is a one-line change here.
 *
 * Pure module (no server-only imports) so Client Components (the nav) can
 * use it too.
 */
import type { ProductFlags } from "@/lib/domain/products";

export type GroupRole = "admin" | "treasurer" | "secretary" | "member";
export type PlatformRole = "owner" | "support" | "agent";

const ALL: GroupRole[] = ["admin", "treasurer", "secretary", "member"];
const OFFICIALS: GroupRole[] = ["admin", "treasurer", "secretary"];
const MONEY: GroupRole[] = ["admin", "treasurer"];
const ADMIN: GroupRole[] = ["admin"];

type GroupPermissionDef = {
  roles: GroupRole[];
  /** The product that must be switched on for the group (Settings → Products). */
  product?: keyof ProductFlags;
  /** Plain-language description, shown on the Roles & access page. */
  label: string;
};

export const GROUP_PERMISSIONS = {
  "group.view": { roles: ALL, label: "See the group's home, rules, reports for members" },

  "members.view": { roles: OFFICIALS, label: "See the member list and balances" },
  "members.add": { roles: MONEY, label: "Add, import and invite members" },
  "members.approve": { roles: MONEY, label: "Approve or reject join requests" },
  "members.manage": { roles: ADMIN, label: "Change roles, remove or bring back members, reset passwords" },

  "money.record": { roles: MONEY, label: "Record contributions and match M-Pesa/bank payments" },
  "fines.issue": { roles: OFFICIALS, label: "Issue fines" },
  "fines.settle": { roles: MONEY, label: "Mark fines paid or waived" },
  "meetings.manage": { roles: OFFICIALS, label: "Schedule meetings and take attendance" },

  "loans.use": { roles: ALL, product: "loans", label: "Apply for a loan, guarantee others" },
  "loans.manage": { roles: MONEY, product: "loans", label: "Approve, disburse and record loan repayments" },
  "mgr.use": { roles: ALL, product: "mgr", label: "Choose and claim merry-go-round turns" },
  "mgr.manage": { roles: MONEY, product: "mgr", label: "Run the merry-go-round schedule and payouts" },
  "welfare.use": { roles: ALL, product: "welfare", label: "Ask for welfare help, co-sign approvals" },
  "welfare.manage": { roles: MONEY, product: "welfare", label: "Review claims and manage the welfare fund" },
  "projects.view": { roles: ALL, product: "projects", label: "See group projects" },
  "projects.manage": { roles: MONEY, product: "projects", label: "Create projects and record project money" },

  "shareout.view": { roles: ALL, label: "See the year-end share-out" },
  "governance.manage": { roles: ["admin", "secretary"], label: "Upload group papers and track deadlines" },
  "rules.manage": { roles: ADMIN, label: "Add or retire group rules" },
  "reports.view": { roles: OFFICIALS, label: "See staff reports and export CSV" },
  "audit.view": { roles: OFFICIALS, label: "See the group's activity log (who did what)" },
  "settings.view": { roles: OFFICIALS, label: "See group settings" },
  "settings.manage": { roles: ADMIN, label: "Change group settings and products" },

  "billing.view": { roles: MONEY, label: "See the platform subscription" },
  "billing.pay": { roles: MONEY, label: "Pay the platform subscription" },
  "billing.invoice": { roles: ADMIN, label: "Generate a subscription invoice" },
  "platformFees.pay": { roles: ADMIN, label: "Pay platform fees by M-Pesa" },
  "developer.manage": { roles: ADMIN, label: "Create API keys and webhooks" },
} as const satisfies Record<string, GroupPermissionDef>;

export type GroupPermission = keyof typeof GROUP_PERMISSIONS;

export const PLATFORM_PERMISSIONS = {
  "platform.console": { roles: ["owner", "support"], label: "Open the super-admin console" },
  "platform.groups.manage": { roles: ["owner", "support"], label: "Edit and (de)activate groups" },
  "platform.users.manage": { roles: ["owner", "support"], label: "Reset passwords, merge duplicate users" },
  "platform.roles.grant": { roles: ["owner"], label: "Grant or remove platform roles" },
  "platform.users.merge": { roles: ["owner"], label: "Merge two accounts that belong to one person" },
  "support.view": { roles: ["owner", "support"], label: "Open a group as a user, read-only" },
  "support.act": { roles: ["owner", "support"], label: "Make changes in a group on a user's behalf" },
  "support.money": { roles: ["owner"], label: "Move money (payouts, disbursements) on a user's behalf" },
  "agent.run": { roles: ["agent", "owner"], label: "Run commands through the internal agent endpoint" },
} as const satisfies Record<string, { roles: PlatformRole[]; label: string }>;

export type PlatformPermission = keyof typeof PLATFORM_PERMISSIONS;

/** The minimal shape `can()` needs — satisfied by ActiveMembership and by command Actors. */
export type MembershipLike = { role: GroupRole; products: ProductFlags };

/** Can this membership do `permission` in its group? Checks role and product switch. */
export function can(membership: MembershipLike | null | undefined, permission: GroupPermission): boolean {
  if (!membership) return false;
  const def: GroupPermissionDef = GROUP_PERMISSIONS[permission];
  if (!def.roles.includes(membership.role)) return false;
  if (def.product && !membership.products[def.product]) return false;
  return true;
}

export function canPlatform(role: PlatformRole | null | undefined, permission: PlatformPermission): boolean {
  if (!role) return false;
  return (PLATFORM_PERMISSIONS[permission].roles as readonly PlatformRole[]).includes(role);
}

/** Every group permission a role holds — for the Roles & access page. */
export function permissionsForRole(role: GroupRole): GroupPermission[] {
  return (Object.keys(GROUP_PERMISSIONS) as GroupPermission[]).filter((p) =>
    (GROUP_PERMISSIONS[p].roles as readonly GroupRole[]).includes(role),
  );
}

/**
 * Maker–checker: nobody approves or pays out money to themselves. Returns an
 * error message, or null when the actor and the beneficiary differ.
 */
export function selfDealingError(
  actorMemberId: number | null,
  beneficiaryMemberId: number | null,
  what: string,
): string | null {
  if (actorMemberId !== null && actorMemberId === beneficiaryMemberId) {
    return `You cannot ${what} for yourself — another official must do it.`;
  }
  return null;
}
