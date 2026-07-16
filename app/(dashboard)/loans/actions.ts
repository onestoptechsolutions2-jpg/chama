"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { requireProduct } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { loans, loanApplications, loanRepayments, members, groups } from "@/lib/db/schema";
import {
  applyForLoanSchema,
  createLoanSchema,
  recordRepaymentSchema,
  reviewApplicationSchema,
} from "@/lib/validation/loans";
import { computeLoanLimit, computeTotalRepayable, defaultDueDate } from "@/lib/domain/loans";

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

    const interestRate = Number(group.loanInterestRate);
    const totalRepayable = computeTotalRepayable(principal, interestRate);
    const dueDate = defaultDueDate(new Date(), group.loanRepaymentMonths);

    await tx.insert(loans).values({
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
    });

    return { ok: true } as const;
  });

  if ("error" in result) return { error: result.error };
  revalidatePath("/loans");
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

  revalidatePath("/loans");
  revalidatePath("/statement");
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

    await tx.insert(loanApplications).values({
      groupId,
      memberId,
      amountRequested: String(amountRequested),
      purpose: purpose || null,
      repaymentMonths,
    });

    return { ok: true } as const;
  });

  if ("error" in result) return { error: result.error };
  revalidatePath("/loans/apply");
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

  revalidatePath("/loans/apply");
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
  revalidatePath("/loans");
  return null;
}
