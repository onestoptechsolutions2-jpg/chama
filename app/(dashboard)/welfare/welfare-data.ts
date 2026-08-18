import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import {
  welfarePolicies,
  welfareFunds,
  welfareRequests,
  welfareGrants,
  welfareAdvances,
  welfareLedger,
  members,
  groupMemberships,
  notifications,
  welfareReserveEnum,
} from "@/lib/db/schema";
import { checkMemberEligibility, type EligibilityResult } from "@/lib/domain/welfare-eligibility";
import { applyReserveMovement, isBelowFloor } from "@/lib/domain/welfare-fund";
import { computeAdvanceFee, computeAdvanceTotalRepayable } from "@/lib/domain/welfare-advance";
import {
  requiredApproverRoles,
  type ApprovalTier,
  type MembershipRole,
} from "@/lib/domain/welfare-approval";
import {
  buildWelfareNotification,
  type WelfareNotificationEvent,
} from "@/lib/domain/notifications";
import { defaultDueDate } from "@/lib/domain/loans";

type Reserve = (typeof welfareReserveEnum.enumValues)[number];

function monthsBetween(from: string | Date, to: Date): number {
  const f = new Date(from);
  return (to.getFullYear() - f.getFullYear()) * 12 + (to.getMonth() - f.getMonth());
}

/**
 * Load-bearing at activation time (a member can submit a request the moment
 * welfare is turned on), so activateProductAction/createGroupAction write
 * these rows explicitly rather than relying solely on this lazy fail-safe —
 * this upsert only exists to cover a group that somehow slipped through
 * (e.g. predates Phase 8's backfill migration).
 */
export async function getOrCreateWelfarePolicy(tx: Tx, groupId: number) {
  const existing = await tx.query.welfarePolicies.findFirst({
    where: eq(welfarePolicies.groupId, groupId),
  });
  if (existing) return existing;
  const [created] = await tx
    .insert(welfarePolicies)
    .values({ groupId })
    .onConflictDoUpdate({ target: welfarePolicies.groupId, set: { updatedAt: new Date() } })
    .returning();
  return created;
}

export async function getOrCreateWelfareFund(tx: Tx, groupId: number) {
  const existing = await tx.query.welfareFunds.findFirst({
    where: eq(welfareFunds.groupId, groupId),
  });
  if (existing) return existing;
  const [created] = await tx
    .insert(welfareFunds)
    .values({ groupId })
    .onConflictDoUpdate({ target: welfareFunds.groupId, set: { updatedAt: new Date() } })
    .returning();
  return created;
}

/** Every active officeholder in `roles`, with the members.id a welfare_approvals row can reference — a role with no current holder simply won't appear. */
async function listOfficeHolders(
  tx: Tx,
  groupId: number,
  roles: MembershipRole[],
): Promise<{ memberId: number; userId: number; role: MembershipRole }[]> {
  if (roles.length === 0) return [];
  const rows = await tx
    .select({ memberId: members.id, userId: members.userId, role: groupMemberships.role })
    .from(groupMemberships)
    .innerJoin(
      members,
      and(eq(members.userId, groupMemberships.userId), eq(members.groupId, groupMemberships.groupId)),
    )
    .where(
      and(
        eq(groupMemberships.groupId, groupId),
        eq(groupMemberships.status, "active"),
        inArray(groupMemberships.role, roles),
      ),
    );
  return rows
    .filter((r): r is { memberId: number; userId: number; role: MembershipRole } => r.userId !== null)
    .map((r) => ({ memberId: r.memberId, userId: r.userId, role: r.role as MembershipRole }));
}

/**
 * Resolves the *specific* officeholders (member rows) a tier2/tier3 request
 * needs to co-sign, at request-creation time — mirrors loan_guarantors'
 * pattern of a fixed memberId per row rather than a role looked up fresh at
 * response time. `approvers` can be shorter than `requiredRoleCount` if an
 * office is currently vacant — the caller must treat that as a hard error
 * (a request that could never reach quorum), not silently proceed.
 */
