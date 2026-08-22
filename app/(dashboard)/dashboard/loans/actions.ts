"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { requireProduct } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import {
  loans,
  loanApplications,
  loanGuarantors,
  loanRepayments,
  members,
  groups,
  platformPayments,
  groupWallets,
  walletTransactions,
} from "@/lib/db/schema";
import {
  applyForLoanSchema,
  createLoanSchema,
  recordRepaymentSchema,
  reviewApplicationSchema,
  respondToGuaranteeRequestSchema,
} from "@/lib/validation/loans";
import { computeLoanLimit, computeTotalRepayable, defaultDueDate } from "@/lib/domain/loans";
import { computeTransactionFee } from "@/lib/domain/billing";
import { hasMinimumAcceptedGuarantors } from "@/lib/domain/guarantors";
import { evaluateGuarantorEligibility } from "./guarantor-data";

export type LoanActionState = { error: string } | null;

/** Loan statuses that count as "already has an outstanding loan" for the one-loan-at-a-time rule. */
const BLOCKING_STATUSES = ["pending", "active", "extended", "overdue"] as const;

// ── Staff: direct loan approval ─────────────────────────────────────────
export async function createLoanAction(
  _prev: LoanActionState,
  formData: FormData,
): Promise<LoanActionState> {
  const session = await requireProduct("loans", "admin", "treasurer");
  const parsed = createLoanSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { memberId, principal, purpose } = parsed.data;
  const groupId = session.activeMembership.groupId;

  // Optional here — staff are already vouching for this loan directly by
  // creating it, so unlike applyForLoanAction these are recorded as
  // immediately "accepted" (staff-facilitated, same trust level every
  // other staff-direct action in this app already carries) rather than
  // gating creation on a consent round-trip. Still validated for basic
  // sanity (exists, isn't the borrower, not a duplicate) — just not the
  // full eligibility/exposure check self-service applications get.
  const guarantorMemberIds = [
    ...new Set(formData.getAll("guarantorMemberIds").map(Number).filter((id) => Number.isInteger(id) && id > 0)),
  ].filter((id) => id !== memberId);

  const result = await withTenant(groupId, async (tx): Promise<{ error: string } | { ok: true }> => {
    const existing = await tx.query.loans.findFirst({
      where: and(
        eq(loans.memberId, memberId),
        eq(loans.groupId, groupId),
        inArray(loans.status, BLOCKING_STATUSES),
      ),
    });
    if (existing) return { error: "Member already has an outstanding loan" };

    const member = await tx.query.members.findFirst({
      where: and(eq(members.id, memberId), eq(members.groupId, groupId)),
    });
    if (!member) return { error: "Member not found" };
    const group = await tx.query.groups.findFirst({ where: eq(groups.id, groupId) });
    if (!group) return { error: "Group not found" };

    const limit = computeLoanLimit(member, group);
    if (principal > limit) {
      return { error: `Exceeds loan limit of Ksh ${limit.toLocaleString()}` };
    }

    if (guarantorMemberIds.length > 0) {
      const validGuarantors = await tx.query.members.findMany({
        where: and(inArray(members.id, guarantorMemberIds), eq(members.groupId, groupId)),
      });
      if (validGuarantors.length !== guarantorMemberIds.length) {
        return { error: "One of the selected guarantors was not found" };
      }
    }

    const interestRate = Number(group.loanInterestRate);
    const totalRepayable = computeTotalRepayable(principal, interestRate);
    const dueDate = defaultDueDate(new Date(), group.loanRepaymentMonths);

    const [loan] = await tx
      .insert(loans)
      .values({
        groupId,
        memberId,
        principal: String(principal),
        interestRate: String(interestRate),
        totalRepayable: String(totalRepayable),
        amountRemaining: String(totalRepayable),
        status: "active",
        purpose: purpose || null,
        dueDate,
        approvedBy: session.user.id,
      })
      .returning();

    for (const guarantorId of guarantorMemberIds) {
      await tx.insert(loanGuarantors).values({
        groupId,
        loanId: loan.id,
        memberId: guarantorId,
        status: "accepted",
        respondedAt: new Date(),
      });
    }

    return { ok: true } as const;
  });

  if ("error" in result) return { error: result.error };
  revalidatePath("/dashboard/loans");
  return null;
}

