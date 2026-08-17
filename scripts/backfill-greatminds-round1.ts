/**
 * Backfill script — adds GreatMinds' actual completed first MGR rotation
 * (15 Apr – 15 Aug 2026), reconstructed from the group's WhatsApp history,
 * ahead of the round already seeded by scripts/seed-greatminds.ts (which
 * runs 30 Aug – 30 Dec 2026 and gets renumbered from cycles 1-9 to 10-18
 * to make room).
 *
 * Corrections vs. the original seed, per the WhatsApp history:
 *  - Real contribution is 520 KES/cycle, not the 500 originally assumed —
 *    applied to the group going forward and to the already-seeded round.
 *  - "Agnes" (a mid-round draft name for the #4 slot, 30 May) and
 *    "Skiner"/"Skinner" both resolve to the already-seeded member Skina.
 *  - The MGR feature has no per-member "who paid into this cycle" table
 *    (see lib/domain/mgr.ts / app/(dashboard)/mgr/actions.ts — only the
 *    pool total on mgr_cycles and the payout on mgr_slots are tracked), so
 *    this does not fabricate 81 individual contribution rows; it records
 *    each cycle's pool total and each slot's payout, same granularity the
 *    app itself uses.
 *  - Which of the two "Flo"s held slot 3 vs slot 6 is not distinguishable
 *    from the chat (both just say "Flo") — arbitrarily assigned Flo
 *    (secretary) to slot 3 and Flo aishoya to slot 6.
 *
 * Safe to re-run: skips entirely if cycle 1 already exists for the group.
 */
import { fileURLToPath } from "url";
import { sql, eq, and } from "drizzle-orm";
import { pool } from "../lib/db/client";
import { withPlatformAdmin } from "../lib/db/rls";
import {
  groups,
  members,
  mgrCycles,
  mgrSlots,
  mgrMemberTurns,
  mgrSlotEvents,
} from "../lib/db/schema";

const GROUP_NAME = "GreatMinds";
const CONTRIBUTION_AMOUNT = 520;
const RENUMBER_SHIFT = 9; // existing cycles 1-9 -> 10-18

type Round1Entry = { memberName: string; date: string };

const ROUND1: Round1Entry[] = [
  { memberName: "Vivian", date: "2026-04-15" },
  { memberName: "Treazer", date: "2026-04-30" },
  { memberName: "Flo", date: "2026-05-15" },
  { memberName: "Skina", date: "2026-05-30" }, // "Agnes" / "Skiner" in the chat
  { memberName: "Bill", date: "2026-06-15" },
  { memberName: "Flo aishoya", date: "2026-06-30" },
  { memberName: "Mitchel", date: "2026-07-15" },
  { memberName: "Sylvia", date: "2026-07-30" },
  { memberName: "Mercy", date: "2026-08-15" },
];

