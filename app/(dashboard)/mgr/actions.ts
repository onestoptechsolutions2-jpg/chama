"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNotNull, ne, notInArray, sql } from "drizzle-orm";
import { requireActiveGroup, requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { groups, members, mgrCycles, mgrSlots, mgrMemberTurns, mgrAgreements } from "@/lib/db/schema";
import {
  updateMgrConfigSchema,
  setTurnsSchema,
  signAgreementSchema,
} from "@/lib/validation/mgr";
import { generateMgrSchedule, buildAutoAssignQueue } from "@/lib/domain/mgr";

export type MgrActionState = { error: string } | null;

const CLAIMED_STATUSES = ["claimed", "auto_assigned", "paid"] as const;

// ── Config ───────────────────────────────────────────────────────────────
export async function updateMgrConfigAction(
  _prev: MgrActionState,
  formData: FormData,
): Promise<MgrActionState> {
  const session = await requireRole("admin", "treasurer");
  const parsed = updateMgrConfigSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { mgrFrequency, mgrRecipientsPerCycle, mgrStartDate, mgrContributionAmount } =
    parsed.data;
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, (tx) =>
    tx
      .update(groups)
      .set({
        mgrFrequency,
        mgrRecipientsPerCycle,
        mgrStartDate: mgrStartDate || null,
        mgrContributionAmount:
          mgrContributionAmount !== undefined ? String(mgrContributionAmount) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(groups.id, groupId)),
  );

  revalidatePath("/mgr");
  return null;
}

// ── Member turns ─────────────────────────────────────────────────────────
export async function setTurnsAction(
  _prev: MgrActionState,
  formData: FormData,
): Promise<MgrActionState> {
  const session = await requireActiveGroup();
  const parsed = setTurnsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { memberId, turnsTotal } = parsed.data;
  const groupId = session.activeMembership.groupId;
  const isStaff = ["admin", "treasurer"].includes(session.activeMembership.role);

  if (!isStaff && session.activeMembership.memberId !== memberId) {
    return { error: "You can only update your own turns" };
  }

  await withTenant(groupId, (tx) =>
    tx
      .insert(mgrMemberTurns)
      .values({
        groupId,
        memberId,
        turnsTotal,
        contributionMultiplier: String(turnsTotal),
      })
      .onConflictDoUpdate({
        target: [mgrMemberTurns.groupId, mgrMemberTurns.memberId],
        set: { turnsTotal, contributionMultiplier: String(turnsTotal), updatedAt: new Date() },
      }),
  );

  revalidatePath("/mgr");
  return null;
}

// ── Schedule generation ──────────────────────────────────────────────────
export async function generateScheduleAction(): Promise<MgrActionState> {
  const session = await requireRole("admin", "treasurer");
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, async (tx) => {
    const group = await tx.query.groups.findFirst({ where: eq(groups.id, groupId) });
    if (!group) return;

    const baseContribution = Number(group.mgrContributionAmount ?? group.sharePrice);
    const startDate = group.mgrStartDate ? new Date(group.mgrStartDate) : new Date();

    const activeMembers = await tx.query.members.findMany({
      where: and(eq(members.groupId, groupId), eq(members.active, true)),
      orderBy: (m, { asc }) => [asc(m.joinedDate), asc(m.id)],
    });
    if (activeMembers.length === 0) return;

    const existingTurns = await tx.query.mgrMemberTurns.findMany({
      where: eq(mgrMemberTurns.groupId, groupId),
    });
    const turnsByMember = new Map(existingTurns.map((t) => [t.memberId, t]));

    // Ensure a turn record exists for every active member (default: 1 turn).
    for (const m of activeMembers) {
      if (!turnsByMember.has(m.id)) {
        await tx
          .insert(mgrMemberTurns)
          .values({ groupId, memberId: m.id, turnsTotal: 1, contributionMultiplier: "1" })
          .onConflictDoNothing();
      }
    }

    const memberInputs = activeMembers.map((m) => {
      const t = turnsByMember.get(m.id);
      return {
        memberId: m.id,
        turnsTotal: t?.turnsTotal ?? 1,
        multiplier: t ? Number(t.contributionMultiplier) : 1,
      };
    });

    const schedule = generateMgrSchedule({
      frequency: group.mgrFrequency,
      recipientsPerCycle: group.mgrRecipientsPerCycle ?? 1,
      baseContribution,
      startDate,
      members: memberInputs,
    });

    // Remove not-yet-claimed slots and the now-empty planned cycles they
    // belonged to — claimed/auto_assigned/paid/skipped slots are left
    // untouched so regenerating the schedule never discards a real claim.
    await tx.delete(mgrSlots).where(and(eq(mgrSlots.groupId, groupId), eq(mgrSlots.status, "open")));

    const remainingCycleIds = await tx
      .select({ id: mgrSlots.cycleId })
      .from(mgrSlots)
      .where(and(eq(mgrSlots.groupId, groupId), isNotNull(mgrSlots.cycleId)));
    const keepIds = remainingCycleIds.map((r) => r.id!).filter(Boolean);
    await tx.delete(mgrCycles).where(
      keepIds.length > 0
        ? and(eq(mgrCycles.groupId, groupId), eq(mgrCycles.status, "planned"), notInArray(mgrCycles.id, keepIds))
        : and(eq(mgrCycles.groupId, groupId), eq(mgrCycles.status, "planned")),
    );

    const hasActiveCycle = await tx.query.mgrCycles.findFirst({
      where: and(eq(mgrCycles.groupId, groupId), eq(mgrCycles.status, "active")),
    });

    for (const cycle of schedule.cycles) {
      const [cycleRow] = await tx
        .insert(mgrCycles)
        .values({
          groupId,
          cycleNumber: cycle.cycleNumber,
          status: !hasActiveCycle && cycle.cycleNumber === 1 ? "active" : "planned",
          scheduledDate: cycle.scheduledDate,
          slotCount: cycle.slotCount,
          payoutPerSlot: String(cycle.payoutPerSlot),
          totalContributions: String(cycle.totalContributions),
        })
        .onConflictDoUpdate({
          target: [mgrCycles.groupId, mgrCycles.cycleNumber],
          set: {
            scheduledDate: cycle.scheduledDate,
            slotCount: cycle.slotCount,
            payoutPerSlot: String(cycle.payoutPerSlot),
            totalContributions: String(cycle.totalContributions),
            updatedAt: new Date(),
          },
        })
        .returning();

      for (const slot of cycle.slots) {
        await tx
          .insert(mgrSlots)
          .values({
            groupId,
            cycleId: cycleRow.id,
            cycleNumber: cycle.cycleNumber,
            slotNumber: slot.slotNumber,
            status: "open",
            payoutAmount: String(cycle.payoutPerSlot),
            scheduledDate: cycle.scheduledDate,
          })
          .onConflictDoUpdate({
            target: [mgrSlots.groupId, mgrSlots.cycleNumber, mgrSlots.slotNumber],
            set: {
              cycleId: cycleRow.id,
              payoutAmount: String(cycle.payoutPerSlot),
              scheduledDate: cycle.scheduledDate,
            },
          });
      }
    }
  });

  revalidatePath("/mgr");
  return null;
}

