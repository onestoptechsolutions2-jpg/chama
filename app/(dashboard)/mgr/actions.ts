"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNotNull, ne, notInArray, sql } from "drizzle-orm";
import { requireProduct } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import {
  groups,
  members,
  mgrCycles,
  mgrSlots,
  mgrMemberTurns,
  mgrAgreements,
  mgrSlotEvents,
  platformPayments,
  groupWallets,
  walletTransactions,
} from "@/lib/db/schema";
import type { Session } from "@/lib/auth/session";
import type { Tx } from "@/lib/db/rls";
import {
  updateMgrConfigSchema,
  setTurnsSchema,
  signAgreementSchema,
} from "@/lib/validation/mgr";
import { generateMgrSchedule, buildAutoAssignQueue } from "@/lib/domain/mgr";
import { calcPlatformFee } from "@/lib/domain/payments";

export type MgrActionState = { error: string } | null;

const CLAIMED_STATUSES = ["claimed", "auto_assigned", "paid"] as const;

type SlotStatus = (typeof mgrSlots.$inferSelect)["status"];

/**
 * Every claim/reassignment/paid-marking/skip on an MGR slot gets one of
 * these — an immutable record (see drizzle/0021_phase7_mgr_slot_events_rls.sql,
 * no UPDATE/DELETE policy exists for mgr_slot_events at all) of who did it
 * and when. The app itself can't verify a payout actually happened — that
 * money moves outside it — but it can make sure nobody can quietly deny or
 * rewrite who claimed to have made it happen.
 */
async function logSlotEvent(
  tx: Tx,
  params: {
    groupId: number;
    slotId: number;
    session: Session;
    action: string;
    fromStatus?: SlotStatus | null;
    toStatus?: SlotStatus | null;
    fromMemberId?: number | null;
    toMemberId?: number | null;
    note?: string | null;
  },
): Promise<void> {
  await tx.insert(mgrSlotEvents).values({
    groupId: params.groupId,
    slotId: params.slotId,
    actorUserId: params.session.user.id,
    actorRole: params.session.activeMembership?.role ?? null,
    action: params.action,
    fromStatus: params.fromStatus ?? null,
    toStatus: params.toStatus ?? null,
    fromMemberId: params.fromMemberId ?? null,
    toMemberId: params.toMemberId ?? null,
    note: params.note ?? null,
  });
}

// ── Config ───────────────────────────────────────────────────────────────
export async function updateMgrConfigAction(
  _prev: MgrActionState,
  formData: FormData,
): Promise<MgrActionState> {
  const session = await requireProduct("mgr", "admin", "treasurer");
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
  const session = await requireProduct("mgr");
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
  const session = await requireProduct("mgr", "admin", "treasurer");
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
  const session = await requireProduct("mgr");
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

    await logSlotEvent(tx, {
      groupId,
      slotId,
      session,
      action: "claimed",
      fromStatus: slot.status,
      toStatus: "claimed",
      fromMemberId: slot.memberId,
      toMemberId: memberId,
    });

    return { ok: true };
  });

  if ("error" in result) return { error: result.error };
  revalidatePath("/mgr");
  return null;
}

// ── Admin slot management ───────────────────────────────────────────────
export async function adminUpdateSlotAction(
  slotId: number,
  data: {
    memberId?: number | null;
    status?: SlotStatus;
    payoutReference?: string | null;
    note?: string | null;
  },
): Promise<void> {
  const session = await requireProduct("mgr", "admin", "treasurer");
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, async (tx) => {
    const [slot] = await tx
      .select()
      .from(mgrSlots)
      .where(and(eq(mgrSlots.id, slotId), eq(mgrSlots.groupId, groupId)))
      .for("update");
    if (!slot) return;

    const set: Record<string, unknown> = {};
    if (data.memberId !== undefined) set.memberId = data.memberId;
    if (data.status !== undefined) {
      set.status = data.status;
      if (data.status === "paid") set.paidAt = new Date();
    }
    if (data.payoutReference !== undefined) set.payoutReference = data.payoutReference || null;
    if (Object.keys(set).length === 0) return;

    await tx.update(mgrSlots).set(set).where(eq(mgrSlots.id, slotId));

    await logSlotEvent(tx, {
      groupId,
      slotId,
      session,
      action: data.status === "paid" ? "marked_paid" : "admin_updated",
      fromStatus: slot.status,
      toStatus: (data.status as SlotStatus | undefined) ?? slot.status,
      fromMemberId: slot.memberId,
      toMemberId: data.memberId !== undefined ? data.memberId : slot.memberId,
      note: data.payoutReference
        ? `payout reference: ${data.payoutReference}${data.note ? ` — ${data.note}` : ""}`
        : data.note ?? null,
    });
  });

  revalidatePath("/mgr");
}

