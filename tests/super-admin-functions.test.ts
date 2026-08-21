import { describe, expect, it } from "vitest";
import {
  normalizePlatformRole,
  platformRoleLabel,
  canGrantPlatformRole,
} from "../lib/domain/super-admin";

describe("super-admin helpers", () => {
  it("accepts only the supported platform roles", () => {
    expect(normalizePlatformRole("owner")).toBe("owner");
    expect(normalizePlatformRole("support")).toBe("support");
    expect(normalizePlatformRole("member")).toBe(null);
    expect(normalizePlatformRole("" as unknown as string)).toBe(null);
    expect(normalizePlatformRole(undefined)).toBe(null);
  });

  it("labels roles consistently for the UI", () => {
    expect(platformRoleLabel("owner")).toBe("Owner");
    expect(platformRoleLabel("support")).toBe("Support");
    expect(platformRoleLabel(null)).toBe("None");
  });

  it("prevents elevating a role beyond the caller's platform authority", () => {
    expect(canGrantPlatformRole("owner", "support")).toBe(true);
    expect(canGrantPlatformRole("support", "owner")).toBe(false);
    expect(canGrantPlatformRole(null, "support")).toBe(false);
  });
});
