import { NextResponse } from "next/server";
import { isAuthorizedCronRequest, runCronJob } from "@/lib/cron/helpers";
import { checkPendingPayouts } from "@/lib/payments/payouts";

/**
 * Daily at 08:50 Africa/Nairobi (05:50 UTC — see vercel.json): a backstop
 * for missed IntaSend send-money events — re-checks group-wallet payouts
 * still "sent" and records paid/failed. Returns the number settled.
 */
export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runCronJob("payouts-check", () => checkPendingPayouts());
  if (!result.ranJob) return NextResponse.json({ ok: true, skipped: "already running" });
  return NextResponse.json({ ok: !result.error, ...result });
}
