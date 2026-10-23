import { describe, expect, it } from "vitest";
import { computeSubscriptionQuote, computeTransactionFee, pickPlan } from "../lib/domain/billing";

describe("pickPlan", () => {
  it("is free up to 10 members, then Group, then Large group", () => {
    expect(pickPlan(10)).toBe("free");
    expect(pickPlan(11)).toBe("group");
    expect(pickPlan(50)).toBe("group");
    expect(pickPlan(51)).toBe("large");
    expect(pickPlan(300)).toBe("large");
    expect(pickPlan(301)).toBe("custom");
  });

  it("bills employee welfare per member", () => {
    expect(pickPlan(5, "employee_welfare")).toBe("employer");
  });
});

describe("computeSubscriptionQuote", () => {
  it("prices the plans", () => {
    expect(computeSubscriptionQuote({ activeMembers: 8 })).toMatchObject({ plan: "free", totalMonthly: 0, totalAnnual: 0 });
    expect(computeSubscriptionQuote({ activeMembers: 25 })).toMatchObject({ plan: "group", totalMonthly: 400, annualUpfront: 4000, smsPerMonth: 200 });
    expect(computeSubscriptionQuote({ activeMembers: 120 })).toMatchObject({ plan: "large", totalMonthly: 900, annualUpfront: 9000 });
  });

  it("charges the employer per member", () => {
    expect(computeSubscriptionQuote({ activeMembers: 200, segment: "employee_welfare" })).toMatchObject({
      plan: "employer",
      totalMonthly: 6000,
    });
  });

  it("estimates and flags groups over 300", () => {
    const q = computeSubscriptionQuote({ activeMembers: 400 });
    expect(q.isCustomQuote).toBe(true);
    expect(q.totalMonthly).toBe(900 + 100 * 3);
  });

  it("undercuts Chamasoft's Ksh 1,000/month for a typical group", () => {
    expect(computeSubscriptionQuote({ activeMembers: 30 }).totalMonthly).toBeLessThan(1000);
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
