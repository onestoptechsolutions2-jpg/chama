"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { requireProduct } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import {
  welfareRequests,
  welfareApprovals,
  welfareAdvances,
  welfareAdvanceRepayments,
  welfareFunds,
  welfareLedger,
} from "@/lib/db/schema";
import {
  submitWelfareRequestSchema,
  reviewWelfareRequestSchema,
  respondToWelfareApprovalSchema,
  recordAdvanceRepaymentSchema,
  allocateToWelfareFundSchema,
} from "@/lib/validation/welfare";
import {
  resolveApprovalTier,
  isApprovalQuorumMet,
  hasAnyDecline,
  canApprove,
} from "@/lib/domain/welfare-approval";
import { computeRequestTotal, applyReserveMovement } from "@/lib/domain/welfare-fund";
import { computeOutstandingAdvanceExposure } from "@/lib/domain/welfare-advance";
import {
  getOrCreateWelfarePolicy,
  getOrCreateWelfareFund,
  evaluateMemberWelfareEligibility,
  resolveRequiredApprovers,
  disburseWelfareRequest,
  notifyApprovalNeeded,
  notifyMember,
} from "./welfare-data";

export type WelfareActionState = { error: string } | null;

// ── Member: submit a request ────────────────────────────────────────────
// The unified "Request Help" flow — replaces submitClaimAction. Can carry
// emergency + long-term + advance amounts in the same submission (the
// hybrid mechanism); resolveApprovalTier decides whether it can be decided
// by a single staff member (tier1) or needs officials to co-sign
// (tier2/tier3), based on the *total* requested across all three.
export async function submitWelfareRequestAction(
  _prev: WelfareActionState,
  formData: FormData,
): Promise<WelfareActionState> {
  const session = await requireProduct("welfare");
  const memberId = session.activeMembership.memberId;
  if (!memberId) return { error: "No member profile linked to your account" };

  const parsed = submitWelfareRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const {
    reason,
    beneficiaryName,
    beneficiaryRel,
    description,
    requestedEmergencyAmount,
    requestedLongTermAmount,
    requestedAdvanceAmount,
  } = parsed.data;
  const groupId = session.activeMembership.groupId;

  const result = await withTenant(groupId, async (tx): Promise<{ error: string } | { ok: true }> => {
    // Belt-and-suspenders alongside welfare_requests_member_open_emergency_unique
    // (the DB-level fail-safe against a race between two concurrent
    // submissions) — this is the friendly, pre-emptive version of the same check.
    if (requestedEmergencyAmount > 0) {
      const openEmergency = await tx.query.welfareRequests.findFirst({
        where: and(
          eq(welfareRequests.groupId, groupId),
          eq(welfareRequests.memberId, memberId),
          inArray(welfareRequests.status, ["pending", "under_review"]),
        ),
      });
      if (openEmergency && Number(openEmergency.requestedEmergencyAmount) > 0) {
        return { error: "You already have a pending emergency request" };
      }
    }

    const policy = await getOrCreateWelfarePolicy(tx, groupId);
    const eligibility = await evaluateMemberWelfareEligibility(tx, groupId, memberId, policy);
    if (!eligibility.eligible) return { error: eligibility.reason };

    if (requestedEmergencyAmount > Number(policy.maxEmergencyGrant)) {
      return {
        error: `Emergency requests are capped at Ksh ${Number(policy.maxEmergencyGrant).toLocaleString()}`,
      };
    }
    if (requestedLongTermAmount > Number(policy.maxLongTermGrant)) {
      return {
        error: `Long-term welfare requests are capped at Ksh ${Number(policy.maxLongTermGrant).toLocaleString()}`,
      };
    }
    if (requestedAdvanceAmount > Number(policy.maxAdvance)) {
      return { error: `Advances are capped at Ksh ${Number(policy.maxAdvance).toLocaleString()}` };
    }
    if (requestedAdvanceAmount > 0) {
      const existingAdvances = await tx.query.welfareAdvances.findMany({
        where: eq(welfareAdvances.memberId, memberId),
      });
      const outstanding = computeOutstandingAdvanceExposure(existingAdvances);
      if (outstanding + requestedAdvanceAmount > Number(policy.maxOutstandingAdvancePerMember)) {
        return {
          error: `Would exceed your maximum outstanding advance of Ksh ${Number(policy.maxOutstandingAdvancePerMember).toLocaleString()}`,
        };
      }
    }

    const total = computeRequestTotal({
      requestedEmergencyAmount,
      requestedLongTermAmount,
      requestedAdvanceAmount,
    });
    const tier = resolveApprovalTier(total, {
      tier1MaxAmount: Number(policy.tier1MaxAmount),
      tier2MaxAmount: Number(policy.tier2MaxAmount),
    });

    let resolvedApprovers: { memberId: number; role: string }[] = [];
    if (tier !== "tier1") {
      const { approvers, requiredRoleCount } = await resolveRequiredApprovers(
        tx,
        groupId,
        tier,
        memberId,
      );
      if (approvers.length < requiredRoleCount) {
        return {
          error:
            "This request needs sign-off from officials, but at least one required office is currently vacant — ask an admin to fill it first",
        };
      }
      resolvedApprovers = approvers;
    }

    const [request] = await tx
      .insert(welfareRequests)
      .values({
        groupId,
        memberId,
        reason,
        beneficiaryName: beneficiaryName || null,
        beneficiaryRel: beneficiaryRel || null,
        description: description || null,
        requestedEmergencyAmount: String(requestedEmergencyAmount),
        requestedLongTermAmount: String(requestedLongTermAmount),
        requestedAdvanceAmount: String(requestedAdvanceAmount),
        approvalTier: tier,
        status: tier === "tier1" ? "pending" : "under_review",
      })
      .returning();

    if (resolvedApprovers.length > 0) {
      for (const approver of resolvedApprovers) {
        await tx.insert(welfareApprovals).values({
          groupId,
          requestId: request.id,
          memberId: approver.memberId,
          role: approver.role as (typeof welfareApprovals.$inferInsert)["role"],
        });
        await notifyApprovalNeeded(tx, groupId, approver.memberId, session.user.name, total, request.id);
      }
    }

    return { ok: true } as const;
  });

  if ("error" in result) return { error: result.error };
  revalidatePath("/welfare");
  return null;
}

