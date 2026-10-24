import { describe, expect, it } from "vitest";
import { approvalError, destinationError, normalizeDestination, requestError, toIntasendPayout } from "@/lib/domain/group-wallet";

const bank = { kind: "bank" as const, bankCode: "1", account: "0123456789", name: "Umoja Women Group" };

describe("destinations", () => {
  it("validates each kind", () => {
    expect(destinationError(bank)).toBeNull();
    expect(destinationError({ ...bank, account: "12ab" })).toMatch(/account/);
    expect(destinationError({ kind: "paybill", paybill: "522522", accountRef: "", name: "X" })).toMatch(/account/);
    expect(destinationError({ kind: "till", till: "12", name: "X" })).toMatch(/till/);
  });

  it("builds IntaSend payouts", () => {
    expect(toIntasendPayout(bank, 1500, "Umoja withdrawal October")).toEqual({
      provider: "PESALINK",
      transaction: { name: "Umoja Women Group", amount: 1500, narrative: "Umoja withdrawal Octob", account: "0123456789", bank_code: "1" },
    });
    expect(toIntasendPayout({ kind: "paybill", paybill: "522522", accountRef: "123", name: "G" }, 200, "x").transaction).toMatchObject({
      account: "522522",
      account_type: "PayBill",
      account_reference: "123",
    });
    expect(toIntasendPayout({ kind: "till", till: "54321", name: "G" }, 200, "x").transaction).toMatchObject({ account_type: "TillNumber" });
  });
});

describe("M-Pesa number payouts", () => {
  it("normalizes, validates and pays by B2C", () => {
    const d = normalizeDestination({ kind: "mpesa", phone: "0712 345 678", name: "Mary Wanjiru" });
    expect(d).toEqual({ kind: "mpesa", phone: "254712345678", name: "Mary Wanjiru" });
    expect(destinationError(d)).toBeNull();
    expect(destinationError({ kind: "mpesa", phone: "12345", name: "M" })).toMatch(/Safaricom/);
    expect(toIntasendPayout(d, 5000, "Funeral fund")).toEqual({
      provider: "MPESA-B2C",
      transaction: { name: "Mary Wanjiru", amount: 5000, narrative: "Funeral fund", account: "254712345678" },
    });
  });
});

describe("maker–checker", () => {
  const w = { status: "requested", requestedBy: 1, amount: 5000 };
  it("needs a different official and enough money", () => {
    expect(approvalError(w, 2, 10000)).toBeNull();
    expect(approvalError(w, 1, 10000)).toMatch(/Another official/);
    expect(approvalError(w, null, 10000)).toMatch(/person/);
    expect(approvalError(w, 2, 4000)).toMatch(/only Ksh 4,000/);
    expect(approvalError({ ...w, status: "sent" }, 2, 10000)).toMatch(/not waiting/);
  });

  it("checks requests", () => {
    expect(requestError(500, 1000, null)).toMatch(/admin must set/);
    expect(requestError(50, 1000, bank)).toMatch(/smallest/);
    expect(requestError(5000, 1000, bank)).toMatch(/only/);
    expect(requestError(500, 1000, bank)).toBeNull();
  });
});

describe("payout outcome", () => {
  it("reads IntaSend's status codes", async () => {
    const { payoutOutcome } = await import("@/lib/domain/group-wallet");
    expect(payoutOutcome({ status_code: "BC100", transactions: [{ status_code: "TS100" }] })).toEqual({ state: "paid" });
    expect(payoutOutcome({ status_code: "BC100", transactions: [{ status_code: "TF103", status_description: "Invalid account" }] })).toEqual({ state: "failed", reason: "Invalid account" });
    expect(payoutOutcome({ transactions: [{ status_code: "TF105", status: "Unknown" }] })).toMatchObject({ state: "failed", reason: expect.stringMatching(/contact IntaSend/) });
    expect(payoutOutcome({ status_code: "BF102", status: "Failed" })).toEqual({ state: "failed", reason: "Failed" });
    expect(payoutOutcome({ status_code: "BP103", transactions: [{ status_code: "TP102" }] })).toEqual({ state: "pending" });
    expect(payoutOutcome({})).toEqual({ state: "pending" });
  });
});
