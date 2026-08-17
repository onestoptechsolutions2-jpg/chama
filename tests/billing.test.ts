import { describe, it, expect } from "vitest";
import {
  computeMemberFee,
  computeVehicleFee,
  computeActivityFee,
  computeSubscriptionQuote,
  computeAnnualDiscountedCharge,
  computeTransactionFee,
  type ActiveVehicles,
} from "../lib/domain/billing";

const noVehicles: ActiveVehicles = { welfare: false, investment: false, tableBanking: false };

describe("computeMemberFee", () => {
  it("is free for the smallest band with no paid vehicle active (Starter)", () => {
    expect(computeMemberFee(10, false)).toEqual({ fee: 0, isCustomQuote: false });
  });

  it("charges the base band fee once a paid vehicle is active, even at Starter headcount", () => {
    expect(computeMemberFee(10, true)).toEqual({ fee: 1200, isCustomQuote: false });
  });

  it("looks up each band correctly regardless of vehicle status once above 15 members", () => {
    expect(computeMemberFee(20, false).fee).toBe(2400);
    expect(computeMemberFee(45, false).fee).toBe(3600);
    expect(computeMemberFee(100, false).fee).toBe(6500);
    expect(computeMemberFee(250, false).fee).toBe(12000);
  });

  it("uses the boundary value's own band, not the next one up", () => {
    expect(computeMemberFee(15, true).fee).toBe(1200);
    expect(computeMemberFee(16, false).fee).toBe(2400);
  });

  it("flags a custom quote and applies the marginal rate past 250 members", () => {
    const result = computeMemberFee(300, false);
    expect(result.isCustomQuote).toBe(true);
    expect(result.fee).toBe(12000 + 50 * 50); // 50 members over the 250 ceiling
  });
});

describe("computeVehicleFee", () => {
  it("is 0 with no vehicles active", () => {
    expect(computeVehicleFee(noVehicles)).toBe(0);
  });

  it("sums each active vehicle's complexity-weighted fee", () => {
    expect(computeVehicleFee({ welfare: true, investment: false, tableBanking: false })).toBe(400);
    expect(computeVehicleFee({ welfare: false, investment: true, tableBanking: false })).toBe(900);
    expect(computeVehicleFee({ welfare: false, investment: false, tableBanking: true })).toBe(1800);
  });

  it("caps the total even when every vehicle is active", () => {
    // 400 + 900 + 1800 = 3100, under the 3500 cap — cap only bites with more vehicles than exist today
    expect(computeVehicleFee({ welfare: true, investment: true, tableBanking: true })).toBe(3100);
  });
});

describe("computeActivityFee", () => {
  it("is included (0) below the first threshold", () => {
    expect(computeActivityFee(500_000)).toEqual({ fee: 0, isCustomQuote: false });
  });

  it("looks up each band by gross flow", () => {
    expect(computeActivityFee(2_000_000).fee).toBe(1_000);
    expect(computeActivityFee(4_000_000).fee).toBe(2_000);
    expect(computeActivityFee(40_000_000).fee).toBe(12_500);
  });

  it("never exceeds roughly 0.1% of flow anywhere in the table — an activity fee, not a disguised AUM tax", () => {
    for (const flow of [1_500_000, 4_500_000, 9_000_000, 20_000_000, 45_000_000]) {
      const { fee } = computeActivityFee(flow);
      expect(fee / flow).toBeLessThan(0.001);
    }
  });

  it("flags a custom quote past the top band and applies the illustrative rate", () => {
    const result = computeActivityFee(60_000_000);
    expect(result.isCustomQuote).toBe(true);
    expect(result.fee).toBe(Math.round(60_000_000 * 0.0004));
  });
});

describe("computeSubscriptionQuote", () => {
  it("is a free Starter quote for a small, vehicle-free group", () => {
    const quote = computeSubscriptionQuote({ activeMembers: 12, vehicles: noVehicles, annualGrossFlow: 0 });
    expect(quote.totalAnnual).toBe(0);
    expect(quote.tierLabel).toBe("Starter");
  });

  it("labels a savings-only group without table banking as Community", () => {
    const quote = computeSubscriptionQuote({
      activeMembers: 25,
      vehicles: noVehicles,
      annualGrossFlow: 500_000,
    });
    expect(quote.tierLabel).toBe("Community");
    expect(quote.totalAnnual).toBe(2400); // member band only
  });

  it("labels a table-banking group as Finance, and Pro once investment is also active", () => {
    const finance = computeSubscriptionQuote({
      activeMembers: 30,
      vehicles: { welfare: false, investment: false, tableBanking: true },
      annualGrossFlow: 2_000_000,
    });
    expect(finance.tierLabel).toBe("Finance");
    expect(finance.totalAnnual).toBe(2400 + 1800 + 1000); // 5,200 — matches the pricing review's worked example

    const pro = computeSubscriptionQuote({
      activeMembers: 100,
      vehicles: { welfare: true, investment: true, tableBanking: true },
      annualGrossFlow: 9_000_000,
    });
    expect(pro.tierLabel).toBe("Pro");
    expect(pro.totalAnnual).toBe(6500 + 3100 + 4000); // 13,600 — matches the 100-member scenario
  });

  it("converts the annual total to a monthly figure", () => {
    const quote = computeSubscriptionQuote({ activeMembers: 25, vehicles: noVehicles, annualGrossFlow: 0 });
    expect(quote.totalMonthly).toBe(200); // 2,400 / 12
  });
});

describe("computeAnnualDiscountedCharge", () => {
  it("applies the 15% annual-commitment discount", () => {
    expect(computeAnnualDiscountedCharge(2400)).toBe(2040);
  });
});

describe("computeTransactionFee", () => {
  it("charges 0.75% on a loan disbursement", () => {
    expect(computeTransactionFee("loan_disbursement", 100_000)).toBe(750);
  });

  it("charges 0.5% on a loan repayment, deliberately lower than disbursement", () => {
    expect(computeTransactionFee("loan_repayment", 100_000)).toBe(500);
  });
});