// ── Staff: record a repayment ───────────────────────────────────────────
export async function recordRepaymentAction(
  loanId: number,
  formData: FormData,
): Promise<LoanActionState> {
  const session = await requireProduct("loans", "admin", "treasurer");
  const parsed = recordRepaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { amount, reference } = parsed.data;
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, async (tx) => {
    const loan = await tx.query.loans.findFirst({
      where: and(eq(loans.id, loanId), eq(loans.groupId, groupId)),
    });
    if (!loan) return;

    await tx.insert(loanRepayments).values({
      groupId,
      loanId,
      amount: String(amount),
      reference: reference || null,
      recordedBy: session.user.id,
    });

    const newRemaining = Math.max(0, Number(loan.amountRemaining) - amount);
    const newStatus = newRemaining <= 0 ? "cleared" : loan.status;

    await tx
      .update(loans)
      .set({
        amountRemaining: String(newRemaining),
        status: newStatus,
        clearedDate: newStatus === "cleared" ? new Date().toISOString().split("T")[0] : loan.clearedDate,
        updatedAt: new Date(),
      })
      .where(eq(loans.id, loanId));
  });

  revalidatePath("/dashboard/loans");
  revalidatePath("/dashboard/statement");
  return null;
}

// ── Member self-service: apply ──────────────────────────────────────────
export async function applyForLoanAction(
  _prev: LoanActionState,
  formData: FormData,
): Promise<LoanActionState> {
  const session = await requireProduct("loans");
  const memberId = session.activeMembership.memberId;
  if (!memberId) return { error: "No member profile linked to your account" };

  const parsed = applyForLoanSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { amountRequested, purpose, repaymentMonths } = parsed.data;
  const groupId = session.activeMembership.groupId;

  // De-duplicated, self excluded here (also enforced again below via
  // checkGuarantorEligibility's isSelf check — belt and suspenders since
  // this list came from client form data).
  const guarantorMemberIds = [
    ...new Set(formData.getAll("guarantorMemberIds").map(Number).filter((id) => Number.isInteger(id) && id > 0)),
  ].filter((id) => id !== memberId);

  const result = await withTenant(groupId, async (tx): Promise<{ error: string } | { ok: true }> => {
    const existingLoan = await tx.query.loans.findFirst({
      where: and(eq(loans.memberId, memberId), inArray(loans.status, BLOCKING_STATUSES)),
    });
    if (existingLoan) return { error: "You already have an outstanding loan" };

    const existingApp = await tx.query.loanApplications.findFirst({
      where: and(eq(loanApplications.memberId, memberId), eq(loanApplications.status, "pending")),
    });
    if (existingApp) return { error: "You already have a pending application" };

    const member = await tx.query.members.findFirst({ where: eq(members.id, memberId) });
    if (!member) return { error: "Member profile not found" };
    const group = await tx.query.groups.findFirst({ where: eq(groups.id, groupId) });
    if (!group) return { error: "Group not found" };

    const limit = computeLoanLimit(member, group);
    if (amountRequested > limit) {
      return { error: `Exceeds your loan limit of Ksh ${limit.toLocaleString()}` };
    }

    // Validate every proposed guarantor before creating anything — a
    // partially-created application with only some guarantors requested
    // would be confusing to recover from.
    for (const guarantorId of guarantorMemberIds) {
      const eligibility = await evaluateGuarantorEligibility(tx, groupId, memberId, guarantorId);
      if (!eligibility.eligible) {
        return { error: eligibility.reason };
      }
    }

    const [app] = await tx
      .insert(loanApplications)
      .values({
        groupId,
        memberId,
        amountRequested: String(amountRequested),
        purpose: purpose || null,
        repaymentMonths,
      })
      .returning();

    for (const guarantorId of guarantorMemberIds) {
      await tx.insert(loanGuarantors).values({
        groupId,
        applicationId: app.id,
        memberId: guarantorId,
        status: "pending",
      });
    }

    return { ok: true } as const;
  });

  if ("error" in result) return { error: result.error };
  revalidatePath("/dashboard/loans/apply");
  return null;
}

