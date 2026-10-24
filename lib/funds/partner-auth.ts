import "server-only";
import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

/**
 * Partner API auth. PARTNER_API_TOKENS lists partners and their tokens:
 * "familycompass:<token>[,other:<token>]". A partner can only see and act
 * on the funds it created.
 */
function partners(): [string, string][] {
  return (process.env.PARTNER_API_TOKENS ?? "")
    .split(",")
    .map((p) => p.trim().split(":"))
    .filter((p): p is [string, string] => p.length === 2 && Boolean(p[0]) && p[1].length >= 24);
}

const digest = (s: string) => createHash("sha256").update(s).digest();

export function partnerAuth(req: Request): string | NextResponse {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (token) {
    for (const [name, expected] of partners()) {
      if (timingSafeEqual(digest(token), digest(expected))) return name;
    }
  }
  return NextResponse.json({ error: "Invalid or missing partner token" }, { status: 401 });
}

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
