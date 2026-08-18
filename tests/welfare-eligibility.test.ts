import { describe, it, expect } from "vitest";
import { checkMemberEligibility } from "../lib/domain/welfare-eligibility";

const now = new Date("2026-08-17T00:00:00Z");

const baseEligible = {
  isActiveMember: true,
  tenureMonths: 12,
  minTenureMonths: 0,
  claimsThisYear: 0,
  maxClaimsPerYear: 2,
  lastRequestDate: null,
  cooldownDays: 30,
  now,
};

describe("checkMemberEligibility", () => {
  it("is eligible when every condition is clean", () => {
    expect(checkMemberEligibility(baseEligible)).toEqual({ eligible: true });
  });

  it("rejects an inactive member", () => {
    const result = checkMemberEligibility({ ...baseEligible, isActiveMember: false });
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.reason).toMatch(/active member/);
  });

  it("rejects a member below the minimum tenure", () => {
    const result = checkMemberEligibility({ ...baseEligible, tenureMonths: 1, minTenureMonths: 6 });
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.reason).toMatch(/6 month/);
  });

  it("rejects once the yearly claim cap is reached", () => {
    const result = checkMemberEligibility({ ...baseEligible, claimsThisYear: 2, maxClaimsPerYear: 2 });
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.reason).toMatch(/maximum of 2/);
  });

  it("a maxClaimsPerYear of 0 means no cap", () => {
    expect(
      checkMemberEligibility({ ...baseEligible, claimsThisYear: 50, maxClaimsPerYear: 0 }).eligible,
    ).toBe(true);
  });

  it("rejects a request submitted before the cooldown has elapsed", () => {
    const result = checkMemberEligibility({
      ...baseEligible,
      lastRequestDate: "2026-08-10",
      cooldownDays: 30,
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.reason).toMatch(/wait/);
  });

  it("is eligible once the cooldown has fully elapsed", () => {
    expect(
      checkMemberEligibility({ ...baseEligible, lastRequestDate: "2026-07-01", cooldownDays: 30 })
        .eligible,
    ).toBe(true);
  });

  it("a cooldownDays of 0 means no cooldown", () => {
    expect(
      checkMemberEligibility({ ...baseEligible, lastRequestDate: "2026-08-16", cooldownDays: 0 })
        .eligible,
    ).toBe(true);
  });
});
