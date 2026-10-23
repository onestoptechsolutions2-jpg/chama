/**
 * A benefit table: what the group pays for each event — the way funeral
 * and employee-welfare schemes actually work ("member dies: 50,000; spouse:
 * 30,000…"). When a group has one, a member asks for a listed benefit and
 * the amount is fixed by the table, not typed in — no haggling, no
 * favouritism. Other requests still go through the normal capped flow.
 */
export type ClaimReason =
  | "medical"
  | "bereavement"
  | "emergency"
  | "education"
  | "maternity"
  | "disability"
  | "benevolence"
  | "wedding"
  | "calamity"
  | "other";

export type BenefitItem = { id: string; label: string; reason: ClaimReason; amount: number };

export const DEFAULT_FUNERAL_BENEFITS: BenefitItem[] = [
  { id: "member-death", label: "Death of the member", reason: "bereavement", amount: 50000 },
  { id: "spouse-death", label: "Death of a spouse", reason: "bereavement", amount: 30000 },
  { id: "child-death", label: "Death of a child", reason: "bereavement", amount: 20000 },
  { id: "parent-death", label: "Death of a parent", reason: "bereavement", amount: 20000 },
  { id: "hospital", label: "Hospital admission (3+ nights)", reason: "medical", amount: 10000 },
];

/** Reads a stored schedule defensively (jsonb from the database). */
export function readBenefitSchedule(value: unknown): BenefitItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is BenefitItem =>
      !!v &&
      typeof v === "object" &&
      typeof (v as BenefitItem).id === "string" &&
      typeof (v as BenefitItem).label === "string" &&
      typeof (v as BenefitItem).reason === "string" &&
      typeof (v as BenefitItem).amount === "number" &&
      (v as BenefitItem).amount > 0,
  );
}

/** The fixed amount and reason for a chosen benefit, or an error. */
export function resolveBenefit(
  schedule: BenefitItem[],
  benefitId: string,
  emergencyCap: number,
): { reason: ClaimReason; amount: number; label: string } | { error: string } {
  const item = schedule.find((b) => b.id === benefitId);
  if (!item) return { error: "That benefit isn't in the group's table" };
  if (item.amount > emergencyCap) {
    return { error: `The table pays Ksh ${item.amount.toLocaleString()} but the policy caps grants at Ksh ${emergencyCap.toLocaleString()} — ask an admin to fix one of them` };
  }
  return { reason: item.reason, amount: item.amount, label: item.label };
}

/** Turns an editor's rows into a clean schedule with stable ids. */
export function buildSchedule(rows: { label: string; reason: string; amount: number }[], reasons: readonly string[]): BenefitItem[] {
  const used = new Set<string>();
  return rows
    .filter((r) => r.label.trim() && r.amount > 0 && reasons.includes(r.reason))
    .map((r) => {
      const base = r.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "benefit";
      let id = base;
      for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
      used.add(id);
      return { id, label: r.label.trim(), reason: r.reason as ClaimReason, amount: Math.round(r.amount) };
    });
}
