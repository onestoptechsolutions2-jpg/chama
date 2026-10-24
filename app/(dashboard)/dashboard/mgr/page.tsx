import { and, eq, inArray } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { withTenant } from "@/lib/db/rls";
import {
  groups,
  mgrCycles,
  mgrRotations,
  mgrSlots,
  mgrMemberTurns,
  mgrAgreements,
  members,
  mgrSlotEvents,
  groupWallets,
} from "@/lib/db/schema";
import { PageHeader } from "@/components/feature/page-header";
import { MgrManager } from "@/components/feature/mgr-manager";
import { MgrAgreementGate } from "@/components/feature/mgr-agreement-gate";
import { choicesAreOpen, nairobiToday, suggestRotationStart } from "@/lib/domain/mgr";

const CLAIMED_STATUSES = ["claimed", "auto_assigned", "paid"] as const;

export default async function MgrPage() {
  const session = await requirePermission("mgr.use");
  const groupId = session.activeMembership.groupId;
  const isStaff = can(session.activeMembership, "mgr.manage");

  const { group, rotations, cycles, slots, turns, groupMembers, activeCycle, agreement, slotEvents, wallet } =
    await withTenant(groupId, async (tx) => {
      const group = await tx.query.groups.findFirst({ where: eq(groups.id, groupId) });

      const rotations = await tx.query.mgrRotations.findMany({
        where: eq(mgrRotations.groupId, groupId),
        orderBy: (r, { desc }) => [desc(r.number)],
      });
      const live = rotations.find((r) => r.status === "active");

      const cycles = await tx.query.mgrCycles.findMany({
        where: eq(mgrCycles.groupId, groupId),
        orderBy: (c, { asc }) => [asc(c.cycleNumber)],
      });

      const slots = await tx.query.mgrSlots.findMany({
        where: eq(mgrSlots.groupId, groupId),
        with: { member: true },
        orderBy: (s, { asc }) => [asc(s.cycleNumber), asc(s.slotNumber)],
      });

      const turnRows = await tx.query.mgrMemberTurns.findMany({
        where: eq(mgrMemberTurns.groupId, groupId),
        with: { member: true },
      });
      // Turns are counted within the live rotation only.
      const takenByMember = new Map<number, number>();
      for (const s of slots) {
        if (s.rotationId === live?.id && s.memberId && CLAIMED_STATUSES.includes(s.status as (typeof CLAIMED_STATUSES)[number])) {
          takenByMember.set(s.memberId, (takenByMember.get(s.memberId) ?? 0) + 1);
        }
      }
      const turns = turnRows.map((t) => ({ ...t, slotsTaken: takenByMember.get(t.memberId) ?? 0 }));

      const groupMembers = await tx.query.members.findMany({
        where: and(eq(members.groupId, groupId), eq(members.active, true)),
        orderBy: (m, { asc }) => [asc(m.name)],
      });

      const activeCycle = await tx.query.mgrCycles.findFirst({
        where: and(eq(mgrCycles.groupId, groupId), eq(mgrCycles.status, "active")),
      });

      // One signature per rotation: its terms (contribution, payout) are fixed
      // for the whole rotation, so signing for any of its cycles counts.
      const rotationCycleIds = activeCycle
        ? cycles.filter((c) => c.rotationId === activeCycle.rotationId).map((c) => c.id)
        : [];
      const agreement = rotationCycleIds.length
        ? await tx.query.mgrAgreements.findFirst({
            where: and(
              inArray(mgrAgreements.cycleId, rotationCycleIds),
              eq(mgrAgreements.userId, session.user.id),
            ),
          })
        : null;

      // Staff-only: the immutable audit trail (see mgr/actions.ts's
      // logSlotEvent). Members don't need to see this, only who's
      // accountable for claims/reassignments/paid-marking.
      const slotEvents = isStaff
        ? await tx.query.mgrSlotEvents.findMany({
            where: eq(mgrSlotEvents.groupId, groupId),
            with: { actor: true },
            orderBy: (e, { desc }) => [desc(e.createdAt)],
            limit: 100,
          })
        : [];

      // Staff-only, same reasoning as slotEvents above — only staff see
      // ChargeFeeDialog, which is the only consumer of this.
      const wallet = isStaff
        ? await tx.query.groupWallets.findFirst({ where: eq(groupWallets.groupId, groupId) })
        : null;

      return { group, rotations, cycles, slots, turns, groupMembers, activeCycle, agreement, slotEvents, wallet };
    });

  if (!group) return null;

  const cyclesWithSlots = cycles.map((c) => ({
    ...c,
    slots: slots.filter((s) => s.cycleNumber === c.cycleNumber),
  }));

  const needsAgreement = !!activeCycle && !agreement;
  const today = nairobiToday();
  const choicesOpen = choicesAreOpen(group.mgrChoicesCloseDate, today);
  const live = rotations.find((r) => r.status === "active") ?? null;
  const previous = rotations.find((r) => r.status === "archived") ?? null;
  const rotationViews = rotations.map((r) => {
    const own = cyclesWithSlots.filter((c) => c.rotationId === r.id);
    return {
      id: r.id,
      number: r.number,
      status: r.status,
      startDate: r.startDate,
      endDate: r.endDate,
      frequency: r.frequency,
      recipientsPerCycle: r.recipientsPerCycle,
      contributionAmount: r.contributionAmount,
      started: own.some((c) => c.status === "completed" || c.slots.some((s) => s.status === "paid" || s.status === "skipped")),
      finished: own.length > 0 && own.every((c) => c.status === "completed"),
      paidOut: own.flatMap((c) => c.slots).filter((s) => s.status === "paid").reduce((sum, s) => sum + Number(s.payoutAmount ?? 0), 0),
    };
  });
  // Turns everyone holds right now — the next rotation's size, for the end-date preview.
  const totalTurns = turns.filter((t) => t.active).reduce((sum, t) => sum + t.turnsTotal, 0) || groupMembers.length;

  return (
    <div className="space-y-6">
      <PageHeader title="Merry-Go-Round" description="Rotation schedule, turns, and payouts." />
      {needsAgreement && activeCycle && (
        <MgrAgreementGate cycleId={activeCycle.id} platformTerms={group.platformTerms} groupTerms={group.mgrTerms} />
      )}
      <MgrManager
        config={{
          mgrFrequency: group.mgrFrequency,
          mgrRecipientsPerCycle: group.mgrRecipientsPerCycle,
          mgrStartDate: group.mgrStartDate,
          mgrChoicesCloseDate: group.mgrChoicesCloseDate,
          mgrContributionAmount: group.mgrContributionAmount,
          sharePrice: group.sharePrice,
          mgrFeePct: group.mgrFeePct,
        }}
        cycles={cyclesWithSlots}
        rotations={rotationViews}
        liveRotationId={live?.id ?? null}
        suggestedStart={live ? null : suggestRotationStart({ configuredStart: group.mgrStartDate, previous, today })}
        totalTurns={totalTurns}
        today={today}
        turns={turns}
        members={groupMembers}
        isStaff={isStaff}
        myMemberId={session.activeMembership.memberId}
        blockedByAgreement={needsAgreement}
        slotEvents={slotEvents}
        walletBalance={wallet?.balance ?? "0"}
        choicesOpen={choicesOpen}
      />
    </div>
  );
}