// ── Staff: tier1 review (single staff decision) ─────────────────────────
export async function reviewWelfareRequestAction(
  requestId: number,
  formData: FormData,
): Promise<WelfareActionState> {
  const session = await requireProduct("welfare", "admin", "treasurer");
  const parsed = reviewWelfareRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { decision, approvedEmergencyAmount, approvedLongTermAmount, approvedAdvanceAmount, rejectionReason } =
    parsed.data;
  const groupId = session.activeMembership.groupId;

  const result = await withTenant(groupId, async (tx): Promise<{ error: string } | { ok: true }> => {
    const request = await tx.query.welfareRequests.findFirst({
      where: and(eq(welfareRequests.id, requestId), eq(welfareRequests.groupId, groupId)),
    });
    if (!request) return { error: "Request not found" };
    if (request.approvalTier !== "tier1") {
      return { error: "This request requires officials to co-sign, not a single-staff decision" };
    }
    if (request.status !== "pending") return { error: "This request has already been reviewed" };

    if (decision === "rejected") {
      await tx
        .update(welfareRequests)
        .set({
          status: "rejected",
          reviewedBy: session.user.id,
          reviewedAt: new Date(),
          rejectionReason: rejectionReason || null,
          updatedAt: new Date(),
        })
        .where(eq(welfareRequests.id, requestId));
      await notifyMember(
        tx,
        groupId,
        request.memberId,
        { type: "request_rejected", reason: rejectionReason || null },
        requestId,
      );
      return { ok: true } as const;
    }

    await tx
      .update(welfareRequests)
      .set({ reviewedBy: session.user.id, reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(welfareRequests.id, requestId));

    const disbursed = await disburseWelfareRequest(
      tx,
      requestId,
      groupId,
      {
        emergency: approvedEmergencyAmount ?? Number(request.requestedEmergencyAmount),
        longTerm: approvedLongTermAmount ?? Number(request.requestedLongTermAmount),
        advance: approvedAdvanceAmount ?? Number(request.requestedAdvanceAmount),
      },
      session.user.id,
    );
    if ("error" in disbursed) return { error: disbursed.error };

    return { ok: true } as const;
  });

  if ("error" in result) return { error: result.error };
  revalidatePath("/welfare");
  return null;
}

// ── Officials: respond to a tier2/tier3 co-sign request ─────────────────
export async function respondToWelfareApprovalAction(
  approvalRowId: number,
  formData: FormData,
): Promise<WelfareActionState> {
  const session = await requireProduct("welfare");
  const memberId = session.activeMembership.memberId;
  if (!memberId) return { error: "No member profile linked to your account" };

  const parsed = respondToWelfareApprovalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { decision, comment } = parsed.data;
  const groupId = session.activeMembership.groupId;

  const result = await withTenant(groupId, async (tx): Promise<{ error: string } | { ok: true }> => {
    const approval = await tx.query.welfareApprovals.findFirst({
      where: and(eq(welfareApprovals.id, approvalRowId), eq(welfareApprovals.groupId, groupId)),
    });
    if (!approval) return { error: "Approval request not found" };
    if (approval.memberId !== memberId) return { error: "This request isn't yours to respond to" };
    if (approval.status !== "pending") return { error: "You've already responded to this request" };

    const request = await tx.query.welfareRequests.findFirst({
      where: eq(welfareRequests.id, approval.requestId),
    });
    if (!request || (request.status !== "pending" && request.status !== "under_review")) {
      return { error: "This request is no longer awaiting a decision" };
    }
    // Defense in depth — the approval slot excluding the claimant's own
    // office is already handled at request-creation time, but roles can
    // change between then and now.
    if (!canApprove(memberId, request.memberId)) {
      return { error: "You cannot approve your own request" };
    }

    await tx
      .update(welfareApprovals)
      .set({ status: decision, respondedAt: new Date(), comment: comment || null })
      .where(eq(welfareApprovals.id, approvalRowId));

    if (decision === "declined") {
      // No wider pool to fall back on (only 3 possible officials) — a
      // single decline is a real veto for this tier, not a partial signal.
      await tx
        .update(welfareRequests)
        .set({
          status: "rejected",
          reviewedBy: session.user.id,
          reviewedAt: new Date(),
          rejectionReason: comment || "An official declined to approve this request",
          updatedAt: new Date(),
        })
        .where(eq(welfareRequests.id, request.id));
      await notifyMember(
        tx,
        groupId,
        request.memberId,
        { type: "request_rejected", reason: comment || null },
        request.id,
      );
      return { ok: true } as const;
    }

    const allApprovals = await tx.query.welfareApprovals.findMany({
      where: eq(welfareApprovals.requestId, request.id),
    });
    if (hasAnyDecline(allApprovals)) {
      // Shouldn't happen (a decline already rejects above), kept as a guard.
      return { ok: true } as const;
    }
    if (!isApprovalQuorumMet(request.approvalTier as "tier2" | "tier3", allApprovals)) {
      return { ok: true } as const;
    }

    await tx
      .update(welfareRequests)
      .set({ reviewedBy: session.user.id, reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(welfareRequests.id, request.id));

    const disbursed = await disburseWelfareRequest(
      tx,
      request.id,
      groupId,
      {
        emergency: Number(request.requestedEmergencyAmount),
        longTerm: Number(request.requestedLongTermAmount),
        advance: Number(request.requestedAdvanceAmount),
      },
      session.user.id,
    );
    if ("error" in disbursed) return { error: disbursed.error };

    return { ok: true } as const;
  });

  if ("error" in result) return { error: result.error };
  revalidatePath("/welfare");
  return null;
}

// ── Member/staff: cancel a still-pending request ─────────────────────────
export async function cancelWelfareRequestAction(requestId: number): Promise<void> {
  const session = await requireProduct("welfare");
  const groupId = session.activeMembership.groupId;
  const isStaff = ["admin", "treasurer"].includes(session.activeMembership.role);

  await withTenant(groupId, async (tx) => {
    const request = await tx.query.welfareRequests.findFirst({
      where: and(eq(welfareRequests.id, requestId), eq(welfareRequests.groupId, groupId)),
    });
    if (!request) return;
    if (request.status !== "pending" && request.status !== "under_review") return;
    if (!isStaff && request.memberId !== session.activeMembership.memberId) return;

    await tx
      .update(welfareRequests)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(welfareRequests.id, requestId));
  });

  revalidatePath("/welfare");
}

// ── Staff: record a repayment against a welfare advance ─────────────────
export async function recordAdvanceRepaymentAction(
  advanceId: number,
  formData: FormData,
): Promise<WelfareActionState> {
  const session = await requireProduct("welfare", "admin", "treasurer");
  const parsed = recordAdvanceRepaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { amount, reference } = parsed.data;
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, async (tx) => {
    const advance = await tx.query.welfareAdvances.findFirst({
      where: and(eq(welfareAdvances.id, advanceId), eq(welfareAdvances.groupId, groupId)),
    });
    if (!advance) return;

    await tx.insert(welfareAdvanceRepayments).values({
      groupId,
      advanceId,
      amount: String(amount),
      reference: reference || null,
      recordedBy: session.user.id,
    });

    const newRemaining = Math.max(0, Number(advance.amountRemaining) - amount);
    const newStatus = newRemaining <= 0 ? "paid" : advance.status;

    await tx
      .update(welfareAdvances)
      .set({
        amountRemaining: String(newRemaining),
        status: newStatus,
        clearedDate:
          newStatus === "paid" ? new Date().toISOString().split("T")[0] : advance.clearedDate,
        updatedAt: new Date(),
      })
      .where(eq(welfareAdvances.id, advanceId));

    const fund = await getOrCreateWelfareFund(tx, groupId);
    const credited = applyReserveMovement(Number(fund.advanceBalance), amount, "in", true);
    if (credited.ok) {
      await tx
        .update(welfareFunds)
        .set({
          advanceBalance: String(credited.newBalance),
          lifetimeRecovered: sql`${welfareFunds.lifetimeRecovered} + ${amount}`,
          updatedAt: new Date(),
        })
        .where(eq(welfareFunds.groupId, groupId));

      await tx.insert(welfareLedger).values({
        groupId,
        reserve: "advance",
        entryType: "repayment_in",
        amount: String(amount),
        balanceAfter: String(credited.newBalance),
        relatedAdvanceId: advanceId,
        recordedBy: session.user.id,
      });
    }
  });

  revalidatePath("/welfare");
  revalidatePath("/statement");
  return null;
}

