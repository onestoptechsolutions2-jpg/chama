import { describe, expect, it } from "vitest";
import { closesOnError, committeeError, giftError, isOpen, summarizeGifts } from "@/lib/domain/funeral-fund";

describe("funeral fund rules", () => {
  it("is open until the end of its closing day", () => {
    expect(isOpen({ status: "open", closesOn: "2026-11-30" }, "2026-11-30")).toBe(true);
    expect(isOpen({ status: "open", closesOn: "2026-11-30" }, "2026-12-01")).toBe(false);
    expect(isOpen({ status: "converted", closesOn: "2026-11-30" }, "2026-11-01")).toBe(false);
  });

  it("checks the closing date", () => {
    expect(closesOnError("2026-11-30", "2026-10-23")).toBeNull();
    expect(closesOnError("2026-10-01", "2026-10-23")).toMatch(/past/);
    expect(closesOnError("2027-06-01", "2026-10-23")).toMatch(/at most/);
    expect(closesOnError("30/11/2026", "2026-10-23")).toMatch(/date/);
  });

  it("needs one chair and distinct phones", () => {
    expect(committeeError([{ role: "treasurer", phone: "254700000001" }])).toMatch(/chair/);
    expect(committeeError([{ role: "chair", phone: "254700000001" }, { role: "chair", phone: "254700000002" }])).toMatch(/one chair/);
    expect(committeeError([{ role: "chair", phone: "254700000001" }, { role: "treasurer", phone: "254700000001" }])).toMatch(/twice/);
    expect(committeeError([{ role: "chair", phone: null }])).toMatch(/phone/);
    expect(committeeError([{ role: "chair", phone: "254700000001" }, { role: "treasurer", phone: "254700000002" }])).toBeNull();
  });

  it("refuses bad gifts and prompt spam", () => {
    const ctx = { open: true, branches: ["Kamau"], recentFromPhone: 0 };
    expect(giftError({ amount: 500, phone: "254700000001", branch: "Kamau" }, ctx)).toBeNull();
    expect(giftError({ amount: 500, phone: "254700000001" }, { ...ctx, open: false })).toMatch(/closed/);
    expect(giftError({ amount: 5, phone: "254700000001" }, ctx)).toMatch(/smallest/);
    expect(giftError({ amount: 500, phone: null }, ctx)).toMatch(/Safaricom/);
    expect(giftError({ amount: 500, phone: "254700000001", branch: "Other" }, ctx)).toMatch(/branch/);
    expect(giftError({ amount: 500, phone: "254700000001" }, { ...ctx, recentFromPhone: 3 })).toMatch(/Too many/);
  });

  it("totals paid gifts by branch and hides anonymous names", () => {
    const at = (m: number) => new Date(Date.UTC(2026, 9, 23, 10, m));
    const s = summarizeGifts([
      { name: "Peter", amount: 1000, branch: "Kamau", message: "Pole", anonymous: false, status: "paid", paidAt: at(1) },
      { name: "Mary", amount: 500, branch: "Kamau", message: null, anonymous: true, status: "paid", paidAt: at(2) },
      { name: "John", amount: 300, branch: null, message: null, anonymous: false, status: "paid", paidAt: at(3) },
      { name: "Failed", amount: 9999, branch: "Kamau", message: null, anonymous: false, status: "failed", paidAt: null },
    ]);
    expect(s.total).toBe(1800);
    expect(s.giftCount).toBe(3);
    expect(s.byBranch).toEqual([
      { branch: "Kamau", total: 1500, count: 2 },
      { branch: null, total: 300, count: 1 },
    ]);
    expect(s.recent.map((r) => r.name)).toEqual(["John", "Well-wisher", "Peter"]);
  });
});
