"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gt, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
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
import {
  generateMgrSchedule,
  buildAutoAssignQueue,
  cycleCloseBlocker,
  assignByPreferences,
} from "@/lib/domain/mgr";
import { calcPlatformFee } from "@/lib/domain/payments";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatch";
import { insertNotification, listActiveStaffUserIds } from "@/lib/db/notifications";
import { buildMgrNotification } from "@/lib/domain/notifications";

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

  revalidatePath("/dashboard/mgr");
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

  revalidatePath("/dashboard/mgr");
  return null;
}

/**
 * Archived ("closed") cycles are earlier rotations. A new rotation continues
 * numbering after them, and everything that counts turns only looks at
 * cycles numbered above this, so an old rotation never uses up anyone's turns.
 */
async function rotationBase(tx: Tx, groupId: number): Promise<number> {
  const [row] = await tx
    .select({ base: sql<number>`coalesce(max(${mgrCycles.cycleNumber}), 0)::int` })
    .from(mgrCycles)
    .where(and(eq(mgrCycles.groupId, groupId), eq(mgrCycles.status, "closed")));
  return row?.base ?? 0;
}

// ── Schedule generation ──────────────────────────────────────────────────
export async function generateScheduleAction(): Promise<MgrActionState> {
  const session = await requireProduct("mgr", "admin", "treasurer");
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, async (tx) => {
    const group = await tx.query.groups.findFirst({ where: eq(groups.id, groupId) });
    if (!group) return;
    const base = await rotationBase(tx, groupId);

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
    await tx.delete(mgrSlots).where(and(eq(mgrSlots.groupId, groupId), eq(mgrSlots.status, "open"), gt(mgrSlots.cycleNumber, base)));

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
          cycleNumber: base + cycle.cycleNumber,
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
            cycleNumber: base + cycle.cycleNumber,
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

  revalidatePath("/dashboard/mgr");
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
          gt(mgrSlots.cycleNumber, await rotationBase(tx, groupId)),
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
  revalidatePath("/dashboard/mgr");
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
): Promise<MgrActionState> {
  const session = await requireProduct("mgr", "admin", "treasurer");
  const groupId = session.activeMembership.groupId;

  let blocked: string | null = null;
  const paidEvent = await withTenant(groupId, async (tx) => {
    const [slot] = await tx
      .select()
      .from(mgrSlots)
      .where(and(eq(mgrSlots.id, slotId), eq(mgrSlots.groupId, groupId)))
      .for("update");
    if (!slot) return null;

    // A paid turn is a record of money that moved — it can't be handed to
    // someone else or un-paid. (Only the payout reference may be corrected.)
    const changesHistory =
      (data.memberId !== undefined && data.memberId !== slot.memberId) ||
      (data.status !== undefined && data.status !== slot.status);
    if (slot.status === "paid" && changesHistory) {
      blocked = "This turn is already paid and can't be changed.";
      return null;
    }

    const set: Record<string, unknown> = {};
    if (data.memberId !== undefined) set.memberId = data.memberId;
    if (data.status !== undefined) {
      set.status = data.status;
      if (data.status === "paid") set.paidAt = new Date();
    }
    if (data.payoutReference !== undefined) set.payoutReference = data.payoutReference || null;
    if (Object.keys(set).length === 0) return null;

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

    if (data.status === "paid" || data.status === "skipped") {
      await autoCloseCycleIfSettled(tx, groupId, slot.cycleId);
    }

    if (data.status !== "paid") return null;
    return {
      memberId: data.memberId !== undefined ? data.memberId : slot.memberId,
      payoutAmount: slot.payoutAmount,
      payoutReference: data.payoutReference ?? null,
    };
  });

  // Fired only after the transaction above has committed — see
  // lib/webhooks/dispatch.ts's own doc comment on why this must never be
  // called from inside the transaction it's reporting on.
  if (paidEvent) {
    void dispatchWebhookEvent(groupId, "mgr.slot.paid", { slotId, ...paidEvent });
  }

  revalidatePath("/dashboard/mgr");
  return blocked ? { error: blocked } : null;
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
    revalidatePath("/dashboard/mgr");
    revalidatePath("/dashboard/wallet");
  }
  return result;
}

