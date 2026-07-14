import { describe, it, expect } from "vitest";
import { generateMgrSchedule, buildAutoAssignQueue } from "../lib/domain/mgr";

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
