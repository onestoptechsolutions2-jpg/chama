export type PlatformRole = "owner" | "support" | "agent";

const PLATFORM_ROLES = new Set<PlatformRole>(["owner", "support", "agent"]);

export function normalizePlatformRole(value: unknown): PlatformRole | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return PLATFORM_ROLES.has(normalized as PlatformRole) ? (normalized as PlatformRole) : null;
}

export function platformRoleLabel(role: PlatformRole | null): string {
  if (role === "owner") return "Owner";
  if (role === "support") return "Support";
  if (role === "agent") return "Agent";
  return "None";
}

export function platformRoleChangeSummary(
  fromRole: PlatformRole | null,
  toRole: PlatformRole | null,
): string {
  return `${platformRoleLabel(fromRole)} → ${platformRoleLabel(toRole)}`;
}

export function canGrantPlatformRole(
  callerRole: PlatformRole | null,
  targetRole: PlatformRole | null,
): boolean {
  if (!callerRole) return false;
  if (callerRole === "support") return false;
  if (callerRole === "owner") {
    return targetRole === null || targetRole === "owner" || targetRole === "support" || targetRole === "agent";
  }
  return false;
}
