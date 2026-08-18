import { describe, it, expect } from "vitest";
import {
  computeContributionAllocation,
  validateAllocationSplit,
  splitAcrossReserves,
} from "../lib/domain/welfare-policy";

describe("computeContributionAllocation", () => {
  it("fixed_amount routes the configured amount, capped at the contribution itself", () => {
    expect(
      computeContributionAllocation({
        method: "fixed_amount",
        contributionAmount: 500,
        fixedAmount: 200,
        pct: null,
      }),
    ).toBe(200);
  });

  it("fixed_amount is capped when it exceeds the contribution", () => {
    expect(
      computeContributionAllocation({
        method: "fixed_amount",
        contributionAmount: 100,
        fixedAmount: 200,
        pct: null,
      }),
    ).toBe(100);
  });

  it("pct_contribution takes a percentage of the contribution", () => {
    expect(
      computeContributionAllocation({
        method: "pct_contribution",
        contributionAmount: 1000,
        fixedAmount: null,
        pct: 25,
      }),
    ).toBe(250);
  });

  it("pct_collections behaves the same as pct_contribution today", () => {
    expect(
      computeContributionAllocation({
        method: "pct_collections",
        contributionAmount: 1000,
        fixedAmount: null,
        pct: 25,
      }),
    ).toBe(250);
  });

  it("manual routes nothing automatically", () => {
    expect(
      computeContributionAllocation({
        method: "manual",
        contributionAmount: 1000,
        fixedAmount: 500,
        pct: 50,
      }),
    ).toBe(0);
  });
});

describe("validateAllocationSplit", () => {
  it("passes when the three percentages sum to 100", () => {
    expect(
      validateAllocationSplit({ emergencyPct: 50, longTermPct: 30, advancePct: 20 }),
    ).toBeNull();
  });

  it("rejects a split that doesn't sum to 100", () => {
    const result = validateAllocationSplit({ emergencyPct: 50, longTermPct: 30, advancePct: 30 });
    expect(result).toMatch(/sum to 100/);
  });

  it("rejects a negative percentage", () => {
    const result = validateAllocationSplit({ emergencyPct: -10, longTermPct: 60, advancePct: 50 });
    expect(result).toMatch(/negative/);
  });

  it("tolerates tiny floating-point rounding", () => {
    expect(
      validateAllocationSplit({ emergencyPct: 33.34, longTermPct: 33.33, advancePct: 33.33 }),
    ).toBeNull();
  });
});

describe("splitAcrossReserves", () => {
  it("splits an amount exactly according to the percentages", () => {
    const result = splitAcrossReserves(1000, {
      emergencyPct: 50,
      longTermPct: 30,
      advancePct: 20,
    });
    expect(result).toEqual({ emergency: 500, longTerm: 300, advance: 200 });
  });

  it("always sums back to exactly the original amount, even with odd percentages", () => {
    const result = splitAcrossReserves(100, {
      emergencyPct: 33.33,
      longTermPct: 33.33,
      advancePct: 33.34,
    });
    const total = Math.round((result.emergency + result.longTerm + result.advance) * 100) / 100;
    expect(total).toBe(100);
  });

  it("routes everything to one reserve when the split is 100/0/0", () => {
    const result = splitAcrossReserves(750, { emergencyPct: 100, longTermPct: 0, advancePct: 0 });
    expect(result).toEqual({ emergency: 750, longTerm: 0, advance: 0 });
  });
});
