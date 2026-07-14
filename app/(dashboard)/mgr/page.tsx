import { and, eq } from "drizzle-orm";
import { requireActiveGroup } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import {
  groups,
  mgrCycles,
  mgrSlots,
  mgrMemberTurns,
  mgrAgreements,
  members,
  mgrSlotEvents,
} from "@/lib/db/schema";
import { PageHeader } from "@/components/feature/page-header";
import { MgrManager } from "@/components/feature/mgr-manager";
import { MgrAgreementGate } from "@/components/feature/mgr-agreement-gate";

const CLAIMED_STATUSES = ["claimed", "auto_assigned", "paid"] as const;

export default async function MgrPage() {
  const session = await requireActiveGroup();
  const groupId = session.activeMembership.groupId;
  const isStaff = ["admin", "treasurer"].includes(session.activeMembership.role);

  const { group, cycles, slots, turns, groupMembers, activeCycle, agreement, slotEvents } =
    await withTenant(groupId, async (tx) => {
      const group = await tx.query.groups.findFirst({ where: eq(groups.id, groupId) });

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
      const takenByMember = new Map<number, number>();
      for (const s of slots) {
        if (s.memberId && CLAIMED_STATUSES.includes(s.status as (typeof CLAIMED_STATUSES)[number])) {
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

      const agreement = activeCycle
        ? await tx.query.mgrAgreements.findFirst({
            where: and(
              eq(mgrAgreements.cycleId, activeCycle.id),
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

      return { group, cycles, slots, turns, groupMembers, activeCycle, agreement, slotEvents };
    });

  if (!group) return null;

  const cyclesWithSlots = cycles.map((c) => ({
    ...c,
    slots: slots.filter((s) => s.cycleNumber === c.cycleNumber),
  }));

  const needsAgreement = !!activeCycle && !agreement;

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
          mgrContributionAmount: group.mgrContributionAmount,
          sharePrice: group.sharePrice,
        }}
        cycles={cyclesWithSlots}
        turns={turns}
        members={groupMembers}
        isStaff={isStaff}
        myMemberId={session.activeMembership.memberId}
        blockedByAgreement={needsAgreement}
        slotEvents={slotEvents}
      />
    </div>
  );
}
