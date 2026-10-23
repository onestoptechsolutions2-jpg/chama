export type MgrFrequency = "weekly" | "biweekly" | "monthly";

export type MemberTurnInput = {
  memberId: number;
  turnsTotal: number;
  multiplier: number;
};

export type GeneratedSlot = {
  cycleNumber: number;
  slotNumber: number;
};

export type GeneratedCycle = {
  cycleNumber: number;
  scheduledDate: string;
  slotCount: number;
  payoutPerSlot: number;
  totalContributions: number;
  slots: GeneratedSlot[];
};

export type GenerateScheduleInput = {
  frequency: MgrFrequency;
  recipientsPerCycle: number;
  baseContribution: number;
  startDate: Date;
  members: MemberTurnInput[];
};

export type GenerateScheduleResult = {
  totalSlots: number;
  totalCycles: number;
  contribPerCycle: number;
  payoutPerSlot: number;
  cycles: GeneratedCycle[];
};

/**
 * Date of the `index`-th cycle (0 = the start date itself). Always counted
 * from the start date, never from the previous cycle, so nothing drifts:
 * a monthly rotation started on 31 Jan lands on 28/29 Feb, then 31 Mar
 * (not 3 Mar, 3 Apr... as repeatedly adding a month would give).
 */
function cycleDate(start: Date, frequency: MgrFrequency, index: number): string {
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth();
  const d = start.getUTCDate();
  if (frequency === "monthly") {
    const target = m + index;
    const lastDay = new Date(Date.UTC(y, target + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, target, Math.min(d, lastDay))).toISOString().split("T")[0];
  }
  const step = frequency === "weekly" ? 7 : 14;
  return new Date(Date.UTC(y, m, d + step * index)).toISOString().split("T")[0];
}

/**
 * Bug 1 (docs/architecture.md): the original mgr.js queried
 * `members.status`/`members.member_id`, neither of which exists, so this
 * entire feature threw on every call. The math itself was never the
 * problem — it's isolated here as a pure function precisely so the "fetch
 * members correctly" concern (handled by the type-checked Drizzle schema at
 * the call site) and the "compute a schedule from turns/contributions"
 * concern are separate, and this half is unit-tested without a DB.
 *
 * Preserves the original semantics: total payout slots = sum of every
 * member's turnsTotal (default 1); slots are grouped into cycles of
 * `recipientsPerCycle`; each member's contribution is multiplied by their
 * own `multiplier` (a multi-turn member pays proportionally more); payout
 * per slot is the pooled per-cycle contribution split evenly across the
 * cycle's slots.
 */
export function generateMgrSchedule(input: GenerateScheduleInput): GenerateScheduleResult {
  const { frequency, recipientsPerCycle, baseContribution, startDate, members } = input;

  if (members.length === 0 || recipientsPerCycle < 1) {
    return { totalSlots: 0, totalCycles: 0, contribPerCycle: 0, payoutPerSlot: 0, cycles: [] };
  }

  const totalSlots = members.reduce((sum, m) => sum + m.turnsTotal, 0);
  const totalCycles = Math.ceil(totalSlots / recipientsPerCycle);
  const contribPerCycle = members.reduce((sum, m) => sum + m.multiplier * baseContribution, 0);
  const payoutPerSlot = contribPerCycle / recipientsPerCycle;

  const cycles: GeneratedCycle[] = [];
  let globalSlot = 1;

  for (let cycleNumber = 1; cycleNumber <= totalCycles; cycleNumber++) {
    const slots: GeneratedSlot[] = [];
    for (let slotNumber = 1; slotNumber <= recipientsPerCycle; slotNumber++) {
      if (globalSlot > totalSlots) break;
      slots.push({ cycleNumber, slotNumber });
      globalSlot++;
    }
    cycles.push({
      cycleNumber,
      scheduledDate: cycleDate(startDate, frequency, cycleNumber - 1),
      slotCount: recipientsPerCycle,
      payoutPerSlot,
      totalContributions: contribPerCycle,
      slots,
    });
  }

  return { totalSlots, totalCycles, contribPerCycle, payoutPerSlot, cycles };
}

export type MemberTurnStatus = {
  memberId: number;
  turnsTotal: number;
  /** How many slots this member has already claimed/been assigned/been paid across the whole schedule. */
  taken: number;
};

/**
 * Round-robin queue for auto-assigning open slots: members get their first
 * turn before anyone gets a second, their second before anyone gets a
 * third, etc. — preserved from the original auto-assign algorithm. Returns
 * an ordered list of memberIds; callers pop from the front for each open
 * slot in (cycleNumber, slotNumber) order.
 */
export function buildAutoAssignQueue(
  turns: MemberTurnStatus[],
  options: { shuffle?: boolean; rng?: () => number } = {},
): number[] {
  const maxRounds = Math.max(0, ...turns.map((t) => t.turnsTotal));
  const queue: number[] = [];
  for (let round = 1; round <= maxRounds; round++) {
    const inRound = turns
      .filter((t) => t.taken < round && t.turnsTotal >= round)
      .map((t) => t.memberId);
    // A random draw reorders people WITHIN a round only, so everyone still
    // gets their first turn before anyone gets a second.
    queue.push(...(options.shuffle ? shuffled(inRound, options.rng) : inRound));
  }
  return queue;
}

