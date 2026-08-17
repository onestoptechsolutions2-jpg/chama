import { describe, it, expect } from "vitest";
import {
  computeNextMgrEvent,
  computeMgrPace,
  computeMemberRiskFlags,
  computeWelfareOutlook,
  generateRecommendations,
} from "../lib/domain/insights";

describe("computeNextMgrEvent", () => {
  const slots = [
    { cycleNumber: 1, memberId: 1, memberName: "Vivian" },
    { cycleNumber: 2, memberId: 2, memberName: "Treazer" },
  ];

  it("prefers the active cycle over a planned one", () => {
    const cycles = [
      { cycleNumber: 1, status: "completed" as const, scheduledDate: "2026-08-01" },
      { cycleNumber: 2, status: "active" as const, scheduledDate: "2026-08-30" },
    ];
    const event = computeNextMgrEvent(cycles, slots, new Date("2026-08-20T00:00:00Z"));
    expect(event?.cycleNumber).toBe(2);
    expect(event?.recipientName).toBe("Treazer");
    expect(event?.daysUntil).toBe(10);
  });

  it("falls back to the nearest planned cycle when none is active", () => {
    const cycles = [
      { cycleNumber: 1, status: "completed" as const, scheduledDate: "2026-08-01" },
      { cycleNumber: 2, status: "planned" as const, scheduledDate: "2026-09-15" },
    ];
    const event = computeNextMgrEvent(cycles, [], new Date("2026-08-20T00:00:00Z"));
    expect(event?.cycleNumber).toBe(2);
    expect(event?.recipientName).toBeNull();
  });

  it("reports negative daysUntil for an overdue cycle", () => {
    const cycles = [{ cycleNumber: 1, status: "active" as const, scheduledDate: "2026-08-10" }];
    const event = computeNextMgrEvent(cycles, [], new Date("2026-08-20T00:00:00Z"));
    expect(event?.daysUntil).toBe(-10);
  });

  it("returns null when there's nothing active or planned", () => {
    const cycles = [{ cycleNumber: 1, status: "completed" as const, scheduledDate: "2026-08-01" }];
    expect(computeNextMgrEvent(cycles, [], new Date())).toBeNull();
  });
});

describe("computeMgrPace", () => {
  it("returns null with fewer than 2 completed cycles", () => {
    expect(computeMgrPace([{ cycleNumber: 1, status: "completed", scheduledDate: "2026-01-01" }], "biweekly")).toBeNull();
    expect(computeMgrPace([], "biweekly")).toBeNull();
  });

  it("flags on-pace when the average interval is within tolerance of the configured frequency", () => {
    // GreatMinds' real round 1: 15th/30th of the month, ~15 days apart — within 4 days of biweekly's 14.
    const cycles = [
      { cycleNumber: 1, status: "completed" as const, scheduledDate: "2026-04-15" },
      { cycleNumber: 2, status: "completed" as const, scheduledDate: "2026-04-30" },
      { cycleNumber: 3, status: "completed" as const, scheduledDate: "2026-05-15" },
    ];
    const pace = computeMgrPace(cycles, "biweekly");
    expect(pace?.onPace).toBe(true);
    expect(pace?.averageIntervalDays).toBeCloseTo(15, 0);
  });

  it("flags off-pace when the average interval drifts beyond tolerance", () => {
    const cycles = [
      { cycleNumber: 1, status: "completed" as const, scheduledDate: "2026-01-01" },
      { cycleNumber: 2, status: "completed" as const, scheduledDate: "2026-02-15" }, // 45 days, not weekly
    ];
    const pace = computeMgrPace(cycles, "weekly");
    expect(pace?.onPace).toBe(false);
    expect(pace?.deltaDays).toBeGreaterThan(0);
  });
});

