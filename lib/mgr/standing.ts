import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import { contributions, mgrCycles, mgrMemberTurns } from "@/lib/db/schema";
import { mgrStanding, type MgrStanding } from "@/lib/domain/mgr";

/** 1-based position of a cycle in its rotation (cycle numbers run on across rotations). */
export async function cyclePosition(tx: Tx, rotationId: number, cycleNumber: number): Promise<number> {
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(mgrCycles)
    .where(and(eq(mgrCycles.rotationId, rotationId), sql`${mgrCycles.cycleNumber} <= ${cycleNumber}`));
  return r?.n ?? 0;
}

/**
 * Each member's MGR standing in a rotation: what they should have paid in
 * for `cyclesDue` cycles (contribution × their multiplier each) against the
 * MGR contributions recorded into that rotation.
 */
export async function rotationStandings(
  tx: Tx,
  groupId: number,
  rotation: { id: number; contributionAmount: string },
  cyclesDue: number,
): Promise<Map<number, MgrStanding>> {
  const paidRows = await tx
    .select({ memberId: contributions.memberId, paid: sql<string>`coalesce(sum(${contributions.amount}), 0)` })
    .from(contributions)
    .where(and(eq(contributions.groupId, groupId), eq(contributions.type, "mgr"), eq(contributions.mgrRotationId, rotation.id), eq(contributions.status, "paid")))
    .groupBy(contributions.memberId);
  const paidBy = new Map(paidRows.map((r) => [r.memberId, Number(r.paid)]));
  const turns = await tx.query.mgrMemberTurns.findMany({ where: and(eq(mgrMemberTurns.groupId, groupId), eq(mgrMemberTurns.active, true)) });
  return new Map(
    turns.map((t) => [
      t.memberId,
      mgrStanding({ contribution: Number(rotation.contributionAmount), multiplier: Number(t.contributionMultiplier), cyclesDue, paid: paidBy.get(t.memberId) ?? 0 }),
    ]),
  );
}
