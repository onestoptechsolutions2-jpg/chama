import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/lib/db/rls";
import { contributions, members, groups } from "@/lib/db/schema";
import { apiAuth } from "@/lib/auth/api-response";
import { validateContributionAmount, CONTRIBUTION_BALANCE_FIELD } from "@/lib/domain/contributions";
import { recordApiContributionSchema } from "@/lib/validation/developer";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatch";

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
 * recorded balance, the same operation recordContributionAction performs
 * from the UI — never a disbursement, an approval, or anything that moves
 * money in the other direction. Mirrors that action's own validation and
 * balance-update logic exactly, deliberately not factored into a shared
 * function across the Server Action and this route — see
 * docs/developer-guide.md on why Server Actions and Route Handlers are
 * kept as separate call paths rather than one sharing the other.
 */
export async function POST(req: Request) {
  const auth = await apiAuth(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  const parsed = recordApiContributionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { memberId, type, amount, reference } = parsed.data;
  const groupId = auth.groupId;

  const result = await withTenant(groupId, async (tx): Promise<{ error: string; status: number } | { ok: true; id: number }> => {
    const group = await tx.query.groups.findFirst({ where: eq(groups.id, groupId) });
    if (!group) return { error: "Group not found", status: 404 };

    const member = await tx.query.members.findFirst({
      where: and(eq(members.id, memberId), eq(members.groupId, groupId)),
    });
    if (!member) return { error: "Member not found", status: 404 };

    const amountError = validateContributionAmount(type, amount, Number(group.minPersonalSavingsIncrement));
    if (amountError) return { error: amountError, status: 400 };

    const [contribution] = await tx
      .insert(contributions)
      .values({ groupId, memberId, amount: String(amount), type, status: "paid", reference: reference || null })
      .returning();

    if (type !== "welfare") {
      const balanceField = CONTRIBUTION_BALANCE_FIELD[type as keyof typeof CONTRIBUTION_BALANCE_FIELD];
      if (balanceField) {
        await tx
          .update(members)
          .set({ [balanceField]: String(Number(member[balanceField]) + amount), updatedAt: new Date() })
          .where(eq(members.id, memberId));
      }
    }

    return { ok: true, id: contribution.id };
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  void dispatchWebhookEvent(groupId, "contribution.recorded", {
    contributionId: result.id,
    memberId,
    type,
    amount,
  });

  return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
}
