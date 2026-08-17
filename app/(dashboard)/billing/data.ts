import { and, eq, gte, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import { members, contributions, loans, loanRepayments, mgrSlots, groups } from "@/lib/db/schema";
import type { ActiveVehicles } from "@/lib/domain/billing";

export type GroupBillingInputs = {
  activeMembers: number;
  vehicles: ActiveVehicles;
  annualGrossFlow: number;
};

/**
 * Trailing 12 months, matching lib/domain/billing.ts's "annual financial
 * activity" definition exactly: gross, not netted — contributions +
 * loan disbursements + loan repayments + MGR payouts. Shared between the
 * live quote shown on /billing and the frozen snapshot generateInvoiceAction
 * writes into subscription_invoices, so the two can never silently diverge.
 */
export async function computeGroupBillingInputs(tx: Tx, groupId: number): Promise<GroupBillingInputs> {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  // Local-component formatting, not toISOString() — see generateInvoiceAction's
  // toLocalDateString for why: a UTC round-trip can shift this by a day in a
  // timezone ahead of UTC, exactly the bug class documented in
  // docs/architecture.md's Phase 5 notes.
  const cutoffDateStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;

  // Sequential, not Promise.all — concurrent queries against the same `tx`
  // aren't guaranteed to share the transaction-local SET LOCAL context that
  // withTenant relies on for RLS (see docs/architecture.md's RLS notes);
  // running them one at a time keeps every query on the same session state.
  const group = await tx.query.groups.findFirst({ where: eq(groups.id, groupId) });
  const memberCountRow = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(members)
    .where(and(eq(members.groupId, groupId), eq(members.active, true)))
    .then((rows) => rows[0].count);
  const contributionsTotal = await tx
    .select({ total: sql<string>`coalesce(sum(${contributions.amount}), 0)` })
    .from(contributions)
    .where(
      and(
        eq(contributions.groupId, groupId),
        eq(contributions.status, "paid"),
        gte(contributions.createdAt, cutoff),
      ),
    )
    .then((rows) => rows[0].total);
  const loanDisbursedTotal = await tx
    .select({ total: sql<string>`coalesce(sum(${loans.principal}), 0)` })
    .from(loans)
    .where(and(eq(loans.groupId, groupId), gte(loans.issuedDate, cutoffDateStr)))
    .then((rows) => rows[0].total);
  const repaymentsTotal = await tx
    .select({ total: sql<string>`coalesce(sum(${loanRepayments.amount}), 0)` })
    .from(loanRepayments)
    .where(and(eq(loanRepayments.groupId, groupId), gte(loanRepayments.createdAt, cutoff)))
    .then((rows) => rows[0].total);
  const mgrPayoutsTotal = await tx
    .select({ total: sql<string>`coalesce(sum(${mgrSlots.payoutAmount}), 0)` })
    .from(mgrSlots)
    .where(and(eq(mgrSlots.groupId, groupId), eq(mgrSlots.status, "paid"), gte(mgrSlots.paidAt, cutoff)))
    .then((rows) => rows[0].total);

  if (!group) throw new Error("Group not found");

  return {
    activeMembers: memberCountRow,
    vehicles: {
      welfare: group.welfareEnabled,
      investment: group.projectsEnabled,
      tableBanking: group.loansEnabled,
    },
    annualGrossFlow:
      Number(contributionsTotal) + Number(loanDisbursedTotal) + Number(repaymentsTotal) + Number(mgrPayoutsTotal),
  };
}
