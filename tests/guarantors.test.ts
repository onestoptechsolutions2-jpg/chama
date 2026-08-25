import { describe, it, expect } from "vitest";
import {
  checkGuarantorEligibility,
  countAcceptedGuarantors,
  hasMinimumAcceptedGuarantors,
} from "../lib/domain/guarantors";

const baseEligible = {
  isSelf: false,
  isActiveMember: true,
  hasOwnOverdueLoan: false,
  currentGuaranteeCount: 0,
};

describe("checkGuarantorEligibility", () => {
  it("is eligible when every condition is clean", () => {
    expect(checkGuarantorEligibility(baseEligible)).toEqual({ eligible: true });
  });

  it("rejects guaranteeing your own loan", () => {
    const result = checkGuarantorEligibility({ ...baseEligible, isSelf: true });
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.reason).toMatch(/own loan/);
  });

  it("rejects an inactive member", () => {
    const result = checkGuarantorEligibility({ ...baseEligible, isActiveMember: false });
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.reason).toMatch(/active member/);
  });

  it("rejects a guarantor with their own defaulted loan", () => {
    const result = checkGuarantorEligibility({ ...baseEligible, hasOwnOverdueLoan: true });
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.reason).toMatch(/defaulted loan/);
  });

  it("rejects once the concurrent-guarantee cap is reached", () => {
    const result = checkGuarantorEligibility({ ...baseEligible, currentGuaranteeCount: 2 });
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.reason).toMatch(/maximum of 2/);
  });

  it("is still eligible just under the cap", () => {
    expect(checkGuarantorEligibility({ ...baseEligible, currentGuaranteeCount: 1 }).eligible).toBe(true);
  });

  it("honors the group's own configured cap instead of the platform default", () => {
    const stricter = checkGuarantorEligibility({
      ...baseEligible,
      currentGuaranteeCount: 1,
      maxConcurrentGuarantees: 1,
    });
    expect(stricter.eligible).toBe(false);
    if (!stricter.eligible) expect(stricter.reason).toMatch(/maximum of 1/);

    const looser = checkGuarantorEligibility({
      ...baseEligible,
      currentGuaranteeCount: 3,
      maxConcurrentGuarantees: 5,
    });
    expect(looser.eligible).toBe(true);
  });
});

describe("countAcceptedGuarantors", () => {
  it("counts only accepted, not pending or declined", () => {
    const guarantors = [
      { status: "accepted" as const },
      { status: "pending" as const },
      { status: "declined" as const },
      { status: "accepted" as const },
    ];
    expect(countAcceptedGuarantors(guarantors)).toBe(2);
  });

  it("is 0 for an empty list", () => {
    expect(countAcceptedGuarantors([])).toBe(0);
  });
});

describe("hasMinimumAcceptedGuarantors", () => {
  it("passes automatically when the group requires 0", () => {
    expect(hasMinimumAcceptedGuarantors([], 0)).toBe(true);
  });

  it("fails when fewer have accepted than required", () => {
    const guarantors = [{ status: "accepted" as const }, { status: "pending" as const }];
    expect(hasMinimumAcceptedGuarantors(guarantors, 2)).toBe(false);
  });

  it("passes once enough have accepted", () => {
    const guarantors = [{ status: "accepted" as const }, { status: "accepted" as const }];
    expect(hasMinimumAcceptedGuarantors(guarantors, 2)).toBe(true);
  });

  it("passes with more accepted than required", () => {
    const guarantors = [
      { status: "accepted" as const },
      { status: "accepted" as const },
      { status: "accepted" as const },
    ];
    expect(hasMinimumAcceptedGuarantors(guarantors, 1)).toBe(true);
  });
});
