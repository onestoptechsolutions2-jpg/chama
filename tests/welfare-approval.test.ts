import { describe, it, expect } from "vitest";
import {
  resolveApprovalTier,
  requiredApproverRoles,
  isApprovalQuorumMet,
  hasAnyDecline,
  canApprove,
} from "../lib/domain/welfare-approval";

const policy = { tier1MaxAmount: 10000, tier2MaxAmount: 30000 };

describe("resolveApprovalTier", () => {
  it("stays tier1 at and under the tier1 threshold", () => {
    expect(resolveApprovalTier(10000, policy)).toBe("tier1");
    expect(resolveApprovalTier(5000, policy)).toBe("tier1");
  });

  it("moves to tier2 just above the tier1 threshold", () => {
    expect(resolveApprovalTier(10001, policy)).toBe("tier2");
    expect(resolveApprovalTier(30000, policy)).toBe("tier2");
  });

  it("moves to tier3 above the tier2 threshold", () => {
    expect(resolveApprovalTier(30001, policy)).toBe("tier3");
  });
});

describe("requiredApproverRoles", () => {
  it("tier1 requires no co-signers", () => {
    expect(requiredApproverRoles("tier1", null)).toEqual([]);
  });

  it("tier2 requires admin + treasurer", () => {
    expect(requiredApproverRoles("tier2", null)).toEqual(["admin", "treasurer"]);
  });

  it("tier3 requires all three officials", () => {
    expect(requiredApproverRoles("tier3", null)).toEqual(["admin", "treasurer", "secretary"]);
  });

  it("skips the claimant's own office rather than requiring self-approval", () => {
    expect(requiredApproverRoles("tier3", "treasurer")).toEqual(["admin", "secretary"]);
  });

  it("tier2 with the claimant holding one of its two roles leaves just one approver", () => {
    expect(requiredApproverRoles("tier2", "admin")).toEqual(["treasurer"]);
  });
});

describe("isApprovalQuorumMet", () => {
  it("tier1 is always met (no co-sign needed)", () => {
    expect(isApprovalQuorumMet("tier1", [])).toBe(true);
  });

  it("tier2/tier3 is not met with an empty approval list", () => {
    expect(isApprovalQuorumMet("tier2", [])).toBe(false);
  });

  it("is not met while any approval is still pending", () => {
    const approvals = [{ status: "accepted" as const }, { status: "pending" as const }];
    expect(isApprovalQuorumMet("tier3", approvals)).toBe(false);
  });

  it("is met once every approval has been accepted", () => {
    const approvals = [{ status: "accepted" as const }, { status: "accepted" as const }];
    expect(isApprovalQuorumMet("tier2", approvals)).toBe(true);
  });

  it("is not met if any approval was declined", () => {
    const approvals = [{ status: "accepted" as const }, { status: "declined" as const }];
    expect(isApprovalQuorumMet("tier3", approvals)).toBe(false);
  });
});

describe("hasAnyDecline", () => {
  it("is false with no declines", () => {
    expect(hasAnyDecline([{ status: "accepted" }, { status: "pending" }])).toBe(false);
  });

  it("is true with at least one decline", () => {
    expect(hasAnyDecline([{ status: "accepted" }, { status: "declined" }])).toBe(true);
  });
});

describe("canApprove", () => {
  it("allows a different member to approve", () => {
    expect(canApprove(1, 2)).toBe(true);
  });

  it("blocks self-approval", () => {
    expect(canApprove(5, 5)).toBe(false);
  });
});
