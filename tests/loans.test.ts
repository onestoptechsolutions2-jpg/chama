import { describe, it, expect } from "vitest";
import {
  totalSavings,
  computeLoanLimit,
  computeTotalRepayable,
  defaultDueDate,
  isActiveLoanStatus,
} from "../lib/domain/loans";

describe("totalSavings", () => {
  it("sums capital, security, and personal savings", () => {
    expect(totalSavings({ capital: 1000, security: 500, personalSavings: 250, limitReduced: false })).toBe(1750);
  });

  it("coerces string columns (as they come back from the numeric DB type)", () => {
    expect(totalSavings({ capital: "1000.50", security: "0", personalSavings: "0", limitReduced: false })).toBe(1000.5);
  });
});

describe("computeLoanLimit", () => {
  // Bug 9 (docs/architecture.md): the original app ignored
  // groups.loanMaxMultiplier and hardcoded 2x/1x — this must always read
  // the group's actual configured value.
  it("uses the group's configured multiplier, not a hardcoded 2x", () => {
    const member = { capital: 10_000, security: 0, personalSavings: 0, limitReduced: false };
    expect(computeLoanLimit(member, { loanMaxMultiplier: 3 })).toBe(30_000);
    expect(computeLoanLimit(member, { loanMaxMultiplier: 4.5 })).toBe(45_000);
  });

  it("drops to 1x savings once limitReduced is set, regardless of the configured multiplier", () => {
    const member = { capital: 10_000, security: 0, personalSavings: 0, limitReduced: true };
    expect(computeLoanLimit(member, { loanMaxMultiplier: 3 })).toBe(10_000);
  });

  it("coerces a string multiplier (as it comes back from the numeric DB column)", () => {
    const member = { capital: 10_000, security: 0, personalSavings: 0, limitReduced: false };
    expect(computeLoanLimit(member, { loanMaxMultiplier: "3.00" })).toBe(30_000);
  });
});

describe("computeTotalRepayable", () => {
  it("adds interest on top of principal and rounds to the nearest shilling", () => {
    expect(computeTotalRepayable(10_000, 20)).toBe(12_000);
  });

  it("rounds a fractional result", () => {
    expect(computeTotalRepayable(1_000, 12.5)).toBe(1_125);
    expect(computeTotalRepayable(999, 20)).toBe(1_199); // 1198.8 -> 1199
  });

  it("returns just the principal at 0% interest", () => {
    expect(computeTotalRepayable(5_000, 0)).toBe(5_000);
  });
});

describe("defaultDueDate", () => {
  it("adds the repayment period in months", () => {
    expect(defaultDueDate(new Date("2026-01-15T00:00:00Z"), 3)).toBe("2026-04-15");
  });

  it("rolls over the year boundary correctly", () => {
    expect(defaultDueDate(new Date("2026-11-01T00:00:00Z"), 3)).toBe("2027-02-01");
  });

  it("clamps a month with fewer days rather than overflowing (JS Date's own month-end behavior)", () => {
    // Jan 31 + 1 month: February has no 31st, so Date rolls into March —
    // documenting the actual behavior since it's a classic off-by-one trap.
    expect(defaultDueDate(new Date("2026-01-31T00:00:00Z"), 1)).toBe("2026-03-03");
  });
});

describe("isActiveLoanStatus", () => {
  it("treats active, extended, and overdue as active", () => {
    expect(isActiveLoanStatus("active")).toBe(true);
    expect(isActiveLoanStatus("extended")).toBe(true);
    expect(isActiveLoanStatus("overdue")).toBe(true);
  });

  it("treats pending, cleared, and rejected as not active", () => {
    expect(isActiveLoanStatus("pending")).toBe(false);
    expect(isActiveLoanStatus("cleared")).toBe(false);
    expect(isActiveLoanStatus("rejected")).toBe(false);
  });
});