export async function resolveRequiredApprovers(
  tx: Tx,
  groupId: number,
  tier: ApprovalTier,
  claimantMemberId: number,
): Promise<{ approvers: { memberId: number; role: MembershipRole }[]; requiredRoleCount: number }> {
  const claimant = await tx.query.members.findFirst({ where: eq(members.id, claimantMemberId) });
  const claimantGm = claimant?.userId
    ? await tx.query.groupMemberships.findFirst({
        where: and(
          eq(groupMemberships.userId, claimant.userId),
          eq(groupMemberships.groupId, groupId),
        ),
      })
    : null;
  const claimantRole = (claimantGm?.role as MembershipRole | undefined) ?? null;

  const roles = requiredApproverRoles(tier, claimantRole);
  const holders = await listOfficeHolders(tx, groupId, roles);
  return {
    approvers: holders.map((h) => ({ memberId: h.memberId, role: h.role })),
    requiredRoleCount: roles.length,
  };
}

export async function evaluateMemberWelfareEligibility(
  tx: Tx,
  groupId: number,
  memberId: number,
  policy: { minTenureMonths: number; maxClaimsPerMemberPerYear: number; cooldownDays: number },
): Promise<EligibilityResult> {
  const member = await tx.query.members.findFirst({
    where: and(eq(members.id, memberId), eq(members.groupId, groupId)),
  });
  if (!member) return { eligible: false, reason: "Member not found" };

  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const [{ count }] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(welfareRequests)
    .where(
      and(
        eq(welfareRequests.groupId, groupId),
        eq(welfareRequests.memberId, memberId),
        gte(welfareRequests.createdAt, oneYearAgo),
        inArray(welfareRequests.status, ["pending", "under_review", "approved", "disbursed"]),
      ),
    );

  const lastRequest = await tx.query.welfareRequests.findFirst({
    where: and(eq(welfareRequests.groupId, groupId), eq(welfareRequests.memberId, memberId)),
    orderBy: (r, { desc }) => [desc(r.createdAt)],
  });

  return checkMemberEligibility({
    isActiveMember: member.active,
    tenureMonths: monthsBetween(member.joinedDate, now),
    minTenureMonths: policy.minTenureMonths,
    claimsThisYear: count,
    maxClaimsPerYear: policy.maxClaimsPerMemberPerYear,
    lastRequestDate: lastRequest ? lastRequest.createdAt.toISOString().split("T")[0] : null,
    cooldownDays: policy.cooldownDays,
    now,
  });
}

/** Writes a notification for the user behind a members row — a no-op if that member has no linked login yet (e.g. staff-added, no account). */
async function notifyMember(
  tx: Tx,
  groupId: number,
  memberId: number,
  event: WelfareNotificationEvent,
  sourceId: number,
) {
  const member = await tx.query.members.findFirst({ where: eq(members.id, memberId) });
  if (!member?.userId) return;
  const tpl = buildWelfareNotification(event);
  await tx.insert(notifications).values({
    groupId,
    userId: member.userId,
    category: tpl.category,
    title: tpl.title,
    body: tpl.body,
    link: "/welfare",
    sourceType: "welfare_request",
    sourceId,
  });
}

async function notifyUser(
  tx: Tx,
  groupId: number,
  userId: number,
  event: WelfareNotificationEvent,
  sourceId: number,
) {
  const tpl = buildWelfareNotification(event);
  await tx.insert(notifications).values({
    groupId,
    userId,
    category: tpl.category,
    title: tpl.title,
    body: tpl.body,
    link: "/welfare",
    sourceType: "welfare_request",
    sourceId,
  });
}

/**
 * Records a `welfare`-type contribution as collective fund income — the
 * replacement for the old members.welfareBalance increment. Splits the
 * routed amount across the three reserves per the group's policy and writes
 * one ledger row per non-zero reserve, all inside the caller's transaction.
 */
