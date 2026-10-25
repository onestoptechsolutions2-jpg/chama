import "server-only";
import { z } from "zod";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { fines, loans, members, shareOutLines, shareOuts } from "@/lib/db/schema";
import { nairobiToday } from "@/lib/domain/dates";
import { loadShareOut } from "@/lib/share-out/data";
import { applyRepayment } from "./loans";
import { defineCommand, done, fail } from "./types";

/**
 * The year-end share-out, recorded. One official prepares it (a draft with
 * every member's line); a different official confirms. Confirming re-reads
 * the records and refuses if anything changed, then, in one transaction,
 * for each member:
 *   share = savings − shares kept + earnings
 *   → settles open loans (oldest due first), then whole unpaid fines
 *   → takes home what is left; anything not covered stays owed
 *   → savings go down by what was paid out (deposits made after the period
 *     stay), shares stay when the group keeps them.
 * The money itself is paid outside the app (cash/M-Pesa); this is the record.
 */

const OPEN_LOAN = ["active", "extended", "overdue"] as const;
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

export const prepareShareOut = defineCommand({
  name: "shareout.prepare",
  description: "Prepare the year-end share-out for a period (another official confirms it).",
  permission: "shareout.manage",
  input: z.object({
    from: ymd,
    to: ymd,
    method: z.enum(["time", "savings"]),
    otherIncome: z.coerce.number().min(0).default(0),
    expenses: z.coerce.number().min(0).default(0),
    keepShares: z.boolean().default(false),
  }),
  run: async (tx, actor, input) => {
    if (input.to < input.from) return fail("The period ends before it starts");
    if (input.to > nairobiToday()) return fail("The period can't end in the future — share out on or after its last day");
    const last = await tx.query.shareOuts.findFirst({
      where: and(eq(shareOuts.groupId, actor.groupId), eq(shareOuts.status, "completed")),
      orderBy: [desc(shareOuts.periodEnd)],
    });
    if (last && input.from <= last.periodEnd) return fail(`The last share-out covered up to ${last.periodEnd}; start after that`);

    const { result, interestEarned, finesCollected } = await loadShareOut(tx, actor.groupId, input);
    if (result.lines.length === 0) return fail("No members to share out to");

    // One draft at a time.
    await tx
      .update(shareOuts)
      .set({ status: "cancelled" })
      .where(and(eq(shareOuts.groupId, actor.groupId), eq(shareOuts.status, "draft")));
    const [so] = await tx
      .insert(shareOuts)
      .values({
        groupId: actor.groupId,
        periodStart: input.from,
        periodEnd: input.to,
        method: input.method,
        keepShares: input.keepShares,
        interestEarned: String(interestEarned),
        finesCollected: String(finesCollected),
        otherIncome: String(input.otherIncome),
        expenses: String(input.expenses),
        profit: String(result.profit),
        totalPayout: String(result.totals.payout),
        preparedBy: actor.userId,
      })
      .returning({ id: shareOuts.id });
    for (const l of result.lines) {
      await tx.insert(shareOutLines).values({
        groupId: actor.groupId,
        shareOutId: so.id,
        memberId: l.memberId,
        savings: String(l.savings),
        earnings: String(l.earnings),
        sharesKept: String(l.sharesKept),
        payout: String(l.payout),
        stillOwes: String(l.stillOwes),
      });
    }
    return done({ shareOutId: so.id, totalPayout: result.totals.payout, members: result.lines.length });
  },
});

