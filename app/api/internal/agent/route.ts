import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { PLAYBOOKS, type PlaybookId } from "@/lib/domain/agent-playbooks";
import { ALL_PLAYBOOKS, runAgent } from "@/lib/agent/run";

/**
 * Trigger the deterministic agent for one group from another system (e.g. a
 * scheduler). It can only run the fixed playbooks — it cannot be handed
 * arbitrary commands, so nothing outside (an AI model included) can steer
 * what it does.
 *
 *   GET  → the playbooks and the rule each follows
 *   POST { groupId, playbooks?: string[], dryRun?: boolean (default true) }
 *
 * Auth: `Authorization: Bearer $AGENT_API_TOKEN`.
 */
function tokenOk(req: Request): boolean {
  const expected = process.env.AGENT_API_TOKEN;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !given) return false;
  return timingSafeEqual(createHash("sha256").update(expected).digest(), createHash("sha256").update(given).digest());
}

const bodySchema = z.object({
  groupId: z.number().int().positive(),
  playbooks: z.array(z.enum(ALL_PLAYBOOKS as [PlaybookId, ...PlaybookId[]])).optional(),
  dryRun: z.boolean().default(true),
});

export async function GET(req: Request) {
  if (!tokenOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ playbooks: Object.entries(PLAYBOOKS).map(([id, p]) => ({ id, ...p })) });
}

export async function POST(req: Request) {
  if (!tokenOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  const report = await runAgent(parsed.data.groupId, { dryRun: parsed.data.dryRun, playbooks: parsed.data.playbooks, trigger: "api" });
  if (!report) return NextResponse.json({ error: "Group not found or inactive" }, { status: 404 });
  return NextResponse.json(report);
}
