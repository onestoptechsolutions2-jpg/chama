import { describe, it, expect } from "vitest";
import {
  generateMgrSchedule,
  buildAutoAssignQueue,
  shuffled,
  cycleCloseBlocker,
  summarizeRotation,
  assignByPreferences,
} from "../lib/domain/mgr";

describe("generateMgrSchedule", () => {
  const members = [
    { memberId: 1, turnsTotal: 1, multiplier: 1 },
    { memberId: 2, turnsTotal: 1, multiplier: 1 },
    { memberId: 3, turnsTotal: 1, multiplier: 1 },
    { memberId: 4, turnsTotal: 1, multiplier: 1 },
  ];

  it("returns an empty schedule for no members", () => {
    const result = generateMgrSchedule({
      frequency: "monthly",
      recipientsPerCycle: 1,
      baseContribution: 1000,
      startDate: new Date("2026-01-01"),
      members: [],
    });
    expect(result).toEqual({
      totalSlots: 0,
      totalCycles: 0,
      contribPerCycle: 0,
      payoutPerSlot: 0,
      cycles: [],
    });
  });

  it("creates one slot per cycle when recipientsPerCycle is 1", () => {
    const result = generateMgrSchedule({
      frequency: "monthly",
      recipientsPerCycle: 1,
      baseContribution: 1000,
      startDate: new Date("2026-01-01"),
      members,
    });
    expect(result.totalSlots).toBe(4);
    expect(result.totalCycles).toBe(4);
    expect(result.cycles).toHaveLength(4);
    expect(result.cycles.every((c) => c.slots.length === 1)).toBe(true);
  });

  it("groups slots into cycles of recipientsPerCycle, with a partial last cycle", () => {
    const result = generateMgrSchedule({
      frequency: "monthly",
      recipientsPerCycle: 3,
      baseContribution: 1000,
      startDate: new Date("2026-01-01"),
      members, // 4 total slots
    });
    expect(result.totalCycles).toBe(2); // ceil(4/3)
    expect(result.cycles[0].slots).toHaveLength(3);
    expect(result.cycles[1].slots).toHaveLength(1); // partial last cycle
  });

  it("counts a multi-turn member's extra turns as extra slots", () => {
    const result = generateMgrSchedule({
      frequency: "monthly",
      recipientsPerCycle: 1,
      baseContribution: 1000,
      startDate: new Date("2026-01-01"),
      members: [
        { memberId: 1, turnsTotal: 2, multiplier: 2 },
        { memberId: 2, turnsTotal: 1, multiplier: 1 },
      ],
    });
    expect(result.totalSlots).toBe(3); // 2 + 1
    expect(result.totalCycles).toBe(3);
  });

  it("computes contribPerCycle from each member's own multiplier, and splits payout evenly", () => {
    const result = generateMgrSchedule({
      frequency: "monthly",
      recipientsPerCycle: 2,
      baseContribution: 1000,
      startDate: new Date("2026-01-01"),
      members: [
        { memberId: 1, turnsTotal: 1, multiplier: 2 }, // pays double
        { memberId: 2, turnsTotal: 1, multiplier: 1 },
      ],
    });
    // contribPerCycle = 2*1000 + 1*1000 = 3000; payoutPerSlot = 3000 / 2 = 1500
    expect(result.contribPerCycle).toBe(3000);
    expect(result.payoutPerSlot).toBe(1500);
    expect(result.cycles[0].totalContributions).toBe(3000);
    expect(result.cycles[0].payoutPerSlot).toBe(1500);
  });

  it("advances the schedule date by the configured frequency", () => {
    const weekly = generateMgrSchedule({
      frequency: "weekly",
      recipientsPerCycle: 1,
      baseContribution: 1000,
      startDate: new Date("2026-01-01"),
      members,
    });
    expect(weekly.cycles.map((c) => c.scheduledDate)).toEqual([
      "2026-01-01",
      "2026-01-08",
      "2026-01-15",
      "2026-01-22",
    ]);

    const biweekly = generateMgrSchedule({
      frequency: "biweekly",
      recipientsPerCycle: 1,
      baseContribution: 1000,
      startDate: new Date("2026-01-01"),
      members,
    });
    expect(biweekly.cycles.map((c) => c.scheduledDate)).toEqual([
      "2026-01-01",
      "2026-01-15",
      "2026-01-29",
      "2026-02-12",
    ]);

    const monthly = generateMgrSchedule({
      frequency: "monthly",
      recipientsPerCycle: 1,
      baseContribution: 1000,
      startDate: new Date("2026-01-15"),
      members,
    });
    expect(monthly.cycles.map((c) => c.scheduledDate)).toEqual([
      "2026-01-15",
      "2026-02-15",
      "2026-03-15",
      "2026-04-15",
    ]);
  });

  it("numbers slots sequentially within each cycle starting at 1", () => {
    const result = generateMgrSchedule({
      frequency: "monthly",
      recipientsPerCycle: 3,
      baseContribution: 1000,
      startDate: new Date("2026-01-01"),
      members,
    });
    expect(result.cycles[0].slots.map((s) => s.slotNumber)).toEqual([1, 2, 3]);
    expect(result.cycles[1].slots.map((s) => s.slotNumber)).toEqual([1]);
  });
});