// ── Slot claiming (member) ──────────────────────────────────────────────
export async function claimSlotAction(slotId: number): Promise<MgrActionState> {
  const session = await requireActiveGroup();
  const memberId = session.activeMembership.memberId;
  if (!memberId) return { error: "No member profile linked to your account" };
  const groupId = session.activeMembership.groupId;

  const result = await withTenant(groupId, async (tx): Promise<{ error: string } | { ok: true }> => {
    const [slot] = await tx
      .select()
      .from(mgrSlots)
      .where(and(eq(mgrSlots.id, slotId), eq(mgrSlots.groupId, groupId)))
      .for("update");
    if (!slot) return { error: "Slot not found" };
    if (slot.status !== "open") return { error: `Slot is already ${slot.status}` };

    const turns = await tx.query.mgrMemberTurns.findFirst({
      where: and(eq(mgrMemberTurns.groupId, groupId), eq(mgrMemberTurns.memberId, memberId)),
    });
    const maxTurns = turns?.turnsTotal ?? 1;

    const [{ taken }] = await tx
      .select({ taken: sql<number>`count(*)::int` })
      .from(mgrSlots)
      .where(
        and(
          eq(mgrSlots.groupId, groupId),
          eq(mgrSlots.memberId, memberId),
          inArray(mgrSlots.status, CLAIMED_STATUSES),
        ),
      );
    if (taken >= maxTurns) {
      return { error: `You have used all ${maxTurns} of your turns` };
    }

    await tx
      .update(mgrSlots)
      .set({ memberId, status: "claimed", claimedAt: new Date() })
      .where(eq(mgrSlots.id, slotId));

    return { ok: true };
  });

  if ("error" in result) return { error: result.error };
  revalidatePath("/mgr");
  return null;
}

// ── Admin slot management ───────────────────────────────────────────────
export async function adminUpdateSlotAction(
  slotId: number,
  data: { memberId?: number | null; status?: string },
): Promise<void> {
  const session = await requireRole("admin", "treasurer");
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, async (tx) => {
    const set: Record<string, unknown> = {};
    if (data.memberId !== undefined) set.memberId = data.memberId;
    if (data.status !== undefined) {
      set.status = data.status;
      if (data.status === "paid") set.paidAt = new Date();
    }
    if (Object.keys(set).length === 0) return;
    await tx
      .update(mgrSlots)
      .set(set)
      .where(and(eq(mgrSlots.id, slotId), eq(mgrSlots.groupId, groupId)));
  });

  revalidatePath("/mgr");
}