/** `draw: true` shuffles who goes first within each round (a fair random draw); otherwise join order. */
export async function autoAssignAction(draw = false): Promise<{ assigned: number }> {
  const session = await requireProduct("mgr", "admin", "treasurer");
  const groupId = session.activeMembership.groupId;

  const assigned = await withTenant(groupId, async (tx) => {
    const base = await rotationBase(tx, groupId);
    const openSlots = await tx.query.mgrSlots.findMany({
      where: and(eq(mgrSlots.groupId, groupId), eq(mgrSlots.status, "open"), gt(mgrSlots.cycleNumber, base)),
      orderBy: (s, { asc }) => [asc(s.cycleNumber), asc(s.slotNumber)],
    });
    if (openSlots.length === 0) return 0;

    const allTurns = await tx.query.mgrMemberTurns.findMany({
      where: and(eq(mgrMemberTurns.groupId, groupId), eq(mgrMemberTurns.active, true)),
    });

    const takenCounts = await tx
      .select({ memberId: mgrSlots.memberId, taken: sql<number>`count(*)::int` })
      .from(mgrSlots)
      .where(
        and(
          eq(mgrSlots.groupId, groupId),
          inArray(mgrSlots.status, CLAIMED_STATUSES),
          gt(mgrSlots.cycleNumber, base),
        ),
      )
      .groupBy(mgrSlots.memberId);
    const takenByMember = new Map(takenCounts.map((t) => [t.memberId, t.taken]));

    const queue = buildAutoAssignQueue(
      allTurns.map((t) => ({
        memberId: t.memberId,
        turnsTotal: t.turnsTotal,
        taken: takenByMember.get(t.memberId) ?? 0,
      })),
      { shuffle: draw },
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
        note: draw ? "random draw" : null,
      });
      count++;
    }
    return count;
  });

  revalidatePath("/dashboard/mgr");
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

  revalidatePath("/dashboard/mgr");
}

/**
 * Closing the active cycle also activates the next planned cycle (by
 * cycleNumber) if one exists — the original app had no visible mechanism
 * for a cycle to ever become 'active' after the first (seed-bootstrapped)
 * one, which would have made the MGR agreement gate permanently stuck on
 * cycle 1. This keeps the rotation self-progressing.
 */
/** Marks the cycle completed and opens the next planned one (lowest number above it). */
async function completeCycleAndOpenNext(
  tx: Tx,
  groupId: number,
  cycle: { id: number; cycleNumber: number },
): Promise<{ id: number; cycleNumber: number } | null> {
  await tx
    .update(mgrCycles)
    .set({ status: "completed", updatedAt: new Date() })
    .where(eq(mgrCycles.id, cycle.id));

  const next = await tx.query.mgrCycles.findFirst({
    where: and(
      eq(mgrCycles.groupId, groupId),
      eq(mgrCycles.status, "planned"),
      gt(mgrCycles.cycleNumber, cycle.cycleNumber),
    ),
    orderBy: (c, { asc }) => [asc(c.cycleNumber)],
  });
  if (!next) return null;

  await tx
    .update(mgrCycles)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(mgrCycles.id, next.id));
  return next;
}

/**
 * Called after a slot is marked paid or skipped: once every slot in the
 * active cycle is settled, close it and open the next one automatically, and
 * tell the officials — nobody has to remember to press "Close cycle".
 */
async function autoCloseCycleIfSettled(tx: Tx, groupId: number, cycleId: number | null) {
  if (!cycleId) return;
  const cycle = await tx.query.mgrCycles.findFirst({
    where: and(eq(mgrCycles.id, cycleId), eq(mgrCycles.groupId, groupId)),
  });
  if (!cycle || cycle.status !== "active") return;

  const slots = await tx.query.mgrSlots.findMany({
    where: and(eq(mgrSlots.groupId, groupId), eq(mgrSlots.cycleId, cycleId)),
  });
  if (slots.length === 0 || cycleCloseBlocker(slots.map((s) => s.status))) return;

  const next = await completeCycleAndOpenNext(tx, groupId, cycle);

  const template = buildMgrNotification({
    type: "cycle_closed",
    cycleNumber: cycle.cycleNumber,
    nextCycleNumber: next?.cycleNumber ?? null,
  });
  for (const userId of await listActiveStaffUserIds(tx, groupId, ["admin", "treasurer"])) {
    await insertNotification(tx, {
      groupId,
      userId,
      template,
      link: "/dashboard/mgr",
      sourceType: "mgr_cycle",
      sourceId: cycle.id,
    });
  }
}

