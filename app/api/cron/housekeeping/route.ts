import { NextResponse } from "next/server";
import { lt, sql } from "drizzle-orm";
import { isAuthorizedCronRequest, runCronJob } from "@/lib/cron/helpers";
import { db } from "@/lib/db/client";
import { rateLimits, sessions } from "@/lib/db/schema";

/**
 * Daily at 03:10 Africa/Nairobi (00:10 UTC — see vercel.json): deletes
 * expired sign-in sessions and rate-limit counters older than a day.
 * Returns the number of rows removed.
 */
export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runCronJob("housekeeping", async () => {
    const expired = await db.delete(sessions).where(lt(sessions.expiresAt, new Date())).returning({ id: sessions.id });
    const stale = await db
      .delete(rateLimits)
      .where(lt(rateLimits.windowStart, sql`now() - interval '1 day'`))
      .returning({ key: rateLimits.key });
    return expired.length + stale.length;
  });
  if (!result.ranJob) return NextResponse.json({ ok: true, skipped: "already running" });
  return NextResponse.json({ ok: !result.error, ...result });
}
