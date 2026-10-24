import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { isAuthorizedCronRequest, runCronJob } from "@/lib/cron/helpers";
import { withPlatformAdmin } from "@/lib/db/rls";
import { groups } from "@/lib/db/schema";
import { runAgent } from "@/lib/agent/run";

/**
 * Daily at 09:00 Africa/Nairobi (06:00 UTC — see vercel.json): runs the
 * deterministic agent's playbooks for every active group. Each group runs on
 * its own, so one group's failure doesn't stop the others. Returns the
 * number of steps carried out.
 */
export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runCronJob("agent", async () => {
    const active = await withPlatformAdmin((tx) => tx.select({ id: groups.id }).from(groups).where(eq(groups.active, true)));
    let done = 0;
    for (const g of active) {
      try {
        const report = await runAgent(g.id, { trigger: "cron" });
        done += report?.steps.filter((s) => s.ok).length ?? 0;
      } catch (e) {
        console.error(`[agent] group ${g.id}`, e);
      }
    }
    return done;
  });
  if (!result.ranJob) return NextResponse.json({ ok: true, skipped: "already running" });
  return NextResponse.json({ ok: !result.error, ...result });
}
