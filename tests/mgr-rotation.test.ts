import { describe, expect, it } from "vitest";
import { cyclesNeeded, nextRotationStart, rescheduleRotation, rotationEndDate, rotationFinished } from "@/lib/domain/mgr";

describe("rotation dates", () => {
  it("works out how many cycles the design needs", () => {
    expect(cyclesNeeded(12, 1)).toBe(12);
    expect(cyclesNeeded(12, 2)).toBe(6);
    expect(cyclesNeeded(13, 2)).toBe(7);
    expect(cyclesNeeded(0, 1)).toBe(0);
  });

  it("sets the end date from the start, frequency and cycles", () => {
    expect(rotationEndDate("2026-11-02", "weekly", 12)).toBe("2027-01-18");
    expect(rotationEndDate("2026-11-02", "biweekly", 6)).toBe("2027-01-11");
    expect(rotationEndDate("2026-01-31", "monthly", 2)).toBe("2026-02-28");
    expect(rotationEndDate("2026-11-02", "weekly", 1)).toBe("2026-11-02");
  });

  it("suggests the next rotation one period after the last ended", () => {
    expect(nextRotationStart("2027-01-18", "weekly")).toBe("2027-01-25");
    expect(nextRotationStart("2027-01-31", "monthly")).toBe("2027-02-28");
  });

  const cycles = [
    { id: 1, cycleNumber: 1, status: "completed", scheduledDate: "2026-11-02" },
    { id: 2, cycleNumber: 2, status: "active", scheduledDate: "2026-11-09" },
    { id: 3, cycleNumber: 3, status: "planned", scheduledDate: "2026-11-16" },
  ];

  it("moves the start date when nothing is paid yet", () => {
    const fresh = cycles.map((c) => ({ ...c, status: c.id === 1 ? "active" : "planned" }));
    const r = rescheduleRotation(fresh, "2026-12-07", "weekly", "2026-10-24");
    expect(r).toEqual({
      dates: [
        { id: 1, date: "2026-12-07" },
        { id: 2, date: "2026-12-14" },
        { id: 3, date: "2026-12-21" },
      ],
      startDate: "2026-12-07",
      endDate: "2026-12-21",
    });
    expect(rescheduleRotation(fresh, "2026-10-01", "weekly", "2026-10-24")).toEqual({ error: "The start date can't be in the past" });
  });

  it("postpones only what is left after payouts began", () => {
    const r = rescheduleRotation(cycles, "2026-11-30", "weekly", "2026-11-10");
    expect(r).toEqual({ dates: [{ id: 2, date: "2026-11-30" }, { id: 3, date: "2026-12-07" }], startDate: null, endDate: "2026-12-07" });
    expect(rescheduleRotation(cycles, "2026-11-02", "weekly", "2026-11-10")).toEqual({ error: "Pick a date after the last payout (2026-11-02)" });
  });

  it("knows when a rotation is finished", () => {
    expect(rotationFinished(["completed", "completed"])).toBe(true);
    expect(rotationFinished(["completed", "active"])).toBe(false);
    expect(rotationFinished([])).toBe(false);
  });
});

describe("suggested start of a new rotation", () => {
  const today = "2026-10-24";
  it("prefers the configured date, then the day after the last one ended, then today", async () => {
    const { suggestRotationStart } = await import("@/lib/domain/mgr");
    expect(suggestRotationStart({ configuredStart: "2026-11-02", previous: null, today })).toBe("2026-11-02");
    expect(suggestRotationStart({ configuredStart: "2026-01-01", previous: { endDate: "2026-10-26", frequency: "weekly" }, today })).toBe("2026-11-02");
    expect(suggestRotationStart({ configuredStart: null, previous: { endDate: "2026-01-12", frequency: "weekly" }, today })).toBe(today);
  });
});

describe("who has paid in", () => {
  it("expects each member's share for every cycle so far", async () => {
    const { mgrStanding, payoutBlocker } = await import("@/lib/domain/mgr");
    expect(mgrStanding({ contribution: 500, multiplier: 1, cyclesDue: 3, paid: 1500 })).toEqual({ expected: 1500, paid: 1500, owed: 0 });
    expect(mgrStanding({ contribution: 500, multiplier: 2, cyclesDue: 3, paid: 2000 })).toEqual({ expected: 3000, paid: 2000, owed: 1000 });
    expect(mgrStanding({ contribution: 500, multiplier: 1, cyclesDue: 2, paid: 1800 }).owed).toBe(0);
    expect(payoutBlocker("Akinyi", { expected: 3000, paid: 2000, owed: 1000 })).toMatch(/Akinyi still owes Ksh 1,000.*paid 2,000 of 3,000/);
    expect(payoutBlocker("Akinyi", { expected: 1500, paid: 1500, owed: 0 })).toBeNull();
  });
});
