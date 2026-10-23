import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * A member's statement link that needs no password — sent in SMS receipts,
 * because most members never log in. The token is HMAC-signed
 * (STATEMENT_LINK_SECRET) over the member, group and expiry, so it can't be
 * guessed or edited to show someone else, and it expires (default 90 days).
 * It only ever shows that one member's own statement, read-only.
 */
const TTL_DAYS = 90;

function secret(): string | null {
  return process.env.STATEMENT_LINK_SECRET || null;
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function statementLinksEnabled(): boolean {
  return secret() !== null;
}

export function createStatementToken(groupId: number, memberId: number, now: Date = new Date()): string | null {
  const key = secret();
  if (!key) return null;
  const exp = Math.floor(now.getTime() / 1000) + TTL_DAYS * 86400;
  const payload = `${groupId}.${memberId}.${exp}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload, key)}`;
}

export function verifyStatementToken(token: string, now: Date = new Date()): { groupId: number; memberId: number } | null {
  const key = secret();
  if (!key) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const payload = Buffer.from(encoded, "base64url").toString();
  const expected = Buffer.from(sign(payload, key));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const [groupId, memberId, exp] = payload.split(".").map(Number);
  if (!groupId || !memberId || !exp || exp * 1000 < now.getTime()) return null;
  return { groupId, memberId };
}
