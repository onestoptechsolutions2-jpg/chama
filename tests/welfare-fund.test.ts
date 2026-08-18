import { describe, it, expect } from "vitest";
import {
  applyReserveMovement,
  isBelowFloor,
  computeRequestTotal,
} from "../lib/domain/welfare-fund";

describe("applyReserveMovement", () => {
  it("credits a reserve", () => {
    expect(applyReserveMovement(1000, 500, "in", false)).toEqual({ ok: true, newBalance: 1500 });
  });

  it("debits a reserve", () => {
    expect(applyReserveMovement(1000, 500, "out", false)).toEqual({ ok: true, newBalance: 500 });
  });

  it("rejects a debit that would go negative when overdraft is off", () => {
    const result = applyReserveMovement(200, 500, "out", false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Insufficient/);
  });

  it("allows a debit to go negative when overdraft is explicitly on", () => {
    expect(applyReserveMovement(200, 500, "out", true)).toEqual({ ok: true, newBalance: -300 });
  });

  it("allows a debit that exactly zeroes the reserve", () => {
    expect(applyReserveMovement(500, 500, "out", false)).toEqual({ ok: true, newBalance: 0 });
  });
});

describe("isBelowFloor", () => {
  it("is true when the balance is under the floor", () => {
    expect(isBelowFloor(3000, 5000)).toBe(true);
  });

  it("is false at or above the floor", () => {
    expect(isBelowFloor(5000, 5000)).toBe(false);
    expect(isBelowFloor(6000, 5000)).toBe(false);
  });
});

describe("computeRequestTotal", () => {
  it("sums the three requested amounts", () => {
    expect(
      computeRequestTotal({
        requestedEmergencyAmount: 2000,
        requestedLongTermAmount: 3000,
        requestedAdvanceAmount: 8000,
      }),
    ).toBe(13000);
  });

  it("is 0 when nothing was requested", () => {
    expect(
      computeRequestTotal({
        requestedEmergencyAmount: 0,
        requestedLongTermAmount: 0,
        requestedAdvanceAmount: 0,
      }),
    ).toBe(0);
  });
});