describe("computeMemberRiskFlags", () => {
  it("flags overdue loans as critical and nothing else as critical", () => {
    const flags = computeMemberRiskFlags([
      {
        memberId: 1,
        name: "Bill",
        pendingFinesTotal: 0,
        pendingFinesCount: 0,
        overdueDuesTotal: 0,
        overdueDuesCount: 0,
        overdueLoanCount: 1,
        recentAbsences: 0,
        recentMeetingsConsidered: 4,
      },
      {
        memberId: 2,
        name: "Mercy",
        pendingFinesTotal: 500,
        pendingFinesCount: 1,
        overdueDuesTotal: 0,
        overdueDuesCount: 0,
        overdueLoanCount: 0,
        recentAbsences: 0,
        recentMeetingsConsidered: 4,
      },
    ]);
    expect(flags).toHaveLength(2);
    expect(flags[0]).toMatchObject({ memberId: 1, severity: "critical" });
    expect(flags[1]).toMatchObject({ memberId: 2, severity: "warning" });
  });

  it("flags frequent absence (>=50% of recent meetings)", () => {
    const flags = computeMemberRiskFlags([
      {
        memberId: 1,
        name: "Skina",
        pendingFinesTotal: 0,
        pendingFinesCount: 0,
        overdueDuesTotal: 0,
        overdueDuesCount: 0,
        overdueLoanCount: 0,
        recentAbsences: 2,
        recentMeetingsConsidered: 4,
      },
    ]);
    expect(flags).toHaveLength(1);
    expect(flags[0].reasons[0]).toMatch(/absent 2 of the last 4/);
  });

  it("omits members with nothing to flag", () => {
    const flags = computeMemberRiskFlags([
      {
        memberId: 1,
        name: "Sylvia",
        pendingFinesTotal: 0,
        pendingFinesCount: 0,
        overdueDuesTotal: 0,
        overdueDuesCount: 0,
        overdueLoanCount: 0,
        recentAbsences: 0,
        recentMeetingsConsidered: 4,
      },
    ]);
    expect(flags).toHaveLength(0);
  });
});

describe("computeWelfareOutlook", () => {
  it("is strained when pending claims exceed available funds", () => {
    const outlook = computeWelfareOutlook(1000, 1500);
    expect(outlook.strained).toBe(true);
    expect(outlook.projectedAfterPending).toBe(-500);
  });

  it("is not strained when funds cover pending claims", () => {
    const outlook = computeWelfareOutlook(2000, 500);
    expect(outlook.strained).toBe(false);
  });
});

describe("generateRecommendations", () => {
  const healthy = {
    registrationComplete: true,
    missingOffices: [],
    nextMgrEvent: null,
    mgrPace: null,
    capitalDrift: null,
    overextended: false,
    memberRiskFlags: [],
    welfareOutlook: null,
  };

  it("returns an all-clear when nothing is wrong", () => {
    const recs = generateRecommendations(healthy);
    expect(recs).toHaveLength(1);
    expect(recs[0].id).toBe("all-clear");
  });

  it("surfaces registration incompleteness", () => {
    const recs = generateRecommendations({
      ...healthy,
      registrationComplete: false,
      missingOffices: ["Treasurer"],
    });
    expect(recs.some((r) => r.id === "registration-incomplete")).toBe(true);
  });

  it("orders critical findings before warnings and info", () => {
    const recs = generateRecommendations({
      ...healthy,
      overextended: true,
      registrationComplete: false,
      missingOffices: ["Secretary"],
      nextMgrEvent: {
        cycleNumber: 3,
        scheduledDate: "2026-08-10",
        recipientName: "Bill",
        status: "active",
        daysUntil: 2,
      },
    });
    expect(recs[0].severity).toBe("critical");
    expect(recs.at(-1)!.severity !== "critical").toBe(true);
  });

  it("surfaces critical member risk separately from warnings", () => {
    const recs = generateRecommendations({
      ...healthy,
      memberRiskFlags: [
        { memberId: 1, name: "Bill", reasons: ["1 overdue loan"], severity: "critical" },
        { memberId: 2, name: "Mercy", reasons: ["1 unpaid fine"], severity: "warning" },
      ],
    });
    expect(recs.find((r) => r.id === "members-critical")?.detail).toBe("Bill");
    expect(recs.find((r) => r.id === "members-warning")?.detail).toBe("Mercy");
  });
});
