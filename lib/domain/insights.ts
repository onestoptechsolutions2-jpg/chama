/**
 * "Insights" — turns the group's existing ledger + MGR schedule into a set
 * of plain-language recommendations, the same "derive a view, don't just
 * record history" idea lib/domain/capital.ts's allocation drift already
 * uses. Pure and DB-free by the same convention every lib/domain/* module
 * follows (see lib/domain/officials.ts's identical reasoning) — callers in
 * app/(dashboard)/insights/page.tsx do the fetching, these functions just
 * turn already-fetched rows into judgments.
 */
import type { AllocationDrift } from "./capital";

// ── MGR: what's next, and is the rotation keeping pace ─────────────────────

export type MgrFrequency = "weekly" | "biweekly" | "monthly";

export type MgrCycleLite = {
  cycleNumber: number;
  status: "planned" | "active" | "completed" | "closed";
  scheduledDate: string | null;
};

export type MgrSlotLite = {
  cycleNumber: number;
  memberId: number | null;
  memberName: string | null;
};

export type NextMgrEvent = {
  cycleNumber: number;
  scheduledDate: string;
  recipientName: string | null;
  status: "active" | "planned";
  /** Negative if the date has already passed (overdue). */
  daysUntil: number;
};

/**
 * The active cycle (already collecting) takes priority over the next
 * planned one, matching the MGR page's own `activeCycle` query — if none is
 * active, the nearest planned cycle by date is "what's next" instead.
 */
export function computeNextMgrEvent(
  cycles: MgrCycleLite[],
  slots: MgrSlotLite[],
  today: Date,
): NextMgrEvent | null {
  const bySchedule = (a: MgrCycleLite, b: MgrCycleLite) =>
    (a.scheduledDate ?? "").localeCompare(b.scheduledDate ?? "");

  const active = cycles.filter((c) => c.status === "active").sort(bySchedule)[0];
  const candidate =
    active ?? cycles.filter((c) => c.status === "planned").sort(bySchedule)[0];
  if (!candidate || !candidate.scheduledDate) return null;

  const recipient = slots.find((s) => s.cycleNumber === candidate.cycleNumber) ?? null;
  const daysUntil = Math.round(
    (new Date(`${candidate.scheduledDate}T00:00:00Z`).getTime() - today.getTime()) /
      (1000 * 60 * 60 * 24),
  );

  return {
    cycleNumber: candidate.cycleNumber,
    scheduledDate: candidate.scheduledDate,
    recipientName: recipient?.memberName ?? null,
    status: candidate.status as "active" | "planned",
    daysUntil,
  };
}

const EXPECTED_INTERVAL_DAYS: Record<MgrFrequency, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

export type MgrPace = {
  averageIntervalDays: number;
  expectedIntervalDays: number;
  /** averageIntervalDays - expectedIntervalDays. Positive means cycles are running slower than configured. */
  deltaDays: number;
  onPace: boolean;
};

/** How far the observed cadence can drift from the configured frequency before it's flagged, in days. */
const PACE_TOLERANCE_DAYS = 4;

/**
 * Looks only at completed cycles (real history), not planned ones — a
 * planned schedule is definitionally on-pace with itself, so it can't tell
 * you anything about whether the group is actually keeping up. Needs at
 * least 2 completed cycles to have an interval to measure.
 */
export function computeMgrPace(
  completedCycles: MgrCycleLite[],
  frequency: MgrFrequency,
): MgrPace | null {
  const dated = completedCycles
    .filter((c) => c.scheduledDate)
    .sort((a, b) => (a.scheduledDate! < b.scheduledDate! ? -1 : 1));
  if (dated.length < 2) return null;

  const gaps: number[] = [];
  for (let i = 1; i < dated.length; i++) {
    const prev = new Date(`${dated[i - 1].scheduledDate}T00:00:00Z`).getTime();
    const curr = new Date(`${dated[i].scheduledDate}T00:00:00Z`).getTime();
    gaps.push((curr - prev) / (1000 * 60 * 60 * 24));
  }

  const averageIntervalDays = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
  const expectedIntervalDays = EXPECTED_INTERVAL_DAYS[frequency];
  const deltaDays = averageIntervalDays - expectedIntervalDays;

  return {
    averageIntervalDays,
    expectedIntervalDays,
    deltaDays,
    onPace: Math.abs(deltaDays) <= PACE_TOLERANCE_DAYS,
  };
}