export async function closeCycleAction(cycleId: number): Promise<MgrActionState> {
  const session = await requireProduct("mgr", "admin", "treasurer");
  const groupId = session.activeMembership.groupId;

  const result = await withTenant(groupId, async (tx): Promise<MgrActionState> => {
    const cycle = await tx.query.mgrCycles.findFirst({
      where: and(eq(mgrCycles.id, cycleId), eq(mgrCycles.groupId, groupId)),
    });
    if (!cycle) return { error: "Cycle not found" };
    if (cycle.status !== "active") return { error: "Only the current cycle can be closed" };

    const slots = await tx.query.mgrSlots.findMany({
      where: and(eq(mgrSlots.groupId, groupId), eq(mgrSlots.cycleId, cycleId)),
    });
    const blocker = cycleCloseBlocker(slots.map((s) => s.status));
    if (blocker) return { error: blocker };

    await completeCycleAndOpenNext(tx, groupId, cycle);
    return null;
  });

  revalidatePath("/dashboard/mgr");
  return result;
}

/** A member's wish list: up to 3 upcoming cycles they would like to receive in, best first. */
export async function setTurnPreferencesAction(
  memberId: number,
  cycleNumbers: number[],
): Promise<MgrActionState> {
  const session = await requireProduct("mgr");
  const groupId = session.activeMembership.groupId;
  const isStaff = ["admin", "treasurer"].includes(session.activeMembership.role);

  if (!isStaff && session.activeMembership.memberId !== memberId) {
    return { error: "You can only choose your own turns" };
  }
  const wanted = [...new Set(cycleNumbers.filter((n) => Number.isInteger(n)))];
  if (wanted.length > 3) return { error: "Please choose at most 3 turns" };

  const result = await withTenant(groupId, async (tx): Promise<MgrActionState> => {
    if (wanted.length > 0) {
      const valid = await tx.query.mgrCycles.findMany({
        where: and(
          eq(mgrCycles.groupId, groupId),
          inArray(mgrCycles.cycleNumber, wanted),
          inArray(mgrCycles.status, ["planned", "active"]),
        ),
      });
      if (valid.length !== wanted.length) return { error: "One of those turns is no longer available" };
    }
    // Keep the order the member chose (first = most wanted).
    await tx
      .insert(mgrMemberTurns)
      .values({ groupId, memberId, turnsTotal: 1, contributionMultiplier: "1", preferredCycles: wanted })
      .onConflictDoUpdate({
        target: [mgrMemberTurns.groupId, mgrMemberTurns.memberId],
        set: { preferredCycles: wanted, updatedAt: new Date() },
      });
    return null;
  });

  revalidatePath("/dashboard/mgr");
  return result;
}

/**
 * Fills every open turn in the current rotation, honouring members' wish
 * lists first (fairly — see assignByPreferences), then drawing the rest.
 * A turn a member asked for is recorded as "claimed" (their own choice), so
 * "Reshuffle" never takes it back; drawn turns are "auto_assigned".
 */
export async function fillByPreferencesAction(): Promise<{ assigned: number; byChoice: number }> {
  const session = await requireProduct("mgr", "admin", "treasurer");
  const groupId = session.activeMembership.groupId;

  const out = await withTenant(groupId, async (tx) => {
    const base = await rotationBase(tx, groupId);
    const openSlots = await tx.query.mgrSlots.findMany({
      where: and(eq(mgrSlots.groupId, groupId), eq(mgrSlots.status, "open"), gt(mgrSlots.cycleNumber, base)),
    });
    if (openSlots.length === 0) return { assigned: 0, byChoice: 0 };

    const turnRows = await tx.query.mgrMemberTurns.findMany({
      where: and(eq(mgrMemberTurns.groupId, groupId), eq(mgrMemberTurns.active, true)),
    });
    const takenCounts = await tx
      .select({ memberId: mgrSlots.memberId, taken: sql<number>`count(*)::int` })
      .from(mgrSlots)
      .where(
        and(
          eq(mgrSlots.groupId, groupId),
          inArray(mgrSlots.status, CLAIMED_STATUSES),
          gt(mgrSlots.cycleNumber, base),
        ),
      )
      .groupBy(mgrSlots.memberId);
    const takenBy = new Map(takenCounts.map((t) => [t.memberId, t.taken]));

    const assignments = assignByPreferences({
      openSlots: openSlots.map((s) => ({ id: s.id, cycleNumber: s.cycleNumber, slotNumber: s.slotNumber })),
      turns: turnRows.map((t) => ({
        memberId: t.memberId,
        turnsTotal: t.turnsTotal,
        taken: takenBy.get(t.memberId) ?? 0,
      })),
      preferences: new Map(
        turnRows.filter((t) => t.preferredCycles?.length).map((t) => [t.memberId, t.preferredCycles!]),
      ),
    });

    for (const a of assignments) {
      const byChoice = a.reason === "preference";
      const status: SlotStatus = byChoice ? "claimed" : "auto_assigned";
      await tx
        .update(mgrSlots)
        .set({ memberId: a.memberId, status, claimedAt: new Date() })
        .where(eq(mgrSlots.id, a.slotId));
      await logSlotEvent(tx, {
        groupId,
        slotId: a.slotId,
        session,
        action: byChoice ? "claimed" : "auto_assigned",
        fromStatus: "open",
        toStatus: status,
        fromMemberId: null,
        toMemberId: a.memberId,
        note: byChoice ? `their choice number ${a.choice}` : "random draw",
      });
    }
    return {
      assigned: assignments.length,
      byChoice: assignments.filter((a) => a.reason === "preference").length,
    };
  });

  revalidatePath("/dashboard/mgr");
  return out;
}

