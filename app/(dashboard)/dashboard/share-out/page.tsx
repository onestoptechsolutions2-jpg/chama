import { and, desc, eq, inArray } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { withTenant } from "@/lib/db/rls";
import { db } from "@/lib/db/client";
import { shareOutLines, shareOuts, users } from "@/lib/db/schema";
import { addDays, nairobiToday } from "@/lib/domain/dates";
import type { ShareOutMethod } from "@/lib/domain/share-out";
import { loadShareOut } from "@/lib/share-out/data";
import { PageHeader } from "@/components/feature/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PrintButton } from "@/components/feature/print-button";
import { DraftShareOutButtons, PrepareShareOutButton } from "@/components/feature/share-out-actions";

const ksh = (n: number) => `Ksh ${Math.round(n).toLocaleString()}`;
const isDate = (v: string | undefined) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function ShareOutPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; method?: string; other?: string; expenses?: string; keep?: string }>;
}) {
  const session = await requirePermission("shareout.view");
  const groupId = session.activeMembership.groupId;
  const seeAll = can(session.activeMembership, "reports.view");
  const canManage = can(session.activeMembership, "shareout.manage");
  const myId = session.activeMembership.memberId;
  const sp = await searchParams;
  const today = nairobiToday();

  const { history, draft, draftLines, last } = await withTenant(groupId, async (tx) => {
    const history = await tx.query.shareOuts.findMany({
      where: and(eq(shareOuts.groupId, groupId), inArray(shareOuts.status, ["completed", "draft"])),
      orderBy: [desc(shareOuts.periodEnd)],
    });
    const draft = history.find((s) => s.status === "draft") ?? null;
    const draftLines = draft ? await tx.query.shareOutLines.findMany({ where: eq(shareOutLines.shareOutId, draft.id) }) : [];
    return { history: history.filter((s) => s.status === "completed"), draft, draftLines, last: history.find((s) => s.status === "completed") ?? null };
  });

  // A new period starts the day after the last confirmed share-out.
  const defaultFrom = last ? addDays(last.periodEnd, 1) : `${today.slice(0, 4)}-01-01`;
  const from = isDate(sp.from) ? sp.from! : defaultFrom;
  const to = isDate(sp.to) ? sp.to! : today;
  const method: ShareOutMethod = sp.method === "savings" ? "savings" : "time";
  const otherIncome = Math.max(0, Number(sp.other) || 0);
  const expenses = Math.max(0, Number(sp.expenses) || 0);
  const keepShares = sp.keep === "1";
  // Right after a share-out the next period hasn't begun yet.
  const notStarted = from > to;

  const { result, interestEarned, finesCollected } = await withTenant(groupId, (tx) =>
    loadShareOut(tx, groupId, { from, to, method, otherIncome, expenses, keepShares }),
  );
  const lines = seeAll ? result.lines : result.lines.filter((l) => l.memberId === myId);

  const historyLines =
    history.length > 0
      ? await withTenant(groupId, (tx) =>
          tx.query.shareOutLines.findMany({
            where: and(
              inArray(
                shareOutLines.shareOutId,
                history.map((h) => h.id),
              ),
              ...(seeAll || !myId ? [] : [eq(shareOutLines.memberId, myId)]),
            ),
          }),
        )
      : [];
  const preparerName = draft?.preparedBy
    ? (await db.query.users.findFirst({ where: eq(users.id, draft.preparedBy), columns: { name: true } }))?.name ?? "an official"
    : null;
  const draftTotal = draftLines.reduce((s, l) => s + Number(l.payout), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Share-out"
        description="What each member takes home: savings plus their share of what the group earned, less what they owe."
      />

      {draft && (
        <Card className="border-primary/50">
          <CardHeader>
            <CardTitle className="text-base">Waiting for confirmation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              {preparerName} prepared the share-out for {draft.periodStart} to {draft.periodEnd}: {ksh(draftTotal)} to pay out to{" "}
              {draftLines.length} members{draft.keepShares ? ", members keep their shares" : ""}. A different official confirms it — loans and
              fines are then settled from each share and savings are paid out.
            </p>
            {canManage && (
              <DraftShareOutButtons shareOutId={draft.id} canConfirm={draft.preparedBy !== session.user.id} />
            )}
            {canManage && draft.preparedBy === session.user.id && (
              <p className="text-xs text-muted-foreground">You prepared it, so another official must confirm.</p>
            )}
          </CardContent>
        </Card>
      )}

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
            <label className="flex items-center gap-2 text-sm sm:col-span-5">
              <input type="checkbox" name="keep" value="1" defaultChecked={keepShares} className="size-4" />
              Members keep their shares in the group (pay out savings and earnings only)
            </label>
            <Button type="submit" variant="outline" className="sm:col-span-5 sm:justify-self-start">
              Work it out
            </Button>
          </form>
        </CardContent>
      </Card>

      {notStarted ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            {last ? `The last share-out covered up to ${last.periodEnd}. ` : ""}The next period starts on {from}; its share-out can be worked out
            from then.
          </CardContent>
        </Card>
      ) : (
      <>
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Loan interest", interestEarned],
          ["Fines collected", finesCollected],
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
                {keepShares && <th className="text-right">Shares kept</th>}
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
                  {keepShares && <td className="text-right">{ksh(l.sharesKept)}</td>}
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
                  {keepShares && <td />}
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
            A preview from the group&apos;s records. When the officials agree, one prepares it and another confirms — that settles loans
            and fines from each share and records the payout. The money itself is paid outside the app.
          </p>
          {canManage && !draft && (
            <div className="mt-4 print:hidden">
              <PrepareShareOutButton from={from} to={to} method={method} otherIncome={otherIncome} expenses={expenses} keepShares={keepShares} />
            </div>
          )}
        </CardContent>
      </Card>
      </>
      )}

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Past share-outs</CardTitle>
          </CardHeader>
          <CardContent className="divide-y text-sm">
            {history.map((h) => {
              const mine = historyLines.filter((l) => l.shareOutId === h.id);
              const me = mine.find((l) => l.memberId === myId);
              return (
                <div key={h.id} className="py-2">
                  <p className="font-medium">
                    {h.periodStart} → {h.periodEnd}
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      · {ksh(Number(h.totalPayout))} paid out · earnings {ksh(Number(h.profit))}
                    </span>
                  </p>
                  {me && (
                    <p className="text-muted-foreground">
                      You: took home {ksh(Number(me.payout))}
                      {Number(me.loanDeducted) > 0 ? ` · loan settled ${ksh(Number(me.loanDeducted))}` : ""}
                      {Number(me.finesDeducted) > 0 ? ` · fines settled ${ksh(Number(me.finesDeducted))}` : ""}
                      {Number(me.stillOwes) > 0 ? ` · still owed ${ksh(Number(me.stillOwes))}` : ""}
                    </p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
