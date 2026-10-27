import { NextResponse } from "next/server";
import { isAuthorizedCronRequest, runCronJob } from "@/lib/cron/helpers";
import { runDailyBackups } from "@/lib/backup/daily";

/**
 * Daily at 05:40 Africa/Nairobi (02:40 UTC — see vercel.json), before
 * officials sign in: builds each group's backup workbook, prunes old ones
 * and emails the officials (lib/backup/daily.ts). Returns workbooks built.
 */
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let detail = { built: 0, emailed: 0, failed: 0 };
  const result = await runCronJob("backups", async () => {
    detail = await runDailyBackups();
    return detail.built;
  });
  if (!result.ranJob) return NextResponse.json({ ok: true, skipped: "already running" });
  return NextResponse.json({ ok: !result.error, ...result, ...detail });
}