// ── Member risk — who needs a nudge ─────────────────────────────────────────

export type MemberRiskInput = {
  memberId: number;
  name: string;
  pendingFinesTotal: number;
  pendingFinesCount: number;
  overdueDuesTotal: number;
  overdueDuesCount: number;
  overdueLoanCount: number;
  recentAbsences: number;
  /** How many of the group's last N meetings this input's `recentAbsences` was measured over. */
  recentMeetingsConsidered: number;
};

export type MemberRiskFlag = {
  memberId: number;
  name: string;
  reasons: string[];
  severity: "warning" | "critical";
};

/**
 * A flat, explainable rule set rather than a weighted score — each reason is
 * independently true or not, so the UI can show exactly why someone's
 * flagged instead of an opaque number. "Critical" is reserved for overdue
 * loans (the group's own money genuinely at risk); everything else is a
 * softer "worth a conversation" warning.
 */
export function computeMemberRiskFlags(inputs: MemberRiskInput[]): MemberRiskFlag[] {
  const flags: MemberRiskFlag[] = [];

  for (const m of inputs) {
    const reasons: string[] = [];
    let severity: "warning" | "critical" = "warning";

    if (m.overdueLoanCount > 0) {
      reasons.push(
        `${m.overdueLoanCount} overdue loan${m.overdueLoanCount > 1 ? "s" : ""}`,
      );
      severity = "critical";
    }
    if (m.overdueDuesCount > 0) {
      reasons.push(
        `${m.overdueDuesCount} overdue contribution${m.overdueDuesCount > 1 ? "s" : ""} (Ksh ${Math.round(m.overdueDuesTotal).toLocaleString()})`,
      );
    }
    if (m.pendingFinesCount > 0) {
      reasons.push(
        `${m.pendingFinesCount} unpaid fine${m.pendingFinesCount > 1 ? "s" : ""} (Ksh ${Math.round(m.pendingFinesTotal).toLocaleString()})`,
      );
    }
    if (m.recentMeetingsConsidered > 0 && m.recentAbsences / m.recentMeetingsConsidered >= 0.5) {
      reasons.push(`absent ${m.recentAbsences} of the last ${m.recentMeetingsConsidered} meetings`);
    }

    if (reasons.length > 0) {
      flags.push({ memberId: m.memberId, name: m.name, reasons, severity });
    }
  }

  return flags.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
}

// ── Welfare sustainability ──────────────────────────────────────────────────

export type WelfareOutlook = {
  available: number;
  pendingClaimsTotal: number;
  /** available - pendingClaimsTotal; can go negative, meaning pending requests alone would exhaust the fund. */
  projectedAfterPending: number;
  strained: boolean;
};

export function computeWelfareOutlook(
  available: number,
  pendingClaimsTotal: number,
): WelfareOutlook {
  const projectedAfterPending = available - pendingClaimsTotal;
  return {
    available,
    pendingClaimsTotal,
    projectedAfterPending,
    strained: projectedAfterPending < 0,
  };
}

// ── Recommendations — the plain-language "so what" ──────────────────────────

export type Recommendation = {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
};

export type RecommendationInput = {
  registrationComplete: boolean;
  missingOffices: string[];
  nextMgrEvent: NextMgrEvent | null;
  mgrPace: MgrPace | null;
  capitalDrift: AllocationDrift | null;
  overextended: boolean;
  memberRiskFlags: MemberRiskFlag[];
  welfareOutlook: WelfareOutlook | null;
};