export async function cancelLoanApplicationAction(applicationId: number): Promise<void> {
  const session = await requireProduct("loans");
  const groupId = session.activeMembership.groupId;
  const isStaff = ["admin", "treasurer"].includes(session.activeMembership.role);

  await withTenant(groupId, async (tx) => {
    const app = await tx.query.loanApplications.findFirst({
      where: and(eq(loanApplications.id, applicationId), eq(loanApplications.groupId, groupId)),
    });
    if (!app || app.status !== "pending") return;
    if (!isStaff && app.memberId !== session.activeMembership.memberId) return;

    await tx
      .update(loanApplications)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(loanApplications.id, applicationId));
  });

  revalidatePath("/dashboard/loans/apply");
}

// ── Staff: review an application ────────────────────────────────────────
export async function reviewApplicationAction(
  applicationId: number,
  formData: FormData,
): Promise<LoanActionState> {
  const session = await requireProduct("loans", "admin", "treasurer");
  const parsed = reviewApplicationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { decision, reviewNotes } = parsed.data;
  const groupId = session.activeMembership.groupId;

  const result = await withTenant(groupId, async (tx): Promise<{ error: string } | { ok: true }> => {
    const app = await tx.query.loanApplications.findFirst({
      where: and(eq(loanApplications.id, applicationId), eq(loanApplications.groupId, groupId)),
    });
    if (!app || app.status !== "pending") return { error: "Application already reviewed" };

    let loanId: number | null = null;

    if (decision === "approved") {
      const group = await tx.query.groups.findFirst({ where: eq(groups.id, groupId) });
      if (!group) return { error: "Group not found" };

      const appGuarantors = await tx.query.loanGuarantors.findMany({
        where: eq(loanGuarantors.applicationId, applicationId),
      });
      if (!hasMinimumAcceptedGuarantors(appGuarantors, group.loanMinGuarantors)) {
        const accepted = appGuarantors.filter((g) => g.status === "accepted").length;
        return {
          error: `Needs ${group.loanMinGuarantors} accepted guarantor(s), has ${accepted} — waiting on the rest to respond`,
        };
      }

      const principal = Number(app.amountRequested);
      const interestRate = Number(group.loanInterestRate);
      const totalRepayable = computeTotalRepayable(principal, interestRate);
      const dueDate = defaultDueDate(new Date(), app.repaymentMonths);

      const [loan] = await tx
        .insert(loans)
        .values({
          groupId,
          memberId: app.memberId,
          principal: String(principal),
          interestRate: String(interestRate),
          totalRepayable: String(totalRepayable),
          amountRemaining: String(totalRepayable),
          status: "active",
          purpose: app.purpose,
          dueDate,
          approvedBy: session.user.id,
        })
        .returning();
      loanId = loan.id;

      // Re-point the same guarantor rows at the new loan rather than
      // creating fresh ones — the acceptance record (who agreed, when)
      // carries over intact instead of being re-requested.
      if (appGuarantors.length > 0) {
        await tx
          .update(loanGuarantors)
          .set({ loanId })
          .where(eq(loanGuarantors.applicationId, applicationId));
      }
    }

    await tx
      .update(loanApplications)
      .set({
        status: decision,
        reviewedBy: session.user.id,
        reviewedAt: new Date(),
        reviewNotes: reviewNotes || null,
        loanId,
        updatedAt: new Date(),
      })
      .where(eq(loanApplications.id, applicationId));

    return { ok: true } as const;
  });

  if ("error" in result) return { error: result.error };
  revalidatePath("/dashboard/loans");
  return null;
}

