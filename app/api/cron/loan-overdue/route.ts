import { NextResponse } from "next/server";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { isAuthorizedCronRequest, runCronJob } from "@/lib/cron/helpers";
import { withPlatformAdmin } from "@/lib/db/rls";
import { groups, members, loans, fines } from "@/lib/db/schema";

/**
 * Daily at 08:15 Africa/Nairobi (05:15 UTC — see vercel.json). Flags loans
 * past their due date as overdue and applies the group's configured late
 * penalty, re-flagging (and re-penalizing) at most once every 30 days per
 * loan. Each loan is processed in its own row-locked transaction — see
 * app/api/cron/contribution-dues/route.ts for why (one bad row shouldn't
 * roll back another's already-committed penalty).
 */
export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runCronJob("loan-overdue", flagOverdueLoans);

  if (!result.ranJob) {
    return NextResponse.json({ ok: true, skipped: "already running" });
  }
  return NextResponse.json({ ok: !result.error, ...result });
}

async function flagOverdueLoans(): Promise<number> {
  const candidates = await withPlatformAdmin((tx) =>
    tx
      .select({ id: loans.id })
      .from(loans)
      .where(
        and(
          inArray(loans.status, ["active", "extended"]),
          lt(loans.dueDate, sql`current_date`),
          sql`${loans.amountRemaining} > 0`,
          or(
            isNull(loans.overdueFlaggedAt),
            lt(loans.overdueFlaggedAt, sql`now() - interval '30 days'`),
          ),
        ),
      ),
  );

  let count = 0;
  for (const { id } of candidates) {
    const flagged = await withPlatformAdmin(async (tx) => {
      const [loan] = await tx.select().from(loans).where(eq(loans.id, id)).for("update");
      if (!loan) return false;
      if (!["active", "extended"].includes(loan.status)) return false;
      if (Number(loan.amountRemaining) <= 0) return false;

      const group = await tx.query.groups.findFirst({ where: eq(groups.id, loan.groupId) });
      if (!group) return false;
      const penalty = group.loanLatePenalty;

      await tx
        .update(loans)
        .set({
          status: "overdue",
          penaltyTotal: sql`${loans.penaltyTotal} + ${penalty}`,
          amountRemaining: sql`${loans.amountRemaining} + ${penalty}`,
          overdueFlaggedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(loans.id, loan.id));

      await tx.insert(fines).values({
        groupId: loan.groupId,
        memberId: loan.memberId,
        type: "loan_default",
        amount: penalty,
        reason: `Late loan repayment — Loan #${loan.id}`,
      });

      await tx
        .update(members)
        .set({ totalFines: sql`${members.totalFines} + ${penalty}`, updatedAt: new Date() })
        .where(eq(members.id, loan.memberId));

      return true;
    });
    if (flagged) count++;
  }
  return count;
}
