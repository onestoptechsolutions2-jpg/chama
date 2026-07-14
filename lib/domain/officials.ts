// Local type, not imported from lib/auth/session.ts — that file imports
// "server-only", and lib/domain/* stays dependency-free (no DB, no
// Next.js) so every function here is testable without touching Postgres,
// matching lib/domain/mgr.ts's convention.
export type MembershipRole = "admin" | "treasurer" | "secretary" | "member";

const REQUIRED_OFFICES: MembershipRole[] = ["admin", "treasurer", "secretary"];

/**
 * A group is "registered" once it has at least one active Chairperson
 * (admin), Treasurer, and Secretary — the concept this was audited against
 * requires these three offices filled before a group can be active, not
 * added later. Recomputed after every role change (see
 * updateMemberRoleAction) rather than set once, so it can't go stale if an
 * office holder is later demoted or removed.
 */
export function computeRegistrationComplete(activeRoles: MembershipRole[]): boolean {
  return REQUIRED_OFFICES.every((office) => activeRoles.includes(office));
}

export type KycField =
  | "name"
  | "idNumber"
  | "idDocumentUrl"
  | "phone"
  | "photoUrl"
  | "address"
  | "signatureUrl";

const MEMBER_CORE_FIELDS: KycField[] = ["name", "idNumber", "idDocumentUrl", "phone", "photoUrl"];
const OFFICIAL_EXTRA_FIELDS: KycField[] = ["address", "signatureUrl"];

/**
 * Every member needs the core identity fields; office holders (admin,
 * treasurer, secretary) additionally need an address and signature on
 * file. The same list drives both the /profile form (which fields to show)
 * and kycCompletedAt's completeness check, so they can't drift apart.
 */
export function requiredKycFields(role: MembershipRole): KycField[] {
  return role === "member" ? MEMBER_CORE_FIELDS : [...MEMBER_CORE_FIELDS, ...OFFICIAL_EXTRA_FIELDS];
}

export function isKycComplete(
  role: MembershipRole,
  member: Partial<Record<KycField, string | null | undefined>>,
): boolean {
  return requiredKycFields(role).every((field) => !!member[field]);
}
