import { describe, it, expect, afterEach } from "vitest";
import { calcPlatformFee, normalizeKenyanPhone, isValidIntasendChallenge } from "../lib/domain/payments";

describe("calcPlatformFee", () => {
  it("computes a simple percentage", () => {
    expect(calcPlatformFee(3000, 5)).toBe(150);
  });

  it("reads the group's actual fee percentage, not a hardcoded 5%", () => {
    expect(calcPlatformFee(1000, 10)).toBe(100);
    expect(calcPlatformFee(1000, 2.5)).toBe(25);
  });

  it("rounds to 2 decimal places", () => {
    expect(calcPlatformFee(333.33, 5)).toBe(16.67);
  });

  it("returns 0 for a 0% fee", () => {
    expect(calcPlatformFee(5000, 0)).toBe(0);
  });
});

describe("normalizeKenyanPhone", () => {
  it("converts a leading-zero number to 254 format", () => {
    expect(normalizeKenyanPhone("0712345678")).toBe("254712345678");
  });

  it("leaves an already-254 number unchanged", () => {
    expect(normalizeKenyanPhone("254712345678")).toBe("254712345678");
  });

  it("strips non-digit characters before normalizing", () => {
    expect(normalizeKenyanPhone("0712 345 678")).toBe("254712345678");
    expect(normalizeKenyanPhone("+254712345678")).toBe("254712345678");
  });

  it("handles a bare 9-digit number starting with 7", () => {
    expect(normalizeKenyanPhone("712345678")).toBe("254712345678");
  });
});

describe("isValidIntasendChallenge", () => {
  const ENV_KEY = "INTASEND_WEBHOOK_CHALLENGE";

  afterEach(() => {
    delete process.env[ENV_KEY];
  });

  it("rejects when no challenge is configured", () => {
    delete process.env[ENV_KEY];
    expect(isValidIntasendChallenge({ challenge: "anything" })).toBe(false);
  });

  it("accepts only an exact match against the configured challenge", () => {
    process.env[ENV_KEY] = "testnet";
    expect(isValidIntasendChallenge({ challenge: "testnet" })).toBe(true);
    expect(isValidIntasendChallenge({ challenge: "wrong" })).toBe(false);
    expect(isValidIntasendChallenge({})).toBe(false);
  });
});