/** Fisher–Yates; `rng` is injectable so tests are deterministic. */
export function shuffled<T>(items: T[], rng: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Why a cycle can't be closed yet, or null if it can. Every slot must be
 * settled — paid out, or deliberately skipped — so closing never silently
 * drops a payout someone is still owed.
 */
export function cycleCloseBlocker(slotStatuses: string[]): string | null {
  const unsettled = slotStatuses.filter((s) => s !== "paid" && s !== "skipped").length;
  if (unsettled === 0) return null;
  return `${unsettled} slot${unsettled === 1 ? " is" : "s are"} not paid yet. Mark each one paid or skipped first.`;
}

export type RotationSummary = {
  /** The active cycle's number, or null when none is active (not started, or all done). */
  currentCycle: number | null;
  totalCycles: number;
  paidSlots: number;
  totalSlots: number;
  percent: number;
};

/** One-glance progress for the whole rotation: "Cycle 3 of 12 · 7 of 10 slots paid". */
export function summarizeRotation(
  cycles: { cycleNumber: number; status: string; slots: { status: string }[] }[],
): RotationSummary {
  const slots = cycles.flatMap((c) => c.slots);
  const settled = slots.filter((s) => s.status === "paid" || s.status === "skipped").length;
  const paid = slots.filter((s) => s.status === "paid").length;
  const active = cycles.find((c) => c.status === "active");
  return {
    currentCycle: active?.cycleNumber ?? null,
    totalCycles: cycles.length,
    paidSlots: paid,
    totalSlots: slots.length,
    percent: slots.length === 0 ? 0 : Math.round((settled / slots.length) * 100),
  };
}

export type OpenSlot = { id: number; cycleNumber: number; slotNumber: number };

export type PreferenceAssignment = {
  slotId: number;
  memberId: number;
  /** "preference": got a cycle they asked for. "draw": filled from the fair random queue. */
  reason: "preference" | "draw";
  /** 1-based choice number when reason is "preference". */
  choice?: number;
};

/**
 * Fair fill that honours what members asked for. Everyone's first choice is
 * settled before any second choice (members in random order, so nobody is
 * favoured by name or join date); a member never receives more turns than
 * they have left. Whatever is still open is then filled by the usual
 * round-robin random draw.
 */
export function assignByPreferences(input: {
  openSlots: OpenSlot[];
  turns: MemberTurnStatus[];
  preferences: Map<number, number[]>;
  rng?: () => number;
}): PreferenceAssignment[] {
  const { turns, preferences, rng } = input;
  const remaining = new Map(turns.map((t) => [t.memberId, Math.max(0, t.turnsTotal - t.taken)]));
  const assigned = new Map<number, number>();

  const free = [...input.openSlots].sort(
    (a, b) => a.cycleNumber - b.cycleNumber || a.slotNumber - b.slotNumber,
);
  const byCycle = new Map<number, OpenSlot[]>();
  for (const slot of free) {
    byCycle.set(slot.cycleNumber, [...(byCycle.get(slot.cycleNumber) ?? []), slot]);
  }

  const out: PreferenceAssignment[] = [];
  const used = new Set<number>();
  const maxChoices = Math.max(0, ...[...preferences.values()].map((p) => p.length));

  for (let choice = 0; choice < maxChoices; choice++) {
    const askers = [...preferences.entries()]
      .filter(([memberId, p]) => p[choice] !== undefined && remaining.has(memberId))
      .map(([memberId]) => memberId);
    for (const memberId of shuffled(askers, rng)) {
      if ((remaining.get(memberId) ?? 0) <= 0) continue;
      const slot = byCycle.get(preferences.get(memberId)![choice])?.shift();
      if (!slot) continue;
      out.push({ slotId: slot.id, memberId, reason: "preference", choice: choice + 1 });
      used.add(slot.id);
      remaining.set(memberId, (remaining.get(memberId) ?? 0) - 1);
      assigned.set(memberId, (assigned.get(memberId) ?? 0) + 1);
    }
  }

  const queue = buildAutoAssignQueue(
    turns.map((t) => ({ ...t, taken: t.taken + (assigned.get(t.memberId) ?? 0) })),
    { shuffle: true, rng },
  );
  for (const slot of free) {
    if (used.has(slot.id)) continue;
    const memberId = queue.shift();
    if (memberId === undefined) break;
    out.push({ slotId: slot.id, memberId, reason: "draw" });
  }
  return out;
}

/**
 * Can members still change their turn choices? `closeDate` is the last open
 * day (inclusive); `today` is a YYYY-MM-DD string in the group's own time
 * zone. No close date means always open.
 */
export function choicesAreOpen(closeDate: string | null, today: string): boolean {
  return !closeDate || today <= closeDate;
}

// Re-exported so existing imports keep working; the helpers live in ./dates.
export { nairobiToday } from "./dates";
