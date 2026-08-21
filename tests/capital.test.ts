import { describe, it, expect } from "vitest";
import { computeCapitalPosition, computeAllocationDrift, type CapitalPools } from "../lib/domain/capital";

const basePools: CapitalPools = {
  capitalPool: 0,
  securityPool: 0,
  personalSavingsPool: 0,
  welfareAvailable: 0,
  welfareCollected: 0,
  welfareDisbursed: 0,
  projectsCommitted: 0,
  loanPrincipalOutstanding: 0,
  loanReceivableOutstanding: 0,
};

describe("computeCapitalPosition", () => {
  it("treats an empty group as fully reserved with 0% deployment, not a divide-by-zero", () => {
    const pos = computeCapitalPosition(basePools);
    expect(pos.reserve).toBe(0);
    expect(pos.loanDeploymentPct).toBe(0);
    expect(pos.overextended).toBe(false);
  });

  it("with no loans out, reserve equals the full capital pool", () => {
    const pos = computeCapitalPosition({ ...basePools, capitalPool: 100_000 });
    expect(pos.reserve).toBe(100_000);
    expect(pos.loanDeploymentPct).toBe(0);
  });

  it("computes partial deployment and the matching reserve", () => {
    const pos = computeCapitalPosition({
      ...basePools,
      capitalPool: 1_000_000,
      loanPrincipalOutstanding: 600_000,
      loanReceivableOutstanding: 680_000, // includes accrued interest
    });
    expect(pos.reserve).toBe(400_000);
    expect(pos.loanDeploymentPct).toBe(60);
    expect(pos.loanReceivableOutstanding).toBe(680_000);
    expect(pos.overextended).toBe(false);
  });

  it("floors reserve at 0 and flags overextended when loans exceed the capital pool", () => {
    // Can happen if a member's capital contributions lag their loan draw,
    // or after a data correction — the UI should surface this as a flag,
    // not silently show a negative reserve.
    const pos = computeCapitalPosition({
      ...basePools,
      capitalPool: 100_000,
      loanPrincipalOutstanding: 150_000,
    });
    expect(pos.reserve).toBe(0);
    expect(pos.overextended).toBe(true);
    expect(pos.loanDeploymentPct).toBe(100); // capped, not 150%
  });

  it("nets welfareAvailable against disbursed claims, floored at 0", () => {
    const pos = computeCapitalPosition({
      ...basePools,
      welfareCollected: 50_000,
      welfareDisbursed: 20_000,
    });
    expect(pos.welfareAvailable).toBe(30_000);
  });

  it("never returns a negative welfareAvailable even if disbursed somehow exceeds collected", () => {
    const pos = computeCapitalPosition({ ...basePools, welfareCollected: 10_000, welfareDisbursed: 15_000 });
    expect(pos.welfareAvailable).toBe(0);
  });

  it("keeps security, personal savings, and projects reported but out of the loan-deployment math", () => {
    const pos = computeCapitalPosition({
      ...basePools,
      capitalPool: 200_000,
      securityPool: 80_000,
      personalSavingsPool: 40_000,
      projectsCommitted: 25_000,
      loanPrincipalOutstanding: 100_000,
    });
    expect(pos.reserve).toBe(100_000); // 200k capital - 100k loans, unaffected by the other pools
    expect(pos.securityPool).toBe(80_000);
    expect(pos.personalSavingsPool).toBe(40_000);
    expect(pos.projectsCommitted).toBe(25_000);
  });
});

describe("computeAllocationDrift", () => {
  it("returns null when no target is configured", () => {
    expect(computeAllocationDrift(75, null)).toBeNull();
  });

  it("is on_target within the tolerance band", () => {
    const drift = computeAllocationDrift(65, 60);
    expect(drift?.severity).toBe("on_target");
    expect(drift?.deltaPts).toBe(5);
  });

  it("flags over_deployed once actual exceeds target by more than the tolerance", () => {
    const drift = computeAllocationDrift(78, 60);
    expect(drift?.severity).toBe("over_deployed");
    expect(drift?.deltaPts).toBe(18);
  });

  it("flags under_deployed once actual sits well below target", () => {
    const drift = computeAllocationDrift(30, 60);
    expect(drift?.severity).toBe("under_deployed");
    expect(drift?.deltaPts).toBe(-30);
  });

  it("sits exactly on the tolerance boundary as on_target, not flagged", () => {
    const drift = computeAllocationDrift(75, 60); // +15, the boundary itself
    expect(drift?.severity).toBe("on_target");
  });
});