export async function allocateContributionToWelfareFund(
  tx: Tx,
  groupId: number,
  contributionId: number,
  amount: number,
  splitAmounts: { emergency: number; longTerm: number; advance: number },
): Promise<void> {
  const fund = await getOrCreateWelfareFund(tx, groupId);
  const now = new Date();

  const moves: { reserve: Reserve; amount: number; current: number }[] = [
    { reserve: "emergency" as const, amount: splitAmounts.emergency, current: Number(fund.emergencyBalance) },
    { reserve: "long_term" as const, amount: splitAmounts.longTerm, current: Number(fund.longTermBalance) },
    { reserve: "advance" as const, amount: splitAmounts.advance, current: Number(fund.advanceBalance) },
  ].filter((m) => m.amount > 0);

  let emergencyBalance = Number(fund.emergencyBalance);
  let longTermBalance = Number(fund.longTermBalance);
  let advanceBalance = Number(fund.advanceBalance);

  for (const move of moves) {
    const result = applyReserveMovement(move.current, move.amount, "in", true);
    if (!result.ok) continue; // allocations only ever credit — this branch is unreachable, kept for type narrowing
    if (move.reserve === "emergency") emergencyBalance = result.newBalance;
    if (move.reserve === "long_term") longTermBalance = result.newBalance;
    if (move.reserve === "advance") advanceBalance = result.newBalance;

    await tx.insert(welfareLedger).values({
      groupId,
      reserve: move.reserve,
      entryType: "allocation_in",
      amount: String(move.amount),
      balanceAfter: String(result.newBalance),
      relatedContributionId: contributionId,
      note: "Welfare contribution allocated to fund",
    });
  }

  await tx
    .update(welfareFunds)
    .set({
      emergencyBalance: String(emergencyBalance),
      longTermBalance: String(longTermBalance),
      advanceBalance: String(advanceBalance),
      lifetimeCollected: sql`${welfareFunds.lifetimeCollected} + ${amount}`,
      updatedAt: now,
    })
    .where(eq(welfareFunds.groupId, groupId));
}

export type ApprovedAmounts = { emergency: number; longTerm: number; advance: number };

/**
 * The single choke point for all welfare money movement. Locks the fund row
 * FOR UPDATE, re-validates the request is still awaiting disbursement
 * (idempotency — no double-disbursement even under concurrent attempts),
 * validates every reserve has sufficient balance BEFORE writing anything
 * (so an insufficient-funds rejection leaves zero rows behind, no partial
 * ledger entry), then writes the grant/advance records, one ledger row per
 * reserve touched, updates the fund's cached balances and lifetime totals,
 * flips the request to disbursed, and notifies the requester.
 */