describe("buildAutoAssignQueue", () => {
  it("gives every member their first turn before anyone gets a second", () => {
    const queue = buildAutoAssignQueue([
      { memberId: 1, turnsTotal: 2, taken: 0 },
      { memberId: 2, turnsTotal: 1, taken: 0 },
      { memberId: 3, turnsTotal: 1, taken: 0 },
    ]);
    expect(queue).toEqual([1, 2, 3, 1]);
  });

  it("skips members who have already used all their turns", () => {
    const queue = buildAutoAssignQueue([
      { memberId: 1, turnsTotal: 1, taken: 1 }, // fully used
      { memberId: 2, turnsTotal: 1, taken: 0 },
    ]);
    expect(queue).toEqual([2]);
  });

  it("returns an empty queue when there are no members", () => {
    expect(buildAutoAssignQueue([])).toEqual([]);
  });

  it("accounts for partially-taken turns mid-round", () => {
    const queue = buildAutoAssignQueue([
      { memberId: 1, turnsTotal: 3, taken: 1 },
      { memberId: 2, turnsTotal: 3, taken: 0 },
    ]);
    // member 1 already has round 1; queue should give member 1 rounds 2-3, member 2 rounds 1-3
    expect(queue).toEqual([2, 1, 2, 1, 2]);
  });
});

describe("cycle dates", () => {
  const people = [1, 2, 3, 4].map((memberId) => ({ memberId, turnsTotal: 1, multiplier: 1 }));
  const dates = (frequency: "weekly" | "biweekly" | "monthly", start: string) =>
    generateMgrSchedule({
      frequency,
      recipientsPerCycle: 1,
      baseContribution: 1000,
      startDate: new Date(start),
      members: people,
    }).cycles.map((c) => c.scheduledDate);

  it("keeps month-end starts on the last day of each month instead of drifting", () => {
    expect(dates("monthly", "2026-01-31")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("steps weekly and biweekly rotations by exact days", () => {
    expect(dates("weekly", "2026-01-01")).toEqual(["2026-01-01", "2026-01-08", "2026-01-15", "2026-01-22"]);
    expect(dates("biweekly", "2026-01-01")[3]).toBe("2026-02-12");
  });
});

describe("random draw", () => {
  const turns = [
    { memberId: 1, turnsTotal: 2, taken: 0 },
    { memberId: 2, turnsTotal: 2, taken: 0 },
    { memberId: 3, turnsTotal: 1, taken: 0 },
  ];

  it("keeps everyone to their first turn before any second turn", () => {
    const queue = buildAutoAssignQueue(turns, { shuffle: true, rng: () => 0.1 });
    expect([...queue.slice(0, 3)].sort()).toEqual([1, 2, 3]);
    expect([...queue.slice(3)].sort()).toEqual([1, 2]);
  });

  it("shuffles without losing or duplicating anyone", () => {
    const out = shuffled([1, 2, 3, 4, 5], () => 0.5);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("cycleCloseBlocker", () => {
  it("allows closing when every slot is paid or skipped", () => {
    expect(cycleCloseBlocker(["paid", "skipped", "paid"])).toBeNull();
  });
  it("blocks while any slot is open or still owed", () => {
    expect(cycleCloseBlocker(["paid", "claimed"])).toMatch(/1 slot is not paid/);
    expect(cycleCloseBlocker(["open", "auto_assigned"])).toMatch(/2 slots are not paid/);
  });
});

describe("summarizeRotation", () => {
  it("reports the active cycle and how many slots are settled", () => {
    const summary = summarizeRotation([
      { cycleNumber: 1, status: "completed", slots: [{ status: "paid" }, { status: "paid" }] },
      { cycleNumber: 2, status: "active", slots: [{ status: "paid" }, { status: "claimed" }] },
      { cycleNumber: 3, status: "planned", slots: [{ status: "open" }, { status: "skipped" }] },
    ]);
    expect(summary).toEqual({
      currentCycle: 2,
      totalCycles: 3,
      paidSlots: 3,
      totalSlots: 6,
      percent: 67,
    });
  });
  it("handles an empty schedule", () => {
    expect(summarizeRotation([])).toMatchObject({ currentCycle: null, totalSlots: 0, percent: 0 });
  });
});

describe("assignByPreferences", () => {
  const slots = [
    { id: 10, cycleNumber: 1, slotNumber: 1 },
    { id: 11, cycleNumber: 2, slotNumber: 1 },
    { id: 12, cycleNumber: 3, slotNumber: 1 },
  ];
  const turns = [1, 2, 3].map((memberId) => ({ memberId, turnsTotal: 1, taken: 0 }));

  it("gives members the cycle they asked for", () => {
    const result = assignByPreferences({
      openSlots: slots,
      turns,
      preferences: new Map([[1, [3]], [2, [1]]]),
      rng: () => 0.5,
    });
    const slotOf = (m: number) => result.find((r) => r.memberId === m)!.slotId;
    expect(slotOf(1)).toBe(12);
    expect(slotOf(2)).toBe(10);
    expect(result.find((r) => r.memberId === 3)).toMatchObject({ slotId: 11, reason: "draw" });
  });

  it("settles a clash on one cycle with the loser falling back to their next choice", () => {
    const result = assignByPreferences({
      openSlots: slots,
      turns,
      preferences: new Map([[1, [1, 2]], [2, [1, 3]]]),
      rng: () => 0.5,
    });
    const cycleOf = (m: number) => {
      const slotId = result.find((r) => r.memberId === m)!.slotId;
      return slots.find((s) => s.id === slotId)!.cycleNumber;
    };
    expect(new Set([cycleOf(1), cycleOf(2)]).size).toBe(2);
    expect(result).toHaveLength(3);
  });

  it("never gives a member more turns than they have left", () => {
    const result = assignByPreferences({
      openSlots: slots,
      turns: [
        { memberId: 1, turnsTotal: 1, taken: 1 },
        { memberId: 2, turnsTotal: 2, taken: 0 },
      ],
      preferences: new Map([[1, [1, 2, 3]]]),
      rng: () => 0.5,
    });
    expect(result.filter((r) => r.memberId === 1)).toHaveLength(0);
    expect(result.filter((r) => r.memberId === 2)).toHaveLength(2);
  });
});
