/**
 * One person = one phone number. Phones are stored in a single canonical
 * form — Kenyan E.164 without the plus, e.g. "254712345678" — so
 * "0712 345 678", "+254712345678", "254712345678" and "712345678" are all
 * recognised as the same person. Emails are trimmed and lowercased.
 *
 * Used by every path that creates or finds a person: register, login,
 * Google, invites, add member, CSV import, join approval, profile.
 */

const KENYA = "254";

/** Canonical phone ("2547XXXXXXXX" / "2541XXXXXXXX"), or null if it isn't a valid Kenyan mobile. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (!/^\d+$/.test(digits)) return null;

  if (digits.startsWith(KENYA)) digits = digits.slice(KENYA.length);
  else if (digits.startsWith("0")) digits = digits.slice(1);

  // Kenyan mobiles: 7XXXXXXXX or 1XXXXXXXX (9 digits after the country code).
  if (!/^[71]\d{8}$/.test(digits)) return null;
  return KENYA + digits;
}

/** "254712345678" → "0712 345 678", for showing to people. Passes anything else through. */
export function displayPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const m = /^254(\d{3})(\d{3})(\d{3})$/.exec(phone);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : phone;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  const email = raw?.trim().toLowerCase();
  return email ? email : null;
}

/** Is a login identifier an email (vs a phone)? */
export function isEmailIdentifier(identifier: string): boolean {
  return identifier.includes("@");
}

export type PersonMatch = { id: number; phone: string | null; email: string | null };

/**
 * Given the users that match a phone and/or email, decide who this person
 * is. Returns the single matching user, "none", or "conflict" when the phone
 * belongs to one account and the email to another (support must merge).
 */
export function resolvePerson(
  matches: PersonMatch[],
): { kind: "none" } | { kind: "one"; userId: number } | { kind: "conflict"; userIds: number[] } {
  const ids = [...new Set(matches.map((m) => m.id))];
  if (ids.length === 0) return { kind: "none" };
  if (ids.length === 1) return { kind: "one", userId: ids[0] };
  return { kind: "conflict", userIds: ids };
}

export type RosterRow = { id: number; userId: number | null; phone: string | null; email: string | null; active: boolean };

/**
 * Which existing roster row in a group (if any) is this person? Prefers a
 * row already linked to the user, then an unlinked row with the same phone,
 * then the same email. Never picks a row linked to someone else.
 */
export function findRosterRowFor(
  rows: RosterRow[],
  person: { userId: number | null; phone: string | null; email: string | null },
): RosterRow | null {
  if (person.userId !== null) {
    const linked = rows.find((r) => r.userId === person.userId);
    if (linked) return linked;
  }
  const unlinked = rows.filter((r) => r.userId === null);
  if (person.phone) {
    const byPhone = unlinked.find((r) => normalizePhone(r.phone) === person.phone);
    if (byPhone) return byPhone;
  }
  if (person.email) {
    const byEmail = unlinked.find((r) => normalizeEmail(r.email) === person.email);
    if (byEmail) return byEmail;
  }
  return null;
}

export type MergeMembership = {
  groupId: number;
  groupName: string;
  status: "pending" | "active" | "rejected" | "suspended";
  role: "admin" | "treasurer" | "secretary" | "member";
  hasMemberRow: boolean;
};

export type MergePlan =
  | { ok: false; error: string }
  | {
      ok: true;
      /** Groups where the duplicate's membership (and member row) move to the kept user. */
      moveGroupIds: number[];
      /** Groups where both are members: drop the duplicate's membership; maybe take its status/role. */
      collapse: { groupId: number; takeFromDuplicate: { status: MergeMembership["status"]; role: MergeMembership["role"] } | null; moveMemberRow: boolean }[];
    };

const STATUS_RANK = { active: 3, pending: 2, suspended: 1, rejected: 0 } as const;
const ROLE_RANK = { admin: 3, treasurer: 2, secretary: 1, member: 0 } as const;

/**
 * How to fold a duplicate account into the kept one. Refuses when both
 * accounts have their own money record (members row) in the same group —
 * two financial histories need a person to reconcile, not a script.
 */
export function planMerge(keep: MergeMembership[], duplicate: MergeMembership[]): MergePlan {
  const keepByGroup = new Map(keep.map((m) => [m.groupId, m]));
  const moveGroupIds: number[] = [];
  const collapse: Extract<MergePlan, { ok: true }>["collapse"] = [];

  for (const dup of duplicate) {
    const kept = keepByGroup.get(dup.groupId);
    if (!kept) {
      moveGroupIds.push(dup.groupId);
      continue;
    }
    if (kept.hasMemberRow && dup.hasMemberRow) {
      return {
        ok: false,
        error: `Both accounts have savings records in ${dup.groupName}. Ask that group's treasurer to combine them first.`,
      };
    }
    const dupStronger =
      STATUS_RANK[dup.status] > STATUS_RANK[kept.status] ||
      (dup.status === kept.status && ROLE_RANK[dup.role] > ROLE_RANK[kept.role]);
    collapse.push({
      groupId: dup.groupId,
      takeFromDuplicate: dupStronger ? { status: dup.status, role: dup.role } : null,
      moveMemberRow: dup.hasMemberRow && !kept.hasMemberRow,
    });
  }
  return { ok: true, moveGroupIds, collapse };
}