export async function disburseWelfareRequest(
  tx: Tx,
  requestId: number,
  groupId: number,
  approvedAmounts: ApprovedAmounts,
  actorUserId: number,
): Promise<{ error: string } | { ok: true; reserveLow: boolean }> {
  const policy = await getOrCreateWelfarePolicy(tx, groupId);

  const [fund] = await tx
    .select()
    .from(welfareFunds)
    .where(eq(welfareFunds.groupId, groupId))
    .for("update");
  if (!fund) return { error: "Welfare fund not found for this group" };

  const request = await tx.query.welfareRequests.findFirst({
    where: and(eq(welfareRequests.id, requestId), eq(welfareRequests.groupId, groupId)),
  });
  if (!request) return { error: "Request not found" };
  if (request.status === "disbursed") {
    return { error: "This request has already been disbursed" };
  }
  if (request.status !== "pending" && request.status !== "under_review") {
    return { error: "This request is no longer awaiting disbursement" };
  }

  const allowOverdraft = policy.allowOverdraft;
  const emergencyMove =
    approvedAmounts.emergency > 0
      ? applyReserveMovement(Number(fund.emergencyBalance), approvedAmounts.emergency, "out", allowOverdraft)
      : null;
  if (emergencyMove && !emergencyMove.ok) return { error: `Emergency reserve: ${emergencyMove.error}` };

  const longTermMove =
    approvedAmounts.longTerm > 0
      ? applyReserveMovement(Number(fund.longTermBalance), approvedAmounts.longTerm, "out", allowOverdraft)
      : null;
  if (longTermMove && !longTermMove.ok) return { error: `Long-term reserve: ${longTermMove.error}` };

  const advanceMove =
    approvedAmounts.advance > 0
      ? applyReserveMovement(Number(fund.advanceBalance), approvedAmounts.advance, "out", allowOverdraft)
      : null;
  if (advanceMove && !advanceMove.ok) return { error: `Advance reserve: ${advanceMove.error}` };

  // Every movement validated — nothing above this line has written to the DB.
  const now = new Date();

  if (approvedAmounts.emergency > 0 || approvedAmounts.longTerm > 0) {
    await tx.insert(welfareGrants).values({
      groupId,
      requestId,
      emergencyAmount: String(approvedAmounts.emergency),
      longTermAmount: String(approvedAmounts.longTerm),
      disbursedBy: actorUserId,
    });
  }

  if (approvedAmounts.advance > 0) {
    const feePct = Number(policy.advanceFeePct);
    const feeAmount = computeAdvanceFee(approvedAmounts.advance, feePct);
    const totalRepayable = computeAdvanceTotalRepayable(approvedAmounts.advance, feePct);
    const dueDate = defaultDueDate(now, policy.advanceMaxRepaymentMonths);
    await tx.insert(welfareAdvances).values({
      groupId,
      requestId,
      memberId: request.memberId,
      principal: String(approvedAmounts.advance),
      feePct: String(feePct),
      feeAmount: String(feeAmount),
      totalRepayable: String(totalRepayable),
      amountRemaining: String(totalRepayable),
      dueDate,
      disbursedBy: actorUserId,
    });
  }

  if (emergencyMove) {
    await tx.insert(welfareLedger).values({
      groupId,
      reserve: "emergency",
      entryType: "grant_out",
      amount: String(approvedAmounts.emergency),
      balanceAfter: String(emergencyMove.newBalance),
      relatedRequestId: requestId,
      recordedBy: actorUserId,
    });
  }
  if (longTermMove) {
    await tx.insert(welfareLedger).values({
      groupId,
      reserve: "long_term",
      entryType: "grant_out",
      amount: String(approvedAmounts.longTerm),
      balanceAfter: String(longTermMove.newBalance),
      relatedRequestId: requestId,
      recordedBy: actorUserId,
    });
  }
  if (advanceMove) {
    await tx.insert(welfareLedger).values({
      groupId,
      reserve: "advance",
      entryType: "advance_out",
      amount: String(approvedAmounts.advance),
      balanceAfter: String(advanceMove.newBalance),
      relatedRequestId: requestId,
      recordedBy: actorUserId,
    });
  }

  const grantTotal = approvedAmounts.emergency + approvedAmounts.longTerm;
  const [newFund] = await tx
    .update(welfareFunds)
    .set({
      emergencyBalance: emergencyMove ? String(emergencyMove.newBalance) : fund.emergencyBalance,
      longTermBalance: longTermMove ? String(longTermMove.newBalance) : fund.longTermBalance,
      advanceBalance: advanceMove ? String(advanceMove.newBalance) : fund.advanceBalance,
      lifetimeGrantsDisbursed: sql`${welfareFunds.lifetimeGrantsDisbursed} + ${grantTotal}`,
      lifetimeAdvancesDisbursed: sql`${welfareFunds.lifetimeAdvancesDisbursed} + ${approvedAmounts.advance}`,
      updatedAt: now,
    })
    .where(eq(welfareFunds.groupId, groupId))
    .returning();

  await tx
    .update(welfareRequests)
    .set({
      approvedEmergencyAmount: String(approvedAmounts.emergency),
      approvedLongTermAmount: String(approvedAmounts.longTerm),
      approvedAdvanceAmount: String(approvedAmounts.advance),
      status: "disbursed",
      disbursedAt: now,
      updatedAt: now,
    })
    .where(eq(welfareRequests.id, requestId));

  const reserveLow = isBelowFloor(Number(newFund.emergencyBalance), Number(policy.minEmergencyReserveFloor));

  await notifyMember(
    tx,
    groupId,
    request.memberId,
    { type: "request_disbursed", amount: grantTotal + approvedAmounts.advance },
    requestId,
  );

  if (reserveLow) {
    const officials = await listOfficeHolders(tx, groupId, ["admin", "treasurer", "secretary"]);
    for (const official of officials) {
      await notifyUser(
        tx,
        groupId,
        official.userId,
        { type: "reserve_low", reserve: "Emergency", balance: Number(newFund.emergencyBalance) },
        requestId,
      );
    }
  }

  return { ok: true, reserveLow };
}

/** Exported for the approvals action — notifies a specific officeholder that a request is awaiting their co-sign. */
export async function notifyApprovalNeeded(
  tx: Tx,
  groupId: number,
  approverUserId: number,
  requesterName: string,
  amount: number,
  requestId: number,
) {
  await notifyUser(
    tx,
    groupId,
    approverUserId,
    { type: "approval_needed", requesterName, amount },
    requestId,
  );
}

export { notifyMember, notifyUser };
