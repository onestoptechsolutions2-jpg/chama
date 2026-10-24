import { describe, expect, it } from "vitest";
import {
  can,
  canPlatform,
  isPlatformStaff,
  permissionsForRole,
  selfDealingError,
  GROUP_PERMISSIONS,
} from "@/lib/auth/permissions";
import { getVisibleNavItems } from "@/lib/nav-config";

const allOn = { loans: true, mgr: true, welfare: true, projects: true };
const allOff = { loans: false, mgr: false, welfare: false, projects: false };

describe("can", () => {
  it("grants by role", () => {
    expect(can({ role: "treasurer", products: allOn }, "money.record")).toBe(true);
    expect(can({ role: "secretary", products: allOn }, "money.record")).toBe(false);
    expect(can({ role: "member", products: allOn }, "members.view")).toBe(false);
  });

  it("requires the product to be switched on", () => {
    expect(can({ role: "admin", products: allOn }, "loans.manage")).toBe(true);
    expect(can({ role: "admin", products: allOff }, "loans.manage")).toBe(false);
    expect(can({ role: "member", products: allOff }, "loans.use")).toBe(false);
  });

  it("denies without a membership", () => {
    expect(can(null, "group.view")).toBe(false);
  });

  it("lets every role, officials included, use member features", () => {
    for (const role of ["admin", "treasurer", "secretary", "member"] as const) {
      expect(can({ role, products: allOn }, "loans.use")).toBe(true);
      expect(can({ role, products: allOn }, "welfare.use")).toBe(true);
      expect(can({ role, products: allOn }, "mgr.use")).toBe(true);
    }
  });

  it("keeps people-management admin-only", () => {
    expect(permissionsForRole("treasurer")).not.toContain("members.manage");
    expect(permissionsForRole("admin")).toContain("members.manage");
  });

  it("gives every permission a label and at least one role", () => {
    for (const def of Object.values(GROUP_PERMISSIONS)) {
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.roles.length).toBeGreaterThan(0);
    }
  });
});

describe("canPlatform", () => {
  it("separates owner, support and agent", () => {
    expect(canPlatform("support", "platform.console")).toBe(true);
    expect(canPlatform("support", "support.money")).toBe(false);
    expect(canPlatform("owner", "support.money")).toBe(true);
    expect(canPlatform("agent", "platform.console")).toBe(false);
    expect(canPlatform("agent", "agent.run")).toBe(true);
    expect(canPlatform(null, "platform.console")).toBe(false);
  });
});

describe("selfDealingError", () => {
  it("blocks acting on your own money", () => {
    expect(selfDealingError(7, 7, "approve a loan")).toMatch(/yourself/);
    expect(selfDealingError(7, 8, "approve a loan")).toBeNull();
    expect(selfDealingError(null, 8, "approve a loan")).toBeNull();
  });
});

describe("nav follows permissions", () => {
  it("shows My Loan to officials too", () => {
    const labels = getVisibleNavItems({ role: "treasurer", products: allOn }).map((i) => i.label);
    expect(labels).toContain("My Loan");
    expect(labels).toContain("Loans");
  });

  it("hides staff pages from members", () => {
    const labels = getVisibleNavItems({ role: "member", products: allOn }).map((i) => i.label);
    expect(labels).not.toContain("Members");
    expect(labels).not.toContain("Settings");
  });

  it("hides product pages when the product is off", () => {
    const labels = getVisibleNavItems({ role: "admin", products: allOff }).map((i) => i.label);
    expect(labels).not.toContain("Loans");
    expect(labels).not.toContain("Mzunguko");
  });
});

describe("isPlatformStaff", () => {
  it("treats every platform role as staff who can't join groups", () => {
    expect(isPlatformStaff("owner")).toBe(true);
    expect(isPlatformStaff("support")).toBe(true);
    expect(isPlatformStaff("agent")).toBe(true);
    expect(isPlatformStaff(null)).toBe(false);
  });
});