// ── Staff: charge the platform's disbursement fee ───────────────────────
// Same pattern as mgr/actions.ts's chargeFeeFromWalletAction — the loan
// principal itself is disbursed outside the app (cash/M-Pesa directly to
// the member), so this charges a separate service fee, computed by
// lib/domain/billing.ts's computeTransactionFee, either instantly from the
// prepaid wallet or via a fresh STK push (see /api/payments/loan-fee for
// the STK path).
export async function chargeLoanFeeFromWalletAction(
  loanId: number,
): Promise<{ error: string } | { ok: true; fee: number }> {
  const session = await requireProduct("loans", "admin", "treasurer");
  const groupId = session.activeMembership.groupId;

  const result = await withTenant(groupId, async (tx) => {
    const loan = await tx.query.loans.findFirst({
      where: and(eq(loans.id, loanId), eq(loans.groupId, groupId)),
    });
    if (!loan) return { error: "Loan not found" as const };

    const existingFee = await tx.query.platformPayments.findFirst({
      where: and(
        eq(platformPayments.loanId, loanId),
        eq(platformPayments.type, "loan_fee"),
        eq(platformPayments.status, "paid"),
      ),
    });
    if (existingFee) {
      return { error: "This loan's disbursement fee has already been charged" as const };
    }

    const fee = computeTransactionFee("loan_disbursement", Number(loan.principal));

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
        loanId,
        amount: String(fee),
        status: "paid",
        type: "loan_fee",
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
      note: `Loan disbursement fee — loan #${loanId}`,
    });

    return { ok: true as const, fee };
  });

  if ("ok" in result) {
    revalidatePath("/dashboard/loans");
    revalidatePath("/dashboard/wallet");
  }
  return result;
}

// ── Member: respond to a guarantee request ───────────────────────────────
export async function respondToGuaranteeRequestAction(
  guarantorRowId: number,
  formData: FormData,
): Promise<LoanActionState> {
  const session = await requireProduct("loans");
  const memberId = session.activeMembership.memberId;
  if (!memberId) return { error: "No member profile linked to your account" };

  const parsed = respondToGuaranteeRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { decision } = parsed.data;
  const groupId = session.activeMembership.groupId;

  const result = await withTenant(groupId, async (tx): Promise<{ error: string } | { ok: true }> => {
    const row = await tx.query.loanGuarantors.findFirst({
      where: and(eq(loanGuarantors.id, guarantorRowId), eq(loanGuarantors.groupId, groupId)),
    });
    if (!row) return { error: "Request not found" };
    if (row.memberId !== memberId) return { error: "This request isn't yours to respond to" };
    if (row.status !== "pending") return { error: "This request has already been responded to" };
    if (!row.applicationId) return { error: "This request is no longer pending" };

    const application = await tx.query.loanApplications.findFirst({
      where: eq(loanApplications.id, row.applicationId),
    });
    if (!application || application.status !== "pending") {
      return { error: "The loan application this was for is no longer pending" };
    }

    // Re-checked here, not just at request time — exposure can have
    // changed since the borrower first asked (e.g. this member accepted
    // another guarantee, or their own loan went overdue, in between).
    if (decision === "accepted") {
      const eligibility = await evaluateGuarantorEligibility(tx, groupId, application.memberId, memberId);
      if (!eligibility.eligible) return { error: eligibility.reason };
    }

    await tx
      .update(loanGuarantors)
      .set({ status: decision, respondedAt: new Date() })
      .where(eq(loanGuarantors.id, guarantorRowId));

    return { ok: true } as const;
  });

  if ("error" in result) return { error: result.error };
  revalidatePath("/dashboard/loans/apply");
  revalidatePath("/dashboard/loans");
  return null;
}
