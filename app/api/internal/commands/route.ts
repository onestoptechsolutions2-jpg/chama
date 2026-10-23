import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { withTenant } from "@/lib/db/rls";
import { groupMemberships, groups, members, users } from "@/lib/db/schema";
import { canPlatform } from "@/lib/auth/permissions";
import { COMMANDS, listCommands } from "@/lib/commands/registry";
import { runCommand } from "@/lib/commands/run";
import type { Actor } from "@/lib/commands/types";

/**
 * The backend agent's door into a group. It can run any registered command
 * (lib/commands/registry.ts) — the same rules, permission matrix and audit
 * log as a person — and nothing else:
 *
 *   GET  → the commands it may call
 *   POST { groupId, command, input, reason, asUserId?, dryRun? }
 *
 * - Auth: `Authorization: Bearer $AGENT_API_TOKEN`, acting as the user
 *   AGENT_USER_ID, whose platform role must allow agent.run.
 * - dryRun defaults to TRUE: it shows what would happen and rolls back.
 *   Send "dryRun": false to apply.
 * - A reason is required and lands in the group's Activity log (via = agent).
 * - asUserId: act with that member's role and money record (maker–checker
 *   applies to them); otherwise with admin rights, as no member.
 * - Commands that move money out are refused: the agent prepares, a person pays.
 */
function tokenOk(req: Request): boolean {
  const expected = process.env.AGENT_API_TOKEN;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !given) return false;
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(given).digest();
  return timingSafeEqual(a, b);
}

async function agentUser() {
  const id = Number(process.env.AGENT_USER_ID);
  if (!Number.isInteger(id) || id <= 0) return null;
  const user = await db.query.users.findFirst({ where: eq(users.id, id) });
  return user && user.active && canPlatform(user.platformRole, "agent.run") ? user : null;
}

const bodySchema = z.object({
  groupId: z.number().int().positive(),
  command: z.string(),
  input: z.unknown(),
  reason: z.string().trim().min(3).max(300),
  asUserId: z.number().int().positive().optional(),
  dryRun: z.boolean().default(true),
});

export async function GET(req: Request) {
  if (!tokenOk(req) || !(await agentUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ commands: listCommands() });
}

export async function POST(req: Request) {
  if (!tokenOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const agent = await agentUser();
  if (!agent) return NextResponse.json({ error: "Agent account is not set up (AGENT_USER_ID with the agent role)" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  const { groupId, command: name, input, reason, asUserId, dryRun } = parsed.data;
  const command = COMMANDS[name];
  if (!command) return NextResponse.json({ error: `Unknown command ${name}`, commands: Object.keys(COMMANDS) }, { status: 404 });

  const group = await withTenant(groupId, (tx) => tx.query.groups.findFirst({ where: eq(groups.id, groupId) }));
  if (!group || !group.active) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  let role: Actor["role"] = "admin";
  let memberId: number | null = null;
  if (asUserId) {
    const membership = await db.query.groupMemberships.findFirst({
      where: and(eq(groupMemberships.userId, asUserId), eq(groupMemberships.groupId, groupId), eq(groupMemberships.status, "active")),
    });
    if (!membership) return NextResponse.json({ error: "asUserId is not an active member of this group" }, { status: 400 });
    role = membership.role;
    const member = await withTenant(groupId, (tx) =>
      tx.query.members.findFirst({
        where: and(eq(members.userId, asUserId), eq(members.groupId, groupId)),
        columns: { id: true },
      }),
    );
    memberId = member?.id ?? null;
  }

  const actor: Actor = {
    userId: agent.id,
    name: agent.name,
    groupId,
    groupName: group.name,
    role,
    products: { loans: group.loansEnabled, mgr: group.mgrEnabled, welfare: group.welfareEnabled, projects: group.projectsEnabled },
    memberId,
    via: "agent",
    platformRole: agent.platformRole,
    onBehalfOfUserId: asUserId ?? null,
    reason,
  };
  const result = await runCommand(actor, command, input, { dryRun });
  return NextResponse.json({ dryRun, ...result }, { status: result.ok ? 200 : (result.status ?? 400) });
}