export async function autoAssignAction(): Promise<{ assigned: number }> {
  const session = await requireRole("admin", "treasurer");
  const groupId = session.activeMembership.groupId;

  const assigned = await withTenant(groupId, async (tx) => {
    const openSlots = await tx.query.mgrSlots.findMany({
      where: and(eq(mgrSlots.groupId, groupId), eq(mgrSlots.status, "open")),
      orderBy: (s, { asc }) => [asc(s.cycleNumber), asc(s.slotNumber)],
    });
    if (openSlots.length === 0) return 0;

    const allTurns = await tx.query.mgrMemberTurns.findMany({
      where: and(eq(mgrMemberTurns.groupId, groupId), eq(mgrMemberTurns.active, true)),
    });

    const takenCounts = await tx
      .select({ memberId: mgrSlots.memberId, taken: sql<number>`count(*)::int` })
      .from(mgrSlots)
      .where(and(eq(mgrSlots.groupId, groupId), inArray(mgrSlots.status, CLAIMED_STATUSES)))
      .groupBy(mgrSlots.memberId);
    const takenByMember = new Map(takenCounts.map((t) => [t.memberId, t.taken]));

    const queue = buildAutoAssignQueue(
      allTurns.map((t) => ({
        memberId: t.memberId,
        turnsTotal: t.turnsTotal,
        taken: takenByMember.get(t.memberId) ?? 0,
      })),
    );

    let count = 0;
    for (const slot of openSlots) {
      const nextMemberId = queue.shift();
      if (nextMemberId === undefined) break;
      await tx
        .update(mgrSlots)
        .set({ memberId: nextMemberId, status: "auto_assigned", claimedAt: new Date() })
        .where(eq(mgrSlots.id, slot.id));
      count++;
    }
    return count;
  });

  revalidatePath("/mgr");
  return { assigned };
}

// ── Cycles ───────────────────────────────────────────────────────────────
export async function createCycleAction(scheduledDate?: string): Promise<void> {
  const session = await requireRole("admin", "treasurer");
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, async (tx) => {
    const [last] = await tx
      .select({ max: sql<number>`coalesce(max(${mgrCycles.cycleNumber}), 0)` })
      .from(mgrCycles)
      .where(eq(mgrCycles.groupId, groupId));
    await tx.insert(mgrCycles).values({
      groupId,
      cycleNumber: (last?.max ?? 0) + 1,
      status: "planned",
      scheduledDate: scheduledDate || null,
    });
  });

  revalidatePath("/mgr");
}

/**
 * Closing the active cycle also activates the next planned cycle (by
 * cycleNumber) if one exists — the original app had no visible mechanism
 * for a cycle to ever become 'active' after the first (seed-bootstrapped)
 * one, which would have made the MGR agreement gate permanently stuck on
 * cycle 1. This keeps the rotation self-progressing.
 */
export async function closeCycleAction(cycleId: number): Promise<void> {
  const session = await requireRole("admin", "treasurer");
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, async (tx) => {
    const cycle = await tx.query.mgrCycles.findFirst({
      where: and(eq(mgrCycles.id, cycleId), eq(mgrCycles.groupId, groupId)),
    });
    if (!cycle) return;

    await tx
      .update(mgrCycles)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(mgrCycles.id, cycleId));

    const next = await tx.query.mgrCycles.findFirst({
      where: and(
        eq(mgrCycles.groupId, groupId),
        eq(mgrCycles.status, "planned"),
        ne(mgrCycles.id, cycleId),
      ),
      orderBy: (c, { asc }) => [asc(c.cycleNumber)],
    });
    if (next) {
      await tx
        .update(mgrCycles)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(mgrCycles.id, next.id));
    }
  });

  revalidatePath("/mgr");
}

// ── Agreement ────────────────────────────────────────────────────────────
export async function signAgreementAction(
  cycleId: number,
  _prev: MgrActionState,
  formData: FormData,
): Promise<MgrActionState> {
  const session = await requireActiveGroup();
  const parsed = signAgreementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "All four fields are required" };
  }
  const { digitalSignature } = parsed.data;
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, (tx) =>
    tx
      .insert(mgrAgreements)
      .values({
        groupId,
        userId: session.user.id,
        cycleId,
        platformTerms: true,
        groupTerms: true,
        financialAcknowledged: true,
        digitalSignature,
      })
      .onConflictDoUpdate({
        target: [mgrAgreements.userId, mgrAgreements.cycleId],
        set: {
          platformTerms: true,
          groupTerms: true,
          financialAcknowledged: true,
          digitalSignature,
          signedAt: new Date(),
        },
      }),
  );

  revalidatePath("/mgr");
  return null;
}