export async function backfillRound1(): Promise<{ done: boolean; reason?: string }> {
  const group = await withPlatformAdmin((tx) =>
    tx.query.groups.findFirst({ where: eq(groups.name, GROUP_NAME) }),
  );
  if (!group) return { done: false, reason: `No group named "${GROUP_NAME}" — run seed-greatminds.ts first` };

  // Checks the specific backfilled cycle, not just "cycle 1 exists" — the
  // original seed already creates a cycle 1 (the round this backfill
  // renumbers to 10), so that alone isn't a valid idempotency signal.
  const alreadyDone = await withPlatformAdmin((tx) =>
    tx.query.mgrCycles.findFirst({
      where: and(
        eq(mgrCycles.groupId, group.id),
        eq(mgrCycles.cycleNumber, 1),
        eq(mgrCycles.scheduledDate, ROUND1[0].date),
      ),
    }),
  );
  if (alreadyDone) return { done: false, reason: "Round 1 backfill already ran" };

  const memberRows = await withPlatformAdmin((tx) =>
    tx.query.members.findMany({ where: eq(members.groupId, group.id) }),
  );
  const memberByName = new Map(memberRows.map((m) => [m.name, m]));
  for (const entry of ROUND1) {
    if (!memberByName.has(entry.memberName)) {
      throw new Error(`Round 1 references unknown member "${entry.memberName}"`);
    }
  }

  const poolTotal = CONTRIBUTION_AMOUNT * memberRows.length;

  await withPlatformAdmin(async (tx) => {
    // Correct the group's contribution figure going forward.
    await tx
      .update(groups)
      .set({ mgrContributionAmount: String(CONTRIBUTION_AMOUNT) })
      .where(eq(groups.id, group.id));

    // Shift the already-seeded round (1-9 -> 10-18) via a safe two-step
    // offset so the unique (group_id, cycle_number[, slot_number])
    // constraints never see a collision mid-statement.
    const OFFSET = 1000;
    await tx
      .update(mgrCycles)
      .set({ cycleNumber: sql`${mgrCycles.cycleNumber} + ${OFFSET}` })
      .where(eq(mgrCycles.groupId, group.id));
    await tx
      .update(mgrSlots)
      .set({ cycleNumber: sql`${mgrSlots.cycleNumber} + ${OFFSET}` })
      .where(eq(mgrSlots.groupId, group.id));
    await tx
      .update(mgrCycles)
      .set({ cycleNumber: sql`${mgrCycles.cycleNumber} - ${OFFSET - RENUMBER_SHIFT}` })
      .where(eq(mgrCycles.groupId, group.id));
    await tx
      .update(mgrSlots)
      .set({ cycleNumber: sql`${mgrSlots.cycleNumber} - ${OFFSET - RENUMBER_SHIFT}` })
      .where(eq(mgrSlots.groupId, group.id));

    // Recompute the shifted round's pool/payout at the corrected amount.
    await tx
      .update(mgrCycles)
      .set({ payoutPerSlot: String(poolTotal), totalContributions: String(poolTotal) })
      .where(eq(mgrCycles.groupId, group.id));
    await tx
      .update(mgrSlots)
      .set({ payoutAmount: String(poolTotal) })
      .where(eq(mgrSlots.groupId, group.id));

    // Each of the 9 members now has (or will have) two turns total: one in
    // round 1 (backfilled here) and one in round 2 (already seeded).
    for (const m of memberRows) {
      await tx
        .update(mgrMemberTurns)
        .set({ turnsTotal: 2 })
        .where(and(eq(mgrMemberTurns.groupId, group.id), eq(mgrMemberTurns.memberId, m.id)));
    }

    // Insert round 1 as completed cycles 1-9, each with its sole slot
    // already paid out to that cycle's recipient.
    for (let i = 0; i < ROUND1.length; i++) {
      const entry = ROUND1[i];
      const cycleNumber = i + 1;
      const member = memberByName.get(entry.memberName)!;

      const [cycle] = await tx
        .insert(mgrCycles)
        .values({
          groupId: group.id,
          cycleNumber,
          status: "completed",
          scheduledDate: entry.date,
          slotCount: 1,
          payoutPerSlot: String(poolTotal),
          totalContributions: String(poolTotal),
        })
        .returning();

      const [slot] = await tx
        .insert(mgrSlots)
        .values({
          groupId: group.id,
          cycleId: cycle.id,
          cycleNumber,
          slotNumber: 1,
          memberId: member.id,
          status: "paid",
          payoutAmount: String(poolTotal),
          scheduledDate: entry.date,
          claimedAt: new Date(`${entry.date}T00:00:00Z`),
          paidAt: new Date(`${entry.date}T00:00:00Z`),
        })
        .returning();

      await tx.insert(mgrSlotEvents).values({
        groupId: group.id,
        slotId: slot.id,
        actorUserId: null,
        actorRole: null,
        action: "backfill_paid",
        fromStatus: "open",
        toStatus: "paid",
        toMemberId: member.id,
        note: "Reconstructed from group WhatsApp history at backfill time",
      });
    }
  });

  return { done: true };
}

async function main() {
  const result = await backfillRound1();
  if (result.done) {
    console.log("Backfilled GreatMinds round 1 (cycles 1-9) and renumbered round 2 to 10-18.");
    console.log(`Contribution amount corrected to ${CONTRIBUTION_AMOUNT} KES/cycle.`);
  } else {
    console.log(`Skipped: ${result.reason}`);
  }
}

const isMainModule =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  main()
    .catch((err) => {
      console.error("Backfill failed:", err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
