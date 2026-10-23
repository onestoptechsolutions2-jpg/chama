import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStatementToken, verifyStatementToken } from "@/lib/statement-link";

describe("statement links", () => {
  beforeEach(() => {
    process.env.STATEMENT_LINK_SECRET = "test-secret";
  });
  afterEach(() => {
    delete process.env.STATEMENT_LINK_SECRET;
  });

  it("round-trips one member in one group", () => {
    const token = createStatementToken(3, 42)!;
    expect(verifyStatementToken(token)).toEqual({ groupId: 3, memberId: 42 });
  });

  it("rejects an edited token", () => {
    const token = createStatementToken(3, 42)!;
    const [, sig] = token.split(".");
    const forged = `${Buffer.from(`3.43.${Math.floor(Date.now() / 1000) + 1000}`).toString("base64url")}.${sig}`;
    expect(verifyStatementToken(forged)).toBeNull();
  });

  it("expires", () => {
    const token = createStatementToken(3, 42, new Date("2020-01-01"))!;
    expect(verifyStatementToken(token)).toBeNull();
  });

  it("is off without a secret", () => {
    delete process.env.STATEMENT_LINK_SECRET;
    expect(createStatementToken(3, 42)).toBeNull();
  });
});
