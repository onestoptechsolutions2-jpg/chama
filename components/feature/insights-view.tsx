"use client";

import type { NextMgrEvent, MgrPace, Recommendation, MemberRiskFlag } from "@/lib/domain/insights";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Meter, SequentialColumnChart, RankedBarList, StatusBarList } from "@/components/feature/charts";

export type Report = {
  monthly: { year: number | null; month: number | null; total: string }[];
  balances: { name: string; total: string }[];
  loansByStatus: { status: string; count: number; outstanding: string }[];
  finesByStatus: { status: string; total: string }[];
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const LOAN_STATUS_ROLE: Record<string, "good" | "warning" | "serious" | "critical" | "neutral"> = {
  cleared: "good",
  active: "neutral",
  pending: "warning",
  extended: "serious",
  overdue: "critical",
  rejected: "neutral",
};

const FINE_STATUS_ROLE: Record<string, "good" | "warning" | "serious" | "critical" | "neutral"> = {
  paid: "good",
  pending: "warning",
  waived: "neutral",
};

function money(value: string | number) {
  return `Ksh ${Number(value).toLocaleString()}`;
}

const SEVERITY_STYLES: Record<Recommendation["severity"], { card: string; badge: "destructive" | "secondary" | "outline" }> = {
  critical: { card: "border-destructive/50 bg-destructive/5", badge: "destructive" },
  warning: { card: "border-amber-500/50 bg-amber-500/5", badge: "secondary" },
  info: { card: "border-sky-500/40 bg-sky-500/5", badge: "outline" },
};

/** The hero — big, bold, one clear headline. Exactly one per view, per the figure contract. */
function NextUpHero({ event, pace }: { event: NextMgrEvent | null; pace: MgrPace | null }) {
  if (!event) {
    return (
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-transparent to-transparent">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          No MGR cycle is active or scheduled yet — once one starts, the next payout shows up here.
        </CardContent>
      </Card>
    );
  }

  const overdue = event.daysUntil < 0;

  return (
    <Card
      className={`overflow-hidden ${overdue ? "border-destructive/50 bg-gradient-to-br from-destructive/10 via-transparent to-transparent" : "border-primary/25 bg-gradient-to-br from-primary/10 via-transparent to-transparent"}`}
    >
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Next payout {event.status === "active" ? "· active cycle" : "· scheduled"}
            </p>
            <p className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{event.recipientName ?? "Unassigned"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Cycle {event.cycleNumber} · {event.scheduledDate}
            </p>
          </div>
          <Badge variant={overdue ? "destructive" : "secondary"} className="shrink-0 text-sm">
            {overdue
              ? `${Math.abs(event.daysUntil)}d overdue`
              : event.daysUntil === 0
                ? "Today"
                : `in ${event.daysUntil}d`}
          </Badge>
        </div>
        {pace && (
          <Meter
            label="Rotation pace"
            value={pace.averageIntervalDays}
            max={Math.max(pace.averageIntervalDays, pace.expectedIntervalDays) * 1.15}
            target={pace.expectedIntervalDays}
            formatValue={(n) => `${n.toFixed(0)}d/cycle`}
            severity={pace.onPace ? "good" : "warning"}
          />
        )}
      </CardContent>
    </Card>
  );
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const style = SEVERITY_STYLES[rec.severity];
  return (
    <Card className={`${style.card} shrink-0 snap-start sm:shrink`}>
      <CardContent className="pt-6 text-sm">
        <div className="mb-1 flex items-center gap-2">
          <Badge variant={style.badge} className="capitalize">
            {rec.severity}
          </Badge>
          <p className="font-medium">{rec.title}</p>
        </div>
        <p className="text-muted-foreground">{rec.detail}</p>
      </CardContent>
    </Card>
  );
}

export function InsightsView({
  nextMgrEvent,
  mgrPace,
  recommendations,
  memberRiskFlags,
  isStaff,
  mgrEnabled,
  report,
}: {
  nextMgrEvent: NextMgrEvent | null;
  mgrPace: MgrPace | null;
  recommendations: Recommendation[];
  memberRiskFlags: MemberRiskFlag[];
  isStaff: boolean;
  mgrEnabled: boolean;
  report: Report | null;
}) {
  const monthly = (report?.monthly ?? []).map((row) => ({
    label: row.month ? `${MONTH_LABELS[row.month - 1]} ${String(row.year ?? "").slice(2)}` : "—",
    value: Number(row.total),
  }));

  return (
    <div className="space-y-6">
      {mgrEnabled && <NextUpHero event={nextMgrEvent} pace={mgrPace} />}

      {recommendations.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-medium">Recommendations</h2>
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0">
            {recommendations.map((rec) => (
              <div key={rec.id} className="w-[85vw] shrink-0 snap-start sm:w-auto sm:shrink">
                <RecommendationCard rec={rec} />
              </div>
            ))}
          </div>
        </div>
      )}

      {isStaff && report && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium">Group performance</h2>
            <Button variant="outline" size="sm" onClick={() => window.location.assign("/dashboard/reports/export")}>
              Export CSV
            </Button>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <SequentialColumnChart
              title="Contributions by month"
              data={monthly}
              formatValue={money}
              emptyLabel="No contributions recorded yet."
            />
            <RankedBarList
              title="Top member balances"
              data={report.balances.map((row) => ({ label: row.name, value: Number(row.total) }))}
              formatValue={money}
              emptyLabel="No member balances yet."
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <StatusBarList
              title="Loan exposure"
              rows={report.loansByStatus.map((row) => ({
                label: row.status,
                value: Number(row.outstanding),
                secondary: `${row.count} loan${row.count === 1 ? "" : "s"}`,
                status: LOAN_STATUS_ROLE[row.status] ?? "neutral",
              }))}
              formatValue={money}
              emptyLabel="No loans recorded yet."
            />
            <StatusBarList
              title="Fines by status"
              rows={report.finesByStatus.map((row) => ({
                label: row.status,
                value: Number(row.total),
                status: FINE_STATUS_ROLE[row.status] ?? "neutral",
              }))}
              formatValue={money}
              emptyLabel="No fines recorded yet."
            />
          </div>
        </div>
      )}

      {isStaff && memberRiskFlags.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Members worth a check-in</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {memberRiskFlags.map((f) => (
              <div key={f.memberId} className="flex items-start justify-between gap-3 text-sm">
                <span className="font-medium">{f.name}</span>
                <span className="flex flex-wrap justify-end gap-1.5">
                  {f.reasons.map((reason, i) => (
                    <Badge
                      key={i}
                      variant={f.severity === "critical" ? "destructive" : "secondary"}
                      className="font-normal"
                    >
                      {reason}
                    </Badge>
                  ))}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
