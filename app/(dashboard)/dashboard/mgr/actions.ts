"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gt, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/session";
import { can, selfDealingError } from "@/lib/auth/permissions";
import { withTenant } from "@/lib/db/rls";
import {
  groups,
  members,
  mgrCycles,
  mgrRotations,
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
  choicesAreOpen,
  cycleDateFrom,
  nairobiToday,
  nextRotationStart,
  rescheduleRotation,
  rotationFinished,
  suggestRotationStart,
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
  const session = await requirePermission("mgr.manage");
  const parsed = updateMgrConfigSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { mgrFrequency, mgrRecipientsPerCycle, mgrStartDate, mgrContributionAmount, mgrChoicesCloseDate } =
    parsed.data;
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, (tx) =>
    tx
      .update(groups)
      .set({
        mgrFrequency,
        mgrRecipientsPerCycle,
        mgrStartDate: mgrStartDate || null,
        mgrChoicesCloseDate: mgrChoicesCloseDate || null,
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
  const session = await requirePermission("mgr.use");
  const parsed = setTurnsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { memberId, turnsTotal } = parsed.data;
  const groupId = session.activeMembership.groupId;
  const isStaff = can(session.activeMembership, "mgr.manage");

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

type Rotation = typeof mgrRotations.$inferSelect;
type GroupRow = typeof groups.$inferSelect;

/** The group's live rotation (at most one — a unique index guarantees it). */
async function activeRotation(tx: Tx, groupId: number): Promise<Rotation | undefined> {
  return tx.query.mgrRotations.findFirst({
    where: and(eq(mgrRotations.groupId, groupId), eq(mgrRotations.status, "active")),
  });
}

/** Opens the next rotation with a copy of the group's current settings. */
async function openRotation(tx: Tx, group: GroupRow, startDate: string, createdBy: number): Promise<Rotation> {
  const [{ lastNumber, lastCycle }] = await tx
    .select({
      lastNumber: sql<number>`coalesce((select max(number) from mgr_rotations where group_id = ${group.id}), 0)::int`,
      lastCycle: sql<number>`coalesce((select max(cycle_number) from mgr_cycles where group_id = ${group.id}), 0)::int`,
    })
    .from(groups)
    .where(eq(groups.id, group.id));
  const [rotation] = await tx
    .insert(mgrRotations)
    .values({
      groupId: group.id,
      number: lastNumber + 1,
      status: "active",
      startDate,
      endDate: startDate,
      frequency: group.mgrFrequency,
      recipientsPerCycle: group.mgrRecipientsPerCycle ?? 1,
      contributionAmount: String(group.mgrContributionAmount ?? group.sharePrice),
      choicesCloseDate: group.mgrChoicesCloseDate,
      cycleOffset: lastCycle,
      createdBy,
    })
    .returning();
  // Wish lists name cycles of the old rotation; start the new one clean.
  await tx.update(mgrMemberTurns).set({ preferredCycles: null }).where(eq(mgrMemberTurns.groupId, group.id));
  return rotation;
}

/** Recomputes a rotation's automatic end date and totals from its cycles. */
async function refreshRotationTotals(tx: Tx, rotationId: number) {
  const [t] = await tx
    .select({
      cycles: sql<number>`count(*)::int`,
      end: sql<string | null>`max(${mgrCycles.scheduledDate})::text`,
      slots: sql<number>`(select count(*)::int from mgr_slots where rotation_id = ${rotationId})`,
    })
    .from(mgrCycles)
    .where(eq(mgrCycles.rotationId, rotationId));
  await tx
    .update(mgrRotations)
    .set({ totalCycles: t.cycles, totalSlots: t.slots, ...(t.end ? { endDate: t.end } : {}), updatedAt: new Date() })
    .where(eq(mgrRotations.id, rotationId));
}

/**
 * Settles a rotation whose every cycle is completed: it is archived on the
 * spot (it leaves the main schedule, stays readable under Past rotations,
 * and stops counting against anyone's turns), and the officials are told
 * when the next one could start.
 */
async function finishRotation(tx: Tx, groupId: number, rotationId: number) {
  const now = new Date();
  const [rotation] = await tx
    .update(mgrRotations)
    .set({ status: "archived", completedAt: now, archivedAt: now, updatedAt: now })
    .where(and(eq(mgrRotations.id, rotationId), eq(mgrRotations.status, "active")))
    .returning();
  if (!rotation) return;
  const template = buildMgrNotification({
    type: "rotation_finished",
    rotationNumber: rotation.number,
    endDate: rotation.endDate,
    nextStart: nextRotationStart(rotation.endDate, rotation.frequency),
  });
  for (const userId of await listActiveStaffUserIds(tx, groupId, ["admin", "treasurer"])) {
    await insertNotification(tx, { groupId, userId, template, link: "/dashboard/mgr", sourceType: "mgr_rotation", sourceId: rotation.id });
  }
}

// ── Schedule generation ──────────────────────────────────────────────────
/**
 * Plans the live rotation — or opens a new one (starting `startDate`, or the
 * default start) when none is live. The number of cycles, and so the end
 * date, follows from members × turns ÷ recipients per cycle. Until the first
 * payout the rotation takes the group's current settings; after that its
 * settings are fixed and only the remaining turns are re-planned (members
 * joining, leaving or changing turns). Completed cycles keep their dates; the
 * rest continue from the next unfinished cycle's date. Regenerating never
 * discards a claimed, assigned or paid turn.
 */
export async function generateScheduleAction(startDate?: string): Promise<MgrActionState> {
  const session = await requirePermission("mgr.manage");
  const groupId = session.activeMembership.groupId;

  const result = await withTenant(groupId, async (tx): Promise<MgrActionState> => {
    const group = await tx.query.groups.findFirst({ where: eq(groups.id, groupId) });
    if (!group) return { error: "Group not found" };
    const today = nairobiToday();

    const activeMembers = await tx.query.members.findMany({
      where: and(eq(members.groupId, groupId), eq(members.active, true)),
      orderBy: (m, { asc }) => [asc(m.joinedDate), asc(m.id)],
    });
    if (activeMembers.length === 0) return { error: "Add members first" };

    let rotation = await activeRotation(tx, groupId);
    if (!rotation) {
      const previous = await tx.query.mgrRotations.findFirst({
        where: eq(mgrRotations.groupId, groupId),
        orderBy: (r, { desc }) => [desc(r.number)],
      });
      const start = startDate || suggestRotationStart({ configuredStart: group.mgrStartDate, previous: previous ?? null, today });
      if (start < today) return { error: "The start date can't be in the past" };
      rotation = await openRotation(tx, group, start, session.user.id);
    }

    const rotationCycles = await tx.query.mgrCycles.findMany({
      where: eq(mgrCycles.rotationId, rotation.id),
      orderBy: (c, { asc }) => [asc(c.cycleNumber)],
    });
    const completed = rotationCycles.filter((c) => c.status === "completed");
    const [{ settled }] = await tx
      .select({ settled: sql<number>`count(*)::int` })
      .from(mgrSlots)
      .where(and(eq(mgrSlots.rotationId, rotation.id), inArray(mgrSlots.status, ["paid", "skipped"])));
    const started = completed.length > 0 || settled > 0;

    if (!started) {
      [rotation] = await tx
        .update(mgrRotations)
        .set({
          frequency: group.mgrFrequency,
          recipientsPerCycle: group.mgrRecipientsPerCycle ?? 1,
          contributionAmount: String(group.mgrContributionAmount ?? group.sharePrice),
          choicesCloseDate: group.mgrChoicesCloseDate,
          updatedAt: new Date(),
        })
        .where(eq(mgrRotations.id, rotation.id))
        .returning();
    }

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

    const schedule = generateMgrSchedule({
      frequency: rotation.frequency,
      recipientsPerCycle: rotation.recipientsPerCycle,
      baseContribution: Number(rotation.contributionAmount),
      startDate: new Date(`${rotation.startDate}T00:00:00Z`),
      members: activeMembers.map((m) => {
        const t = turnsByMember.get(m.id);
        return { memberId: m.id, turnsTotal: t?.turnsTotal ?? 1, multiplier: t ? Number(t.contributionMultiplier) : 1 };
      }),
    });

    // Dates: completed cycles keep theirs; the rest follow on from the first
    // unfinished cycle (or from the start date if nothing is paid yet).
    const existingDate = new Map(rotationCycles.map((c) => [c.cycleNumber, c.scheduledDate]));
    const firstOpen = rotationCycles.find((c) => c.status !== "completed");
    const anchor = !started
      ? rotation.startDate
      : (firstOpen?.scheduledDate ??
        (completed.at(-1)?.scheduledDate ? nextRotationStart(completed.at(-1)!.scheduledDate!, rotation.frequency) : rotation.startDate));
    const dateFor = (n: number) =>
      n <= completed.length
        ? (existingDate.get(rotation!.cycleOffset + n) ?? cycleDateFrom(rotation!.startDate, rotation!.frequency, n - 1))
        : cycleDateFrom(anchor, rotation!.frequency, n - 1 - completed.length);

    // Remove not-yet-claimed turns and the planned cycles left empty.
    await tx.delete(mgrSlots).where(and(eq(mgrSlots.rotationId, rotation.id), eq(mgrSlots.status, "open")));
    const remainingCycleIds = await tx
      .select({ id: mgrSlots.cycleId })
      .from(mgrSlots)
      .where(and(eq(mgrSlots.rotationId, rotation.id), isNotNull(mgrSlots.cycleId)));
    const keepIds = remainingCycleIds.map((r) => r.id!).filter(Boolean);
    await tx.delete(mgrCycles).where(
      keepIds.length > 0
        ? and(eq(mgrCycles.rotationId, rotation.id), eq(mgrCycles.status, "planned"), notInArray(mgrCycles.id, keepIds))
        : and(eq(mgrCycles.rotationId, rotation.id), eq(mgrCycles.status, "planned")),
    );

    const hasActiveCycle = await tx.query.mgrCycles.findFirst({
      where: and(eq(mgrCycles.rotationId, rotation.id), eq(mgrCycles.status, "active")),
    });

    for (const cycle of schedule.cycles) {
      const cycleNumber = rotation.cycleOffset + cycle.cycleNumber;
      const scheduledDate = dateFor(cycle.cycleNumber);
      const opensNow = !hasActiveCycle && cycle.cycleNumber === completed.length + 1;
      const [cycleRow] = await tx
        .insert(mgrCycles)
        .values({
          groupId,
          rotationId: rotation.id,
          cycleNumber,
          status: opensNow ? "active" : "planned",
          scheduledDate,
          slotCount: cycle.slotCount,
          payoutPerSlot: String(cycle.payoutPerSlot),
          totalContributions: String(cycle.totalContributions),
        })
        .onConflictDoUpdate({
          target: [mgrCycles.groupId, mgrCycles.cycleNumber],
          set: {
            scheduledDate,
            slotCount: cycle.slotCount,
            payoutPerSlot: String(cycle.payoutPerSlot),
            totalContributions: String(cycle.totalContributions),
            ...(opensNow ? { status: "active" as const } : {}),
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
            rotationId: rotation.id,
            cycleNumber,
            slotNumber: slot.slotNumber,
            status: "open",
            payoutAmount: String(cycle.payoutPerSlot),
            scheduledDate,
          })
          .onConflictDoUpdate({
            target: [mgrSlots.groupId, mgrSlots.cycleNumber, mgrSlots.slotNumber],
            set: { cycleId: cycleRow.id, payoutAmount: String(cycle.payoutPerSlot), scheduledDate },
          });
      }
    }

    await tx.update(mgrRotations).set({ payoutPerSlot: String(schedule.payoutPerSlot) }).where(eq(mgrRotations.id, rotation.id));
    await refreshRotationTotals(tx, rotation.id);
    return null;
  });

  revalidatePath("/dashboard/mgr");
  return result;
}

/**
 * Moves the live rotation's dates. Before the first payout this sets a new
 * start date; afterwards it moves the next payout and everything after it.
 * The end date follows automatically. Officials are told.
 */
export async function rescheduleRotationAction(newDate: string): Promise<MgrActionState> {
  const session = await requirePermission("mgr.manage");
  const groupId = session.activeMembership.groupId;

  const result = await withTenant(groupId, async (tx): Promise<MgrActionState> => {
    const rotation = await activeRotation(tx, groupId);
    if (!rotation) return { error: "There is no rotation running" };
    const cycles = await tx.query.mgrCycles.findMany({ where: eq(mgrCycles.rotationId, rotation.id) });
    const plan = rescheduleRotation(cycles, newDate, rotation.frequency, nairobiToday());
    if ("error" in plan) return plan;

    for (const d of plan.dates) {
      await tx.update(mgrCycles).set({ scheduledDate: d.date, updatedAt: new Date() }).where(eq(mgrCycles.id, d.id));
      await tx.update(mgrSlots).set({ scheduledDate: d.date }).where(eq(mgrSlots.cycleId, d.id));
    }
    await tx
      .update(mgrRotations)
      .set({ ...(plan.startDate ? { startDate: plan.startDate } : {}), endDate: plan.endDate, updatedAt: new Date() })
      .where(eq(mgrRotations.id, rotation.id));

    const template = buildMgrNotification({
      type: "rotation_rescheduled",
      rotationNumber: rotation.number,
      nextDate: plan.dates[0].date,
      endDate: plan.endDate,
    });
    for (const userId of await listActiveStaffUserIds(tx, groupId, ["admin", "treasurer", "secretary"])) {
      await insertNotification(tx, { groupId, userId, template, link: "/dashboard/mgr", sourceType: "mgr_rotation", sourceId: rotation.id });
    }
    return null;
  });

  revalidatePath("/dashboard/mgr");
  return result;
}

// ── Slot claiming (member) ──────────────────────────────────────────────
export async function claimSlotAction(slotId: number): Promise<MgrActionState> {
  const session = await requirePermission("mgr.use");
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
    const live = await activeRotation(tx, groupId);
    if (slot.rotationId !== live?.id) return { error: "That turn belongs to a finished rotation" };

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
          eq(mgrSlots.rotationId, slot.rotationId),
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
  const session = await requirePermission("mgr.manage");
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

    if (data.status === "paid") {
      const recipient = data.memberId !== undefined ? data.memberId : slot.memberId;
      const self = selfDealingError(session.activeMembership.memberId, recipient, "mark a payout paid");
      if (self) {
        blocked = self;
        return null;
      }
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
  const session = await requirePermission("mgr.manage");
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
  const session = await requirePermission("mgr.manage");
  const groupId = session.activeMembership.groupId;

  const assigned = await withTenant(groupId, async (tx) => {
    const rotation = await activeRotation(tx, groupId);
    if (!rotation) return 0;
    const openSlots = await tx.query.mgrSlots.findMany({
      where: and(eq(mgrSlots.rotationId, rotation.id), eq(mgrSlots.status, "open")),
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
          eq(mgrSlots.rotationId, rotation.id),
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
  const session = await requirePermission("mgr.manage");
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, async (tx) => {
    const rotation = await activeRotation(tx, groupId);
    if (!rotation) return;
    const [last] = await tx
      .select({ max: sql<number>`coalesce(max(${mgrCycles.cycleNumber}), 0)::int`, date: sql<string | null>`max(${mgrCycles.scheduledDate})::text` })
      .from(mgrCycles)
      .where(eq(mgrCycles.groupId, groupId));
    await tx.insert(mgrCycles).values({
      groupId,
      rotationId: rotation.id,
      cycleNumber: (last?.max ?? 0) + 1,
      status: "planned",
      // Defaults to one period after the last cycle, so the end date moves with it.
      scheduledDate: scheduledDate || (last?.date ? nextRotationStart(last.date, rotation.frequency) : rotation.startDate),
    });
    await refreshRotationTotals(tx, rotation.id);
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
  cycle: { id: number; cycleNumber: number; rotationId: number },
): Promise<{ id: number; cycleNumber: number } | null> {
  await tx
    .update(mgrCycles)
    .set({ status: "completed", updatedAt: new Date() })
    .where(eq(mgrCycles.id, cycle.id));

  const next = await tx.query.mgrCycles.findFirst({
    where: and(
      eq(mgrCycles.rotationId, cycle.rotationId),
      eq(mgrCycles.status, "planned"),
      gt(mgrCycles.cycleNumber, cycle.cycleNumber),
    ),
    orderBy: (c, { asc }) => [asc(c.cycleNumber)],
  });
  if (!next) {
    // That was the last cycle: the rotation is complete and archives itself.
    const all = await tx.query.mgrCycles.findMany({ where: eq(mgrCycles.rotationId, cycle.rotationId), columns: { status: true } });
    if (rotationFinished(all.map((c) => c.status))) await finishRotation(tx, groupId, cycle.rotationId);
    return null;
  }

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
  const session = await requirePermission("mgr.manage");
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
  const session = await requirePermission("mgr.use");
  const groupId = session.activeMembership.groupId;
  const isStaff = can(session.activeMembership, "mgr.manage");

  if (!isStaff && session.activeMembership.memberId !== memberId) {
    return { error: "You can only choose your own turns" };
  }
  const wanted = [...new Set(cycleNumbers.filter((n) => Number.isInteger(n)))];
  if (wanted.length > 3) return { error: "Please choose at most 3 turns" };

  const result = await withTenant(groupId, async (tx): Promise<MgrActionState> => {
    if (!isStaff) {
      const group = await tx.query.groups.findFirst({ where: eq(groups.id, groupId) });
      if (group && !choicesAreOpen(group.mgrChoicesCloseDate, nairobiToday())) {
        return { error: `Choices closed on ${group.mgrChoicesCloseDate}. Please ask your admin.` };
      }
    }
    if (wanted.length > 0) {
      const rotation = await activeRotation(tx, groupId);
      if (!rotation) return { error: "There is no rotation running" };
      const valid = await tx.query.mgrCycles.findMany({
        where: and(
          eq(mgrCycles.rotationId, rotation.id),
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
  const session = await requirePermission("mgr.manage");
  const groupId = session.activeMembership.groupId;

  const out = await withTenant(groupId, async (tx) => {
    const rotation = await activeRotation(tx, groupId);
    if (!rotation) return { assigned: 0, byChoice: 0 };
    const openSlots = await tx.query.mgrSlots.findMany({
      where: and(eq(mgrSlots.rotationId, rotation.id), eq(mgrSlots.status, "open")),
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
          eq(mgrSlots.rotationId, rotation.id),
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
 * Files away a rotation whose cycles are all completed. Normally a rotation
 * archives itself when its last turn is settled; this covers one finished
 * before that happened (e.g. moved over from before rotations were stored).
 */
export async function archiveRotationAction(): Promise<MgrActionState> {
  const session = await requirePermission("mgr.manage");
  const groupId = session.activeMembership.groupId;

  const result = await withTenant(groupId, async (tx): Promise<MgrActionState> => {
    const rotation = await activeRotation(tx, groupId);
    if (!rotation) return { error: "There is no rotation running." };
    const cycles = await tx.query.mgrCycles.findMany({ where: eq(mgrCycles.rotationId, rotation.id), columns: { status: true } });
    if (!rotationFinished(cycles.map((c) => c.status))) {
      return { error: "Some cycles are not finished yet. Finish or close them first." };
    }
    await finishRotation(tx, groupId, rotation.id);
    return null;
  });

  revalidatePath("/dashboard/mgr");
  return result;
}

/**
 * Starts the next rotation on `startDate` (default: one period after the
 * last one ended), builds its schedule from today's members and turns, and
 * fills it (random draw or join order). A finished rotation still marked
 * live is archived first.
 */
export async function startNewRotationAction(draw: boolean, startDate?: string): Promise<MgrActionState> {
  const session = await requirePermission("mgr.manage");
  const live = await withTenant(session.activeMembership.groupId, (tx) => activeRotation(tx, session.activeMembership.groupId));
  if (live) {
    const archived = await archiveRotationAction();
    if (archived?.error) return { error: "The current rotation isn't finished yet." };
  }
  const generated = await generateScheduleAction(startDate);
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
  const session = await requirePermission("mgr.manage");
  const groupId = session.activeMembership.groupId;

  const reshuffled = await withTenant(groupId, async (tx) => {
    const rotation = await activeRotation(tx, groupId);
    if (!rotation) return 0;
    const handedOut = await tx.query.mgrSlots.findMany({
      where: and(eq(mgrSlots.rotationId, rotation.id), eq(mgrSlots.status, "auto_assigned")),
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
  const session = await requirePermission("mgr.use");
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
