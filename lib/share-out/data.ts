import "server-only";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import { contributions, fines, loanRepayments, loans, members } from "@/lib/db/schema";
import { nairobiDate } from "@/lib/domain/dates";
import { computeShareOut, interestPortion, type ShareOutMethod } from "@/lib/domain/share-out";

const SAVINGS_TYPES = ["capital", "personal_savings"] as const;
const OPEN_LOAN = ["active", "extended", "overdue"] as const;

export type ShareOutParams = {
  from: string;
  to: string;
  method: ShareOutMethod;
  otherIncome: number;
  expenses: number;
  keepShares: boolean;
};

/**
 * Reads the group's records for a period and works out the share-out. The
 * page previews it, and confirming re-runs it, so what is confirmed is
 * exactly what the records say at that moment.
 */
export async function loadShareOut(tx: Tx, groupId: number, p: ShareOutParams) {
  // Period bounds as instants in Nairobi time.
  const start = new Date(`${p.from}T00:00:00+03:00`);
  const end = new Date(`${p.to}T23:59:59+03:00`);
  const roster = await tx.query.members.findMany({
    where: and(eq(members.groupId, groupId), eq(members.active, true)),
    orderBy: (m, { asc }) => [asc(m.name)],
  });
  const deposits = await tx
    .select({ memberId: contributions.memberId, amount: contributions.amount, createdAt: contributions.createdAt })
    .from(contributions)
    .where(and(eq(contributions.groupId, groupId), inArray(contributions.type, [...SAVINGS_TYPES]), gte(contributions.createdAt, start)));
  const openLoans = await tx
    .select({ memberId: loans.memberId, remaining: sql<string>`sum(${loans.amountRemaining})` })
    .from(loans)
    .where(and(eq(loans.groupId, groupId), inArray(loans.status, [...OPEN_LOAN])))
    .groupBy(loans.memberId);
  const repaid = await tx
    .select({ amount: loanRepayments.amount, principal: loans.principal, total: loans.totalRepayable })
    .from(loanRepayments)
    .innerJoin(loans, eq(loans.id, loanRepayments.loanId))
    .where(and(eq(loanRepayments.groupId, groupId), gte(loanRepayments.createdAt, start), lte(loanRepayments.createdAt, end)));
  const [finesPaid] = await tx
    .select({ total: sql<string>`coalesce(sum(${fines.amount}), 0)` })
    .from(fines)
    .where(and(eq(fines.groupId, groupId), eq(fines.status, "paid"), gte(fines.updatedAt, start), lte(fines.updatedAt, end)));

  const finesCollected = Number(finesPaid?.total ?? 0);
  const loanByMember = new Map(openLoans.map((l) => [l.memberId, Number(l.remaining)]));
  const interestEarned = repaid.reduce((s, r) => s + interestPortion(Number(r.amount), Number(r.principal), Number(r.total)), 0);
  const result = computeShareOut({
    periodStart: p.from,
    periodEnd: p.to,
    method: p.method,
    otherIncome: p.otherIncome,
    expenses: p.expenses,
    finesCollected,
    interestEarned,
    members: roster.map((m) => {
      const mine = deposits.filter((d) => d.memberId === m.id);
      const inPeriod = mine.filter((d) => d.createdAt <= end).map((d) => ({ date: nairobiDate(d.createdAt), amount: Number(d.amount) }));
      const sinceStart = mine.reduce((s, d) => s + Number(d.amount), 0);
      const now = Number(m.capital) + Number(m.personalSavings);
      const opening = Math.max(0, now - sinceStart);
      return {
        memberId: m.id,
        name: m.name,
        openingSavings: opening,
        deposits: inPeriod,
        savings: opening + inPeriod.reduce((s, d) => s + d.amount, 0),
        loanBalance: loanByMember.get(m.id) ?? 0,
        unpaidFines: Number(m.totalFines),
        sharesKept: p.keepShares ? Number(m.capital) : 0,
      };
    }),
  });
  const fineByMember = new Map(roster.map((m) => [m.id, Number(m.totalFines)]));
  return { result, interestEarned, finesCollected, loanByMember, fineByMember };
}
