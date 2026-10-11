import { and, eq, inArray } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import type { MembershipRole } from "@/lib/auth/session";
import { mgrSlots, mgrMemberTurns, mgrSlotEvents } from "@/lib/db/schema";

/**
 * When a member leaves the group mid-rotation: take them out of the draw
 * queue and hand back any turn they hold but haven't been paid for, so it
 * can be filled by someone else. Turns already paid or skipped are history
 * and are left alone. Each released turn is written to the permanent
 * activity log.
 */
export async function releaseMemberFromRotation(
  tx: Tx,
  groupId: number,
  memberId: number,
  actor: { userId: number; role: MembershipRole | null },
): Promise<number> {
  await tx
    .update(mgrMemberTurns)
    .set({ active: false })
    .where(and(eq(mgrMemberTurns.groupId, groupId), eq(mgrMemberTurns.memberId, memberId)));

  const owed = await tx.query.mgrSlots.findMany({
    where: and(
      eq(mgrSlots.groupId, groupId),
      eq(mgrSlots.memberId, memberId),
      inArray(mgrSlots.status, ["claimed", "auto_assigned"]),
    ),
  });

  for (const slot of owed) {
    await tx
      .update(mgrSlots)
      .set({ memberId: null, status: "open", claimedAt: null })
      .where(eq(mgrSlots.id, slot.id));
    await tx.insert(mgrSlotEvents).values({
      groupId,
      slotId: slot.id,
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: "member_left",
      fromStatus: slot.status,
      toStatus: "open",
      fromMemberId: memberId,
      toMemberId: null,
      note: "member left the group; turn is open again",
    });
  }
  return owed.length;
}
