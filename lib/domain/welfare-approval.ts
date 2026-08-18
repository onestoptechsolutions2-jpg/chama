export type MembershipRole = "admin" | "treasurer" | "secretary" | "member";
export type ApprovalTier = "tier1" | "tier2" | "tier3";
export type ApprovalStatus = "pending" | "accepted" | "declined";

/**
 * tier1 = single staff decision (up to policy.tier1MaxAmount); tier2 = two
 * co-signing officials; tier3 = all three officials — the app's
 * approximation of the spec's "full group approval" for the largest
 * requests, since there's no separate welfare-committee role and a literal
 * per-member vote is out of scope (see docs/architecture.md Phase 8 notes).
 */
export function resolveApprovalTier(
  totalRequested: number,
  policy: { tier1MaxAmount: number; tier2MaxAmount: number },
): ApprovalTier {
  if (totalRequested <= policy.tier1MaxAmount) return "tier1";
  if (totalRequested <= policy.tier2MaxAmount) return "tier2";
  return "tier3";
}

// tier2 asks the two officials most directly accountable for group money
// (chairperson + treasurer); tier3 adds the secretary for the largest
// disbursements. An arbitrary-but-documented choice — the spec doesn't
// prescribe which two of the three tier2 should be.
const TIER2_ROLES: MembershipRole[] = ["admin", "treasurer"];
const TIER3_ROLES: MembershipRole[] = ["admin", "treasurer", "secretary"];

/**
 * If the claimant themselves holds one of the required offices, that slot
 * is skipped — never backfilled, since there's no 4th official to ask —
 * rather than silently requiring self-approval. tier3 effectively becomes
 * "all *other* officials" in that case.
 */
export function requiredApproverRoles(
  tier: ApprovalTier,
  claimantRole: MembershipRole | null,
): MembershipRole[] {
  if (tier === "tier1") return [];
  const roles = tier === "tier2" ? TIER2_ROLES : TIER3_ROLES;
  return roles.filter((r) => r !== claimantRole);
}

/**
 * Any single decline hard-rejects a tier2/tier3 request (checked via
 * hasAnyDecline before this) — there are only ever 3 possible officials, so
 * unlike loan guarantors there's no wider pool to fall back on. Quorum is
 * met only once every resolved approval slot has been accepted.
 */
export function isApprovalQuorumMet(
  tier: ApprovalTier,
  approvals: { status: ApprovalStatus }[],
): boolean {
  if (tier === "tier1") return true;
  if (approvals.length === 0) return false;
  return approvals.every((a) => a.status === "accepted");
}

export function hasAnyDecline(approvals: { status: ApprovalStatus }[]): boolean {
  return approvals.some((a) => a.status === "declined");
}

/** Self-approval guard — an approver can never approve their own request. */
export function canApprove(approverMemberId: number, claimantMemberId: number): boolean {
  return approverMemberId !== claimantMemberId;
}
