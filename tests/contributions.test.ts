import { describe, it, expect } from "vitest";
import { validateContributionAmount, CONTRIBUTION_BALANCE_FIELD } from "../lib/domain/contributions";
import { MIN_PERSONAL_SAVINGS_INCREMENT } from "../lib/domain/constants";

describe("validateContributionAmount", () => {
  it("rejects a personal_savings amount below the minimum increment", () => {
    const error = validateContributionAmount("personal_savings", MIN_PERSONAL_SAVINGS_INCREMENT - 1);
    expect(error).toContain(String(MIN_PERSONAL_SAVINGS_INCREMENT));
  });

  it("accepts a personal_savings amount at or above the minimum increment", () => {
    expect(validateContributionAmount("personal_savings", MIN_PERSONAL_SAVINGS_INCREMENT)).toBeNull();
    expect(validateContributionAmount("personal_savings", MIN_PERSONAL_SAVINGS_INCREMENT + 1)).toBeNull();
  });

  it("never enforces the minimum on other contribution types (capital/security had no such floor in the original app)", () => {
    expect(validateContributionAmount("capital", 1)).toBeNull();
    expect(validateContributionAmount("security", 1)).toBeNull();
    expect(validateContributionAmount("mgr", 1)).toBeNull();
  });
});

describe("CONTRIBUTION_BALANCE_FIELD", () => {
  it("maps each balance-affecting contribution type to its members.* column", () => {
    expect(CONTRIBUTION_BALANCE_FIELD.capital).toBe("capital");
    expect(CONTRIBUTION_BALANCE_FIELD.security).toBe("security");
    expect(CONTRIBUTION_BALANCE_FIELD.personal_savings).toBe("personalSavings");
  });

  it("has no welfare entry — a welfare contribution feeds the collective fund, not a per-member balance (Phase 8)", () => {
    expect("welfare" in CONTRIBUTION_BALANCE_FIELD).toBe(false);
  });
});
