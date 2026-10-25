import "server-only";
import { headers } from "next/headers";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

/**
 * Shared rate limits, kept in Postgres so every serverless instance sees the
 * same counters (no extra service). Fixed windows: the first hit opens a
 * window, later hits count until it expires. `hit` returns false once the
 * limit is passed. One statement, so concurrent hits can't race past it.
 */
export async function hit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const { rows } = await db.execute<{ count: number }>(sql`
    insert into rate_limits (key, window_start, count) values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then now() else rate_limits.window_start end
    returning count`);
  return Number(rows[0]?.count ?? 0) <= limit;
}

/** The caller's IP as Vercel reports it (first x-forwarded-for entry). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** Limits per door. Generous for real people, tight for scripts. */
export const LIMITS = {
  loginPerIp: { limit: 30, windowSeconds: 15 * 60 },
  loginPerAccount: { limit: 10, windowSeconds: 15 * 60 },
  registerPerIp: { limit: 10, windowSeconds: 60 * 60 },
  givePerIp: { limit: 20, windowSeconds: 10 * 60 },
} as const;

export const TOO_MANY = "Too many attempts from here. Please wait a few minutes and try again.";
