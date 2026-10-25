import { describe, expect, it } from "vitest";
import { computeShareOut, interestPortion, shillingDays, type ShareOutMember } from "@/lib/domain/share-out";

const member = (over: Partial<ShareOutMember>): ShareOutMember => ({
  memberId: 1,
  name: "A",
  savings: 0,
  deposits: [],
  openingSavings: 0,
  loanBalance: 0,
  unpaidFines: 0,
  ...over,
});

const base = { periodStart: "2026-01-01", periodEnd: "2026-12-31", finesCollected: 0, otherIncome: 0, expenses: 0 };

describe("computeShareOut", () => {
  it("shares earnings in proportion to savings", () => {
    const r = computeShareOut({
      ...base,
      method: "savings",
      interestEarned: 3000,
      members: [member({ memberId: 1, savings: 10000 }), member({ memberId: 2, savings: 20000 })],
    });
    expect(r.lines.map((l) => l.earnings)).toEqual([1000, 2000]);
    expect(r.lines.map((l) => l.payout)).toEqual([11000, 22000]);
    expect(r.totals.payout).toBe(33000);
  });

  it("rewards earlier saving with the time method", () => {
    const r = computeShareOut({
      ...base,
      method: "time",
      interestEarned: 1000,
      members: [
        member({ memberId: 1, savings: 1000, deposits: [{ date: "2026-01-01", amount: 1000 }] }),
        member({ memberId: 2, savings: 1000, deposits: [{ date: "2026-12-01", amount: 1000 }] }),
      ],
    });
    expect(r.lines[0].earnings).toBeGreaterThan(r.lines[1].earnings * 10);
  });

  it("deducts loans and fines, and reports what is still owed", () => {
    const r = computeShareOut({
      ...base,
      method: "savings",
      interestEarned: 0,
      members: [member({ savings: 5000, loanBalance: 7000, unpaidFines: 200 })],
    });
    expect(r.lines[0]).toMatchObject({ payout: 0, stillOwes: 2200, deductions: 7200 });
  });

  it("never pays out more than the profit (rounding stays with the group)", () => {
    const r = computeShareOut({
      ...base,
      method: "savings",
      interestEarned: 100,
      members: [member({ memberId: 1, savings: 1 }), member({ memberId: 2, savings: 1 }), member({ memberId: 3, savings: 1 })],
    });
    expect(r.totals.earnings).toBe(99);
    expect(r.roundingLeftover).toBe(1);
  });

  it("subtracts expenses and never shares a loss", () => {
    const r = computeShareOut({ ...base, method: "savings", interestEarned: 100, expenses: 500, members: [member({ savings: 100 })] });
    expect(r.profit).toBe(0);
  });
});

describe("helpers", () => {
  it("counts opening savings for the whole period", () => {
    expect(shillingDays(member({ openingSavings: 10 }), "2026-01-01", "2026-01-10")).toBe(100);
  });

  it("takes the interest share of a repayment", () => {
    expect(interestPortion(1100, 1000, 1100)).toBeCloseTo(100);
    expect(interestPortion(500, 1000, 1000)).toBe(0);
  });
});

describe("members keep their shares", () => {
  it("pays out savings and earnings but leaves shares in the group", () => {
    const r = computeShareOut({
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      method: "savings",
      interestEarned: 1000,
      finesCollected: 0,
      otherIncome: 0,
      expenses: 0,
      members: [
        { memberId: 1, name: "A", savings: 6000, deposits: [], openingSavings: 6000, loanBalance: 0, unpaidFines: 0, sharesKept: 2000 },
        { memberId: 2, name: "B", savings: 4000, deposits: [], openingSavings: 4000, loanBalance: 5000, unpaidFines: 0, sharesKept: 2000 },
      ],
    });
    expect(r.lines[0]).toMatchObject({ earnings: 600, sharesKept: 2000, payout: 4600, stillOwes: 0 });
    // B: 4000 − 2000 kept + 400 earnings = 2400 against a 5000 loan
    expect(r.lines[1]).toMatchObject({ earnings: 400, sharesKept: 2000, payout: 0, stillOwes: 2600 });
  });
});
