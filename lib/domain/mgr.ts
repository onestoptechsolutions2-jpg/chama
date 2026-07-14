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

function nextCycleDate(date: Date, frequency: MgrFrequency): Date {
  const d = new Date(date);
  if (frequency === "weekly") d.setDate(d.getDate() + 7);
  else if (frequency === "biweekly") d.setDate(d.getDate() + 14);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
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
  let date = new Date(startDate);
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
      scheduledDate: toDateStr(date),
      slotCount: recipientsPerCycle,
      payoutPerSlot,
      totalContributions: contribPerCycle,
      slots,
    });
    date = nextCycleDate(date, frequency);
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
export function buildAutoAssignQueue(turns: MemberTurnStatus[]): number[] {
  const maxRounds = Math.max(0, ...turns.map((t) => t.turnsTotal));
  const queue: number[] = [];
  for (let round = 1; round <= maxRounds; round++) {
    for (const t of turns) {
      if (t.taken < round && t.turnsTotal >= round) queue.push(t.memberId);
    }
  }
  return queue;
}
