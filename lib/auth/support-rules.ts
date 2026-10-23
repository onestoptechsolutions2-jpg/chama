import { canPlatform, type GroupPermission, type PlatformRole } from "@/lib/auth/permissions";
import type { SupportContext } from "@/lib/auth/session";

/**
 * Never done in support mode, whatever the mode or platform role: these
 * touch the group's own credentials or pay the platform with its money.
 * (Passwords and personal KYC are refused in their own actions.)
 */
export const SUPPORT_NEVER: ReadonlySet<GroupPermission> = new Set([
  "developer.manage",
  "billing.pay",
  "billing.invoice",
  "platformFees.pay",
  "money.payoutDestination",
]);

/** Money leaving the group (loans, payouts, welfare grants): platform owners only. */
export const SUPPORT_MONEY_OUT: ReadonlySet<GroupPermission> = new Set([
  "loans.manage",
  "mgr.manage",
  "welfare.manage",
  "money.withdraw",
  "money.approveWithdrawal",
]);

/** Why this support write is refused, or null. Pure — also used by tests. */
export function supportWriteError(
  support: Pick<SupportContext, "mode">,
  platformRole: PlatformRole | null,
  permission: GroupPermission,
): string | null {
  if (support.mode === "view") return "Support mode is view-only.";
  if (SUPPORT_NEVER.has(permission)) return "Support can't do this on a group's behalf.";
  if (SUPPORT_MONEY_OUT.has(permission) && !canPlatform(platformRole, "support.money")) {
    return "Only a platform owner can move money on a group's behalf.";
  }
  return null;
}