/**
 * The wallet-first half of "Charge platform fee" — deducts straight from
 * the group's prepaid wallet balance with no phone number or STK push, and
 * marks the payment paid immediately (there's no async M-Pesa confirmation
 * to wait for, unlike the STK-push fallback in
 * /api/payments/platform-fee). Rejects with an error if the balance doesn't
 * cover the fee; the UI falls back to the existing phone/STK flow in that case.
 */
export async function chargeFeeFromWalletAction(
  mgrSlotId: number,
): Promise<{ error: string } | { ok: true; fee: number }> {
  const session = await requireProduct("mgr", "admin", "treasurer");
  const groupId = session.activeMembership.groupId;

  const result = await withTenant(groupId, async (tx) => {
    const slot = await tx.query.mgrSlots.findFirst({
      where: and(eq(mgrSlots.id, mgrSlotId), eq(mgrSlots.groupId, groupId)),
    });
    if (!slot || !slot.payoutAmount) return { error: "Slot not found" as const };

    const group = await tx.query.groups.findFirst({ where: eq(groups.id, groupId) });
    if (!group) return { error: "Group not found" as const };

    const feePct = Number(group.mgrFeePct);
    const fee = calcPlatformFee(Number(slot.payoutAmount), feePct);

    const [wallet] = await tx
      .select()
      .from(groupWallets)
      .where(eq(groupWallets.groupId, groupId))
      .for("update");
    if (!wallet || Number(wallet.balance) < fee) {
      return { error: "Insufficient wallet balance" as const };
    }

    const [payment] = await tx
      .insert(platformPayments)
      .values({
        groupId,
        mgrSlotId,
        amount: String(fee),
        feePct: String(feePct),
        status: "paid",
        type: "mgr_fee",
      })
      .returning();

    const [updatedWallet] = await tx
      .update(groupWallets)
      .set({ balance: sql`${groupWallets.balance} - ${fee}`, updatedAt: new Date() })
      .where(eq(groupWallets.groupId, groupId))
      .returning();

    await tx.insert(walletTransactions).values({
      groupId,
      type: "fee_deduction",
      amount: String(fee),
      balanceAfter: updatedWallet.balance,
      relatedPaymentId: payment.id,
      note: `MGR platform fee — slot #${mgrSlotId}`,
    });

    return { ok: true as const, fee };
  });

  if ("ok" in result) {
    revalidatePath("/mgr");
    revalidatePath("/wallet");
  }
  return result;
}

export async function autoAssignAction(): Promise<{ assigned: number }> {
  const session = await requireProduct("mgr", "admin", "treasurer");
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
      await logSlotEvent(tx, {
        groupId,
        slotId: slot.id,
        session,
        action: "auto_assigned",
        fromStatus: slot.status,
        toStatus: "auto_assigned",
        fromMemberId: slot.memberId,
        toMemberId: nextMemberId,
      });
      count++;
    }
    return count;
  });

  revalidatePath("/mgr");
  return { assigned };
}

// ── Cycles ───────────────────────────────────────────────────────────────
export async function createCycleAction(scheduledDate?: string): Promise<void> {
  const session = await requireProduct("mgr", "admin", "treasurer");
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
  const session = await requireProduct("mgr", "admin", "treasurer");
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
  const session = await requireProduct("mgr");
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
