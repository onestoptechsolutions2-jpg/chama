import { and, eq, inArray, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import { loanGuarantors, loans, loanApplications, members } from "@/lib/db/schema";
import { checkGuarantorEligibility, type GuarantorEligibilityResult } from "@/lib/domain/guarantors";

/** Same statuses actions.ts's BLOCKING_STATUSES uses for "still outstanding." */
const OUTSTANDING_LOAN_STATUSES = ["pending", "active", "extended", "overdue"] as const;

/**
 * How many loans this member is currently an *accepted* guarantor for —
 * checked against MAX_CONCURRENT_GUARANTEES (lib/domain/guarantors.ts)
 * whenever a new guarantee is requested or accepted. Covers both an
 * already-issued loan still outstanding, and an accepted guarantee on an
 * application that hasn't been approved yet (both are real commitments —
 * the application could still become a live loan).
 *
 * Two sequential queries, not Promise.all — see app/(dashboard)/billing/data.ts
 * for why concurrent queries inside one withTenant transaction are unsafe.
 */
export async function getGuarantorExposureCount(
  tx: Tx,
  groupId: number,
  memberId: number,
): Promise<number> {
  const loanBased = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(loanGuarantors)
    .innerJoin(loans, eq(loanGuarantors.loanId, loans.id))
    .where(
      and(
        eq(loanGuarantors.groupId, groupId),
        eq(loanGuarantors.memberId, memberId),
        eq(loanGuarantors.status, "accepted"),
        inArray(loans.status, OUTSTANDING_LOAN_STATUSES),
      ),
    );

  const appBased = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(loanGuarantors)
    .innerJoin(loanApplications, eq(loanGuarantors.applicationId, loanApplications.id))
    .where(
      and(
        eq(loanGuarantors.groupId, groupId),
        eq(loanGuarantors.memberId, memberId),
        eq(loanGuarantors.status, "accepted"),
        eq(loanApplications.status, "pending"),
      ),
    );

  return loanBased[0].count + appBased[0].count;
}

/**
 * Composes the DB lookups checkGuarantorEligibility (lib/domain/guarantors.ts)
 * needs for one prospective/responding guarantor — shared by
 * applyForLoanAction (validating each candidate the borrower picked) and
 * respondToGuaranteeRequestAction (re-validating at the moment of accepting,
 * since exposure can have changed since the request was made).
 */
export async function evaluateGuarantorEligibility(
  tx: Tx,
  groupId: number,
  borrowerMemberId: number,
  candidateMemberId: number,
): Promise<GuarantorEligibilityResult> {
  const candidate = await tx.query.members.findFirst({
    where: and(eq(members.id, candidateMemberId), eq(members.groupId, groupId)),
  });
  if (!candidate) return { eligible: false, reason: "Member not found" };

  const ownOverdueLoan = await tx.query.loans.findFirst({
    where: and(eq(loans.memberId, candidateMemberId), eq(loans.status, "overdue")),
  });
  const currentGuaranteeCount = await getGuarantorExposureCount(tx, groupId, candidateMemberId);

  return checkGuarantorEligibility({
    isSelf: candidateMemberId === borrowerMemberId,
    isActiveMember: candidate.active,
    hasOwnOverdueLoan: !!ownOverdueLoan,
    currentGuaranteeCount,
  });
}