export const confirmShareOut = defineCommand({
  name: "shareout.confirm",
  description: "Confirm a prepared share-out: settle loans and fines from each share and pay out savings.",
  permission: "shareout.manage",
  movesMoney: true,
  input: z.object({ shareOutId: z.coerce.number().int().positive() }),
  run: async (tx, actor, input) => {
    const [so] = await tx
      .select()
      .from(shareOuts)
      .where(and(eq(shareOuts.id, input.shareOutId), eq(shareOuts.groupId, actor.groupId)))
      .for("update");
    if (!so) return fail("Share-out not found", 404);
    if (so.status !== "draft") return fail("This share-out is not waiting for confirmation");
    if (actor.userId === null || so.preparedBy === actor.userId) {
      return fail("Another official must confirm a share-out you prepared", 403);
    }

    const { result } = await loadShareOut(tx, actor.groupId, {
      from: so.periodStart,
      to: so.periodEnd,
      method: so.method === "savings" ? "savings" : "time",
      otherIncome: Number(so.otherIncome),
      expenses: Number(so.expenses),
      keepShares: so.keepShares,
    });
    const drafted = await tx.query.shareOutLines.findMany({ where: eq(shareOutLines.shareOutId, so.id) });
    const draftedBy = new Map(drafted.map((l) => [l.memberId, l]));
    const changed =
      drafted.length !== result.lines.length ||
      result.lines.some((l) => {
        const d = draftedBy.get(l.memberId);
        return !d || Number(d.payout) !== l.payout || Number(d.earnings) !== l.earnings || Number(d.savings) !== l.savings;
      });
    if (changed) return fail("The group's records changed since this was prepared (new payments, loans or fines). Prepare it again.");

    const reference = `Share-out ${so.periodStart} to ${so.periodEnd}`;
    let totalPayout = 0;
    for (const l of result.lines) {
      let available = l.savings - l.sharesKept + l.earnings;

      // Loans first, oldest due first.
      let loanDeducted = 0;
      const open = await tx.query.loans.findMany({
        where: and(eq(loans.groupId, actor.groupId), eq(loans.memberId, l.memberId), inArray(loans.status, [...OPEN_LOAN])),
        orderBy: [asc(loans.dueDate), asc(loans.id)],
      });
      let loanLeft = 0;
      for (const loan of open) {
        const owed = Number(loan.amountRemaining);
        const pay = Math.min(owed, available);
        if (pay > 0) {
          const r = await applyRepayment(tx, actor, { loanId: loan.id, amount: pay, reference }, { shareOut: true });
          if (!r.ok) return r;
          available -= pay;
          loanDeducted += pay;
        }
        loanLeft += owed - pay;
      }

      // Then whole fines, oldest first.
      let finesDeducted = 0;
      const pending = await tx.query.fines.findMany({
        where: and(eq(fines.groupId, actor.groupId), eq(fines.memberId, l.memberId), eq(fines.status, "pending")),
        orderBy: [asc(fines.createdAt), asc(fines.id)],
      });
      let finesLeft = 0;
      for (const f of pending) {
        const amount = Number(f.amount);
        if (amount <= available) {
          await tx.update(fines).set({ status: "paid", updatedAt: new Date() }).where(eq(fines.id, f.id));
          available -= amount;
          finesDeducted += amount;
        } else finesLeft += amount;
      }
      if (finesDeducted > 0) {
        await tx
          .update(members)
          .set({ totalFines: sql`${members.totalFines} - ${finesDeducted}`, updatedAt: new Date() })
          .where(eq(members.id, l.memberId));
      }

      // Savings go down by what was paid out; deposits after the period stay.
      const paidOutSavings = l.savings - l.sharesKept;
      if (paidOutSavings > 0) {
        await tx
          .update(members)
          .set({
            personalSavings: sql`greatest(0, ${members.personalSavings} - ${paidOutSavings})`,
            capital: so.keepShares
              ? members.capital
              : sql`greatest(0, ${members.capital} - greatest(0, ${paidOutSavings} - ${members.personalSavings}))`,
            updatedAt: new Date(),
          })
          .where(eq(members.id, l.memberId));
      }

      const payout = Math.max(0, Math.round(available * 100) / 100);
      totalPayout += payout;
      await tx
        .update(shareOutLines)
        .set({
          loanDeducted: String(loanDeducted),
          finesDeducted: String(finesDeducted),
          payout: String(payout),
          stillOwes: String(Math.round((loanLeft + finesLeft) * 100) / 100),
        })
        .where(and(eq(shareOutLines.shareOutId, so.id), eq(shareOutLines.memberId, l.memberId)));
    }

    await tx
      .update(shareOuts)
      .set({ status: "completed", confirmedBy: actor.userId, confirmedAt: new Date(), totalPayout: String(totalPayout) })
      .where(eq(shareOuts.id, so.id));
    return done({ shareOutId: so.id, totalPayout, members: result.lines.length });
  },
});

export const cancelShareOut = defineCommand({
  name: "shareout.cancel",
  description: "Cancel a prepared share-out that hasn't been confirmed.",
  permission: "shareout.manage",
  input: z.object({ shareOutId: z.coerce.number().int().positive() }),
  run: async (tx, actor, input) => {
    const updated = await tx
      .update(shareOuts)
      .set({ status: "cancelled" })
      .where(and(eq(shareOuts.id, input.shareOutId), eq(shareOuts.groupId, actor.groupId), eq(shareOuts.status, "draft")))
      .returning({ id: shareOuts.id });
    return updated.length ? done({ shareOutId: input.shareOutId }) : fail("Only a share-out waiting for confirmation can be cancelled");
  },
});
