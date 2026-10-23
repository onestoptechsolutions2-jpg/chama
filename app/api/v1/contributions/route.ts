import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/lib/db/rls";
import { contributions } from "@/lib/db/schema";
import { apiAuth } from "@/lib/auth/api-response";
import { recordApiContributionSchema } from "@/lib/validation/developer";
import { runCommand } from "@/lib/commands/run";
import { systemActor } from "@/lib/commands/actor";
import { recordContribution } from "@/lib/commands/contributions";

export async function GET(req: Request) {
  const auth = await apiAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const memberId = searchParams.get("memberId");

  const rows = await withTenant(auth.groupId, (tx) =>
    tx.query.contributions.findMany({
      where: memberId
        ? and(eq(contributions.groupId, auth.groupId), eq(contributions.memberId, Number(memberId)))
        : eq(contributions.groupId, auth.groupId),
      orderBy: (c, { desc }) => [desc(c.createdAt)],
      limit: 200,
    }),
  );

  return NextResponse.json({ contributions: rows });
}

/**
 * A "safe write" by design (see docs/api.md): money coming into a member's
 * recorded balance — never a disbursement, an approval, or anything that
 * moves money out. Runs the same command as the in-app button
 * (lib/commands/contributions.ts), so welfare routing, the member check,
 * the audit log, the webhook and the SMS receipt are identical.
 */
export async function POST(req: Request) {
  const auth = await apiAuth(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  const parsed = recordApiContributionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const actor = await systemActor(auth.groupId, "api", `API key #${auth.apiKeyId}`);
  if (!actor) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  const result = await runCommand(actor, recordContribution, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });

  return NextResponse.json({ ok: true, id: result.data.contributionId }, { status: 201 });
}
