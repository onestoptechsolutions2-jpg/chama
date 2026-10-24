import { NextResponse } from "next/server";
import { isAuthorizedCronRequest, runCronJob } from "@/lib/cron/helpers";
import { closeDueFunds } from "@/lib/funds/funds";

/**
 * Daily just after midnight Africa/Nairobi (21:05 UTC — see vercel.json):
 * funeral funds past their closing date stop taking gifts and the partner
 * gets a fund.closed webhook. Returns the number of funds closed.
 */
export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runCronJob("funds-close", () => closeDueFunds());
  if (!result.ranJob) return NextResponse.json({ ok: true, skipped: "already running" });
  return NextResponse.json({ ok: !result.error, ...result });
}