export function generateRecommendations(input: RecommendationInput): Recommendation[] {
  const recs: Recommendation[] = [];

  if (!input.registrationComplete && input.missingOffices.length > 0) {
    recs.push({
      id: "registration-incomplete",
      severity: "warning",
      title: "Group registration is incomplete",
      detail: `Assign ${input.missingOffices.join(" and ")} to unlock public discovery and member approvals.`,
    });
  }

  if (input.nextMgrEvent && input.nextMgrEvent.daysUntil < 0) {
    recs.push({
      id: "mgr-overdue",
      severity: "critical",
      title: "The current MGR payout is overdue",
      detail: `Cycle ${input.nextMgrEvent.cycleNumber}${input.nextMgrEvent.recipientName ? ` (${input.nextMgrEvent.recipientName})` : ""} was scheduled for ${input.nextMgrEvent.scheduledDate}, ${Math.abs(input.nextMgrEvent.daysUntil)} day(s) ago.`,
    });
  } else if (input.nextMgrEvent && input.nextMgrEvent.daysUntil <= 3) {
    recs.push({
      id: "mgr-upcoming",
      severity: "info",
      title: "MGR payout coming up",
      detail: `${input.nextMgrEvent.recipientName ?? "The next recipient"} is due on ${input.nextMgrEvent.scheduledDate} (cycle ${input.nextMgrEvent.cycleNumber}).`,
    });
  }

  if (input.mgrPace && !input.mgrPace.onPace) {
    const slower = input.mgrPace.deltaDays > 0;
    recs.push({
      id: "mgr-pace",
      severity: "warning",
      title: `Rotation is running ${slower ? "slower" : "faster"} than scheduled`,
      detail: `Cycles are averaging ${input.mgrPace.averageIntervalDays.toFixed(0)} days apart against a ${input.mgrPace.expectedIntervalDays}-day target — worth checking in with members about collection timing.`,
    });
  }

  if (input.overextended) {
    recs.push({
      id: "capital-overextended",
      severity: "critical",
      title: "Loans out exceed the capital pool",
      detail: "Outstanding loan principal is larger than total member capital — reconcile before approving new loans.",
    });
  } else if (input.capitalDrift && input.capitalDrift.severity !== "on_target") {
    const over = input.capitalDrift.severity === "over_deployed";
    recs.push({
      id: "capital-drift",
      severity: "warning",
      title: over ? "Capital is over-deployed" : "Capital is under-deployed",
      detail: over
        ? `${input.capitalDrift.actualPct.toFixed(0)}% is out on loan against a ${input.capitalDrift.targetPct.toFixed(0)}% target — reserve is thinner than planned.`
        : `Only ${input.capitalDrift.actualPct.toFixed(0)}% is out on loan against a ${input.capitalDrift.targetPct.toFixed(0)}% target — capital is sitting idle.`,
    });
  }

  const critical = input.memberRiskFlags.filter((f) => f.severity === "critical");
  if (critical.length > 0) {
    recs.push({
      id: "members-critical",
      severity: "critical",
      title: `${critical.length} member${critical.length > 1 ? "s" : ""} with overdue loans`,
      detail: critical.map((f) => f.name).join(", "),
    });
  }
  const warning = input.memberRiskFlags.filter((f) => f.severity === "warning");
  if (warning.length > 0) {
    recs.push({
      id: "members-warning",
      severity: "warning",
      title: `${warning.length} member${warning.length > 1 ? "s" : ""} worth checking in on`,
      detail: warning.map((f) => f.name).join(", "),
    });
  }

  if (input.welfareOutlook?.strained) {
    recs.push({
      id: "welfare-strained",
      severity: "warning",
      title: "Welfare fund may not cover pending claims",
      detail: `Ksh ${Math.round(input.welfareOutlook.pendingClaimsTotal).toLocaleString()} in pending claims against Ksh ${Math.round(input.welfareOutlook.available).toLocaleString()} available.`,
    });
  }

  if (recs.length === 0) {
    recs.push({
      id: "all-clear",
      severity: "info",
      title: "Nothing needs attention right now",
      detail: "Registration, the MGR schedule, capital allocation, and member standing all look healthy.",
    });
  }

  const order: Record<Recommendation["severity"], number> = { critical: 0, warning: 1, info: 2 };
  return recs.sort((a, b) => order[a.severity] - order[b.severity]);
}
