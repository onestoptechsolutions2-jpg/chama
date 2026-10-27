import Link from "next/link";
import { CheckCircle2, CircleAlert, Clock, Landmark, PiggyBank, RefreshCw, Gavel } from "lucide-react";
import type { MyMonth } from "@/lib/members/my-month";
import { formatDay } from "@/lib/domain/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ksh = (n: number) => `Ksh ${Math.round(n).toLocaleString("en-KE")}`;

type Line = { icon: typeof Clock; tone: string; text: string; sub?: string; href?: string };

/**
 * "Your month": what a member owes and gets, in plain words — this month's
 * contribution and whether it's paid, the next merry-go-round payout, the
 * loan, unpaid fines, and what they have saved.
 */
export function MyMonthCard({
  month,
  title = "Your month",
  showTotals = true,
}: {
  month: MyMonth;
  title?: string;
  /** Off where the page already shows saved and fines in big cards (My Money). */
  showTotals?: boolean;
}) {
  const lines: Line[] = [];
  const d = month.due;
  if (d) {
    const left = Math.max(0, d.amount - d.paid);
    if (d.status === "paid" || d.status === "waived" || left === 0) {
      lines.push({ icon: CheckCircle2, tone: "text-emerald-600", text: `This month's contribution is paid`, sub: `${ksh(d.amount)} · due ${formatDay(d.date)}` });
    } else if (d.status === "upcoming") {
      lines.push({ icon: Clock, tone: "text-muted-foreground", text: `${ksh(d.amount)} due ${formatDay(d.date)}`, sub: "This month's contribution" });
    } else {
      lines.push({
        icon: CircleAlert,
        tone: d.status === "overdue" ? "text-destructive" : "text-amber-600",
        text: `${ksh(left)} still to pay`,
        sub: `This month's contribution${d.paid > 0 ? ` (paid ${ksh(d.paid)} of ${ksh(d.amount)})` : ""} · due ${formatDay(d.date)}${d.status === "overdue" ? " — late" : ""}`,
      });
    }
  }
  if (month.nextTurn) {
    lines.push({
      icon: RefreshCw,
      tone: "text-primary",
      text: month.nextTurn.date ? `Your merry-go-round turn: ${formatDay(month.nextTurn.date)}` : "You have a merry-go-round turn coming",
      sub: month.nextTurn.amount ? `You receive about ${ksh(month.nextTurn.amount)}` : undefined,
      href: "/dashboard/mgr",
    });
  }
  if (month.loan) {
    lines.push({
      icon: Landmark,
      tone: month.loan.overdue ? "text-destructive" : "text-foreground",
      text: `Loan: ${ksh(month.loan.remaining)} left`,
      sub: month.loan.overdue ? "Overdue — please pay or talk to the treasurer" : month.loan.dueDate ? `Due ${formatDay(month.loan.dueDate)}` : undefined,
      href: "/dashboard/loans/apply",
    });
  }
  if (showTotals && month.unpaidFines > 0) {
    lines.push({ icon: Gavel, tone: "text-amber-600", text: `Fines: ${ksh(month.unpaidFines)} unpaid` });
  }
  if (showTotals) lines.push({ icon: PiggyBank, tone: "text-muted-foreground", text: `Saved so far: ${ksh(month.saved)}`, href: "/dashboard/statement" });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="divide-y">
        {lines.map((l, i) => {
          const body = (
            <div className="flex gap-3 py-3">
              <l.icon className={`mt-0.5 size-5 shrink-0 ${l.tone}`} />
              <div className="min-w-0">
                <p className="font-medium">{l.text}</p>
                {l.sub && <p className="text-sm text-muted-foreground">{l.sub}</p>}
              </div>
            </div>
          );
          return l.href ? (
            <Link key={i} href={l.href} className="block hover:bg-accent/50">
              {body}
            </Link>
          ) : (
            <div key={i}>{body}</div>
          );
        })}
      </CardContent>
    </Card>
  );
}
