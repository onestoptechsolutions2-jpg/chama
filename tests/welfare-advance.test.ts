import { describe, it, expect } from "vitest";
import {
  computeAdvanceFee,
  computeAdvanceTotalRepayable,
  computeOutstandingAdvanceExposure,
  isAdvanceOverdue,
} from "../lib/domain/welfare-advance";

describe("computeAdvanceFee", () => {
  it("is 0 when the fee percentage is 0 (the default)", () => {
    expect(computeAdvanceFee(10000, 0)).toBe(0);
  });

  it("computes a percentage fee", () => {
    expect(computeAdvanceFee(10000, 5)).toBe(500);
  });
});

describe("computeAdvanceTotalRepayable", () => {
  it("equals the principal when there's no fee", () => {
    expect(computeAdvanceTotalRepayable(8000, 0)).toBe(8000);
  });

  it("adds the fee to the principal", () => {
    expect(computeAdvanceTotalRepayable(8000, 5)).toBe(8400);
  });
});

describe("computeOutstandingAdvanceExposure", () => {
  it("sums only active/overdue advances, ignoring paid/defaulted/written_off", () => {
    const advances = [
      { amountRemaining: "1000", status: "active" },
      { amountRemaining: "500", status: "overdue" },
      { amountRemaining: "0", status: "paid" },
      { amountRemaining: "2000", status: "written_off" },
    ];
    expect(computeOutstandingAdvanceExposure(advances)).toBe(1500);
  });

  it("is 0 with no advances", () => {
    expect(computeOutstandingAdvanceExposure([])).toBe(0);
  });
});

describe("isAdvanceOverdue", () => {
  const now = new Date("2026-08-17T00:00:00Z");

  it("is true when the due date has passed", () => {
    expect(isAdvanceOverdue("2026-08-01", now)).toBe(true);
  });

  it("is false when the due date is in the future", () => {
    expect(isAdvanceOverdue("2026-09-01", now)).toBe(false);
  });
});
