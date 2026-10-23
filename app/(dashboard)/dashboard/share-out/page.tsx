import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { withTenant } from "@/lib/db/rls";
import { contributions, fines, loanRepayments, loans, members } from "@/lib/db/schema";
import { nairobiDate, nairobiToday } from "@/lib/domain/dates";
import { computeShareOut, interestPortion, type ShareOutMethod } from "@/lib/domain/share-out";
import { PageHeader } from "@/components/feature/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PrintButton } from "@/components/feature/print-button";

const SAVINGS_TYPES = ["capital", "personal_savings"] as const;
const OPEN_LOAN = ["active", "extended", "overdue"] as const;
const ksh = (n: number) => `Ksh ${Math.round(n).toLocaleString()}`;
const isDate = (v: string | undefined) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function ShareOutPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; method?: string; other?: string; expenses?: string }>;
}) {
  const session = await requirePermission("shareout.view");
  const groupId = session.activeMembership.groupId;
  const seeAll = can(session.activeMembership, "reports.view");
  const sp = await searchParams;
  const today = nairobiToday();
  const from = isDate(sp.from) ? sp.from! : `${today.slice(0, 4)}-01-01`;
  const to = isDate(sp.to) ? sp.to! : today;
  const method: ShareOutMethod = sp.method === "savings" ? "savings" : "time";
  const otherIncome = Math.max(0, Number(sp.other) || 0);
  const expenses = Math.max(0, Number(sp.expenses) || 0);
  // Period bounds as instants in Nairobi time.
  const start = new Date(`${from}T00:00:00+03:00`);
  const end = new Date(`${to}T23:59:59+03:00`);

  const data = await withTenant(groupId, async (tx) => {
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
    return { roster, deposits, openLoans, repaid, finesCollected: Number(finesPaid?.total ?? 0) };
  });

  const loanByMember = new Map(data.openLoans.map((l) => [l.memberId, Number(l.remaining)]));
  const interestEarned = data.repaid.reduce((s, r) => s + interestPortion(Number(r.amount), Number(r.principal), Number(r.total)), 0);
  const result = computeShareOut({
    periodStart: from,
    periodEnd: to,
    method,
    otherIncome,
    expenses,
    finesCollected: data.finesCollected,
    interestEarned,
    members: data.roster.map((m) => {
      const mine = data.deposits.filter((d) => d.memberId === m.id);
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
      };
    }),
  });
  const myId = session.activeMembership.memberId;
  const lines = seeAll ? result.lines : result.lines.filter((l) => l.memberId === myId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Share-out"
        description="What each member takes home: savings plus their share of what the group earned, less what they owe."
      />
      <Card className="print:hidden">
        <CardContent className="pt-6">
          <form className="grid gap-3 sm:grid-cols-5 sm:items-end">
            <div className="space-y-1">
              <Label htmlFor="from">From</Label>
              <Input id="from" name="from" type="date" defaultValue={from} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to">To</Label>
              <Input id="to" name="to" type="date" defaultValue={to} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="other">Other income (Ksh)</Label>
              <Input id="other" name="other" type="number" min="0" defaultValue={otherIncome || ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="expenses">Expenses (Ksh)</Label>
              <Input id="expenses" name="expenses" type="number" min="0" defaultValue={expenses || ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="method">Share earnings by</Label>
              <select id="method" name="method" defaultValue={method} className="h-10 w-full rounded-md border bg-background px-2 text-sm">
                <option value="time">Savings × time saved</option>
                <option value="savings">Savings at the end</option>
              </select>
            </div>
            <Button type="submit" variant="outline" className="sm:col-span-5 sm:justify-self-start">
              Work it out
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Loan interest", interestEarned],
          ["Fines collected", data.finesCollected],
          ["Earnings to share", result.profit],
          ["Total to pay out", result.totals.payout],
        ].map(([label, value]) => (
          <Card key={label as string}>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold tabular-nums">{ksh(value as number)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">
            {seeAll ? `Members (${lines.length})` : "Your share-out"} · {from} to {to}
          </CardTitle>
          <PrintButton />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2">Member</th>
                <th className="text-right">Savings</th>
                <th className="text-right">Share</th>
                <th className="text-right">Earnings</th>
                <th className="text-right">Loans + fines</th>
                <th className="text-right">Takes home</th>
              </tr>
            </thead>
            <tbody className="divide-y tabular-nums">
              {lines.map((l) => (
                <tr key={l.memberId}>
                  <td className="py-2">{l.name}</td>
                  <td className="text-right">{ksh(l.savings)}</td>
                  <td className="text-right">{l.weightPct}%</td>
                  <td className="text-right">{ksh(l.earnings)}</td>
                  <td className="text-right">{l.deductions ? `− ${ksh(l.deductions)}` : "—"}</td>
                  <td className="text-right font-semibold">
                    {ksh(l.payout)}
                    {l.stillOwes > 0 && <span className="block text-xs text-destructive">still owes {ksh(l.stillOwes)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            {seeAll && (
              <tfoot className="font-semibold tabular-nums">
                <tr>
                  <td className="py-2">Total</td>
                  <td className="text-right">{ksh(result.totals.savings)}</td>
                  <td />
                  <td className="text-right">{ksh(result.totals.earnings)}</td>
                  <td className="text-right">− {ksh(result.totals.deductions)}</td>
                  <td className="text-right">{ksh(result.totals.payout)}</td>
                </tr>
              </tfoot>
            )}
          </table>
          {result.roundingLeftover > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {ksh(result.roundingLeftover)} left over from rounding stays with the group.
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            A preview from the group&apos;s records — nothing is paid or changed here. Pay members outside the app, then record it.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
