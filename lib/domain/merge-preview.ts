/**
 * Read-only helpers for the "Merge two accounts" box on Super admin > Users.
 * They never change anything: the merge itself is mergeUsersAction, which
 * re-checks everything server-side. The preview applies the same checks in
 * the same order (two different accounts, no platform role on the one being
 * folded in, then planMerge), so what the owner sees before confirming is
 * what the action will do or refuse.
 */
import { normalizeEmail, normalizePhone, planMerge, type MergeMembership } from "./identity";

export type MergeCandidate = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  platformRole: string | null;
  active: boolean;
  memberships: MergeMembership[];
};

/** Find accounts by #id, name, email or phone (any Kenyan format). Best matches first. */
export function searchAccounts(list: MergeCandidate[], query: string, limit = 8): MergeCandidate[] {
  const q = query.trim();
  if (!q) return [];
  const idMatch = /^#?(\d+)$/.exec(q);
  const lower = q.toLowerCase();
  const phone = normalizePhone(q);
  const email = normalizeEmail(q);
  const digits = q.replace(/\D/g, "");

  const scored = list
    .map((u) => {
      let score = 0;
      if (idMatch && u.id === Number(idMatch[1])) score = 100;
      else if (phone && normalizePhone(u.phone) === phone) score = 90;
      else if (email && normalizeEmail(u.email) === email) score = 90;
      else if (u.name.toLowerCase().includes(lower)) score = 50;
      else if (u.email?.toLowerCase().includes(lower)) score = 40;
      else if (digits.length >= 4 && (u.phone ?? "").replace(/\D/g, "").includes(digits)) score = 30;
      return { u, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.u.id - b.u.id);
  return scored.slice(0, limit).map((x) => x.u);
}

export type PreviewRow = {
  groupId: number;
  groupName: string;
  keep: Pick<MergeMembership, "role" | "status" | "hasMemberRow"> | null;
  foldIn: Pick<MergeMembership, "role" | "status" | "hasMemberRow"> | null;
  /** The kept account's membership in this group after the merge. */
  after: Pick<MergeMembership, "role" | "status"> | null;
};

export type MergePreview = {
  /** Null when the action would go ahead; otherwise the action's own refusal message. */
  refusal: string | null;
  rows: PreviewRow[];
  warnings: string[];
};

const strip = (m: MergeMembership) => ({ role: m.role, status: m.status, hasMemberRow: m.hasMemberRow });

export function previewMerge(keep: MergeCandidate, foldIn: MergeCandidate): MergePreview {
  const keepBy = new Map(keep.memberships.map((m) => [m.groupId, m]));
  const foldBy = new Map(foldIn.memberships.map((m) => [m.groupId, m]));
  const groupIds = [...new Set([...keepBy.keys(), ...foldBy.keys()])];

  const warnings: string[] = [];
  if (!foldIn.active) warnings.push(`#${foldIn.id} is already deactivated (it may have been merged before).`);
  if (!keep.active) warnings.push(`#${keep.id}, the account being kept, is deactivated.`);

  let refusal: string | null = null;
  if (keep.id === foldIn.id) refusal = "Choose two different accounts";
  else if (foldIn.platformRole) refusal = "Remove the duplicate's platform role before merging";

  const plan = refusal ? null : planMerge(keep.memberships, foldIn.memberships);
  if (plan && !plan.ok) refusal = plan.error;

  const rows: PreviewRow[] = groupIds.map((groupId) => {
    const k = keepBy.get(groupId) ?? null;
    const f = foldBy.get(groupId) ?? null;
    let after: PreviewRow["after"] = null;
    if (k && !f) after = { role: k.role, status: k.status };
    else if (!k && f) after = { role: f.role, status: f.status };
    else if (k && f) {
      const collapse = plan && plan.ok ? plan.collapse.find((c) => c.groupId === groupId) : undefined;
      after = collapse?.takeFromDuplicate ?? { role: k.role, status: k.status };
    }
    return { groupId, groupName: (k ?? f)!.groupName, keep: k ? strip(k) : null, foldIn: f ? strip(f) : null, after: refusal ? null : after };
  });
  rows.sort((a, b) => a.groupName.localeCompare(b.groupName));
  return { refusal, rows, warnings };
}