/**
 * Files a finished rotation away: every cycle must be completed (none still
 * planned or running). Archived cycles leave the main schedule, stay readable
 * under "Past rotations", and stop counting against anyone's turns.
 */
export async function archiveRotationAction(): Promise<MgrActionState> {
  const session = await requireProduct("mgr", "admin", "treasurer");
  const groupId = session.activeMembership.groupId;

  const result = await withTenant(groupId, async (tx): Promise<MgrActionState> => {
    const live = await tx.query.mgrCycles.findMany({
      where: and(
        eq(mgrCycles.groupId, groupId),
        inArray(mgrCycles.status, ["planned", "active", "completed"]),
      ),
    });
    const completed = live.filter((c) => c.status === "completed");
    if (completed.length === 0) return { error: "There is no finished rotation to archive yet." };
    if (live.length > completed.length) {
      return { error: "Some cycles are not finished yet. Finish or close them first." };
    }

    await tx
      .update(mgrCycles)
      .set({ status: "closed", updatedAt: new Date() })
      .where(and(eq(mgrCycles.groupId, groupId), eq(mgrCycles.status, "completed")));
    return null;
  });

  revalidatePath("/dashboard/mgr");
  return result;
}

/** Archive the finished rotation, build a fresh schedule, and fill it (random draw or join order). */
export async function startNewRotationAction(draw: boolean): Promise<MgrActionState> {
  const archived = await archiveRotationAction();
  if (archived?.error) return archived;
  const generated = await generateScheduleAction();
  if (generated?.error) return generated;
  await autoAssignAction(draw);
  return null;
}

/**
 * Re-draws only the turns the system handed out (auto-assigned and not yet
 * paid). Turns members chose for themselves, and anything already paid, are
 * never touched. Every turn that moves is written to the activity log.
 */
export async function reshuffleUnpaidAction(): Promise<{ reshuffled: number }> {
  const session = await requireProduct("mgr", "admin", "treasurer");
  const groupId = session.activeMembership.groupId;

  const reshuffled = await withTenant(groupId, async (tx) => {
    const base = await rotationBase(tx, groupId);
    const handedOut = await tx.query.mgrSlots.findMany({
      where: and(
        eq(mgrSlots.groupId, groupId),
        eq(mgrSlots.status, "auto_assigned"),
        gt(mgrSlots.cycleNumber, base),
      ),
    });
    for (const slot of handedOut) {
      await tx
        .update(mgrSlots)
        .set({ memberId: null, status: "open", claimedAt: null })
        .where(eq(mgrSlots.id, slot.id));
      await logSlotEvent(tx, {
        groupId,
        slotId: slot.id,
        session,
        action: "reshuffled",
        fromStatus: slot.status,
        toStatus: "open",
        fromMemberId: slot.memberId,
        toMemberId: null,
        note: "turn returned for a fresh draw",
      });
    }
    return handedOut.length;
  });

  if (reshuffled > 0) await autoAssignAction(true);
  revalidatePath("/dashboard/mgr");
  return { reshuffled };
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

  revalidatePath("/dashboard/mgr");
  return null;
}