// ── Staff: manual allocation/top-up into a reserve ───────────────────────
export async function allocateToWelfareFundAction(
  formData: FormData,
): Promise<WelfareActionState> {
  const session = await requireProduct("welfare", "admin", "treasurer");
  const parsed = allocateToWelfareFundSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { reserve, amount, note } = parsed.data;
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, async (tx) => {
    const fund = await getOrCreateWelfareFund(tx, groupId);
    const current =
      reserve === "emergency"
        ? Number(fund.emergencyBalance)
        : reserve === "long_term"
          ? Number(fund.longTermBalance)
          : Number(fund.advanceBalance);
    const result = applyReserveMovement(current, amount, "in", true);
    if (!result.ok) return;

    const field =
      reserve === "emergency"
        ? "emergencyBalance"
        : reserve === "long_term"
          ? "longTermBalance"
          : "advanceBalance";

    await tx
      .update(welfareFunds)
      .set({ [field]: String(result.newBalance), updatedAt: new Date() })
      .where(eq(welfareFunds.groupId, groupId));

    await tx.insert(welfareLedger).values({
      groupId,
      reserve,
      entryType: "adjustment_in",
      amount: String(amount),
      balanceAfter: String(result.newBalance),
      note: note || "Manual allocation",
      recordedBy: session.user.id,
    });
  });

  revalidatePath("/welfare");
  return null;
}
