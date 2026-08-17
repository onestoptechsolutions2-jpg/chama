import type { NextMgrEvent, MgrPace, Recommendation, MemberRiskFlag } from "@/lib/domain/insights";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const SEVERITY_STYLES: Record<Recommendation["severity"], { card: string; badge: "destructive" | "secondary" | "outline" }> = {
  critical: { card: "border-destructive/50 bg-destructive/5", badge: "destructive" },
  warning: { card: "border-amber-500/50 bg-amber-500/5", badge: "secondary" },
  info: { card: "border-sky-500/40 bg-sky-500/5", badge: "outline" },
};

function NextUpCard({ event }: { event: NextMgrEvent | null }) {
  if (!event) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          No MGR cycle is active or scheduled yet.
        </CardContent>
      </Card>
    );
  }

  const overdue = event.daysUntil < 0;
  return (
    <Card className={overdue ? "border-destructive/50 bg-destructive/5" : undefined}>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">
          Next payout {event.status === "active" ? "(active cycle)" : "(scheduled)"}
        </p>
        <p className="text-2xl font-semibold">{event.recipientName ?? "Unassigned"}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Cycle {event.cycleNumber} · {event.scheduledDate} ·{" "}
          {overdue
            ? `${Math.abs(event.daysUntil)} day${Math.abs(event.daysUntil) === 1 ? "" : "s"} overdue`
            : event.daysUntil === 0
              ? "today"
              : `in ${event.daysUntil} day${event.daysUntil === 1 ? "" : "s"}`}
        </p>
      </CardContent>
    </Card>
  );
}

function PaceCard({ pace }: { pace: MgrPace | null }) {
  if (!pace) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Not enough completed cycles yet to measure rotation pace.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={pace.onPace ? undefined : "border-amber-500/50 bg-amber-500/5"}>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">Rotation pace</p>
        <p className="text-2xl font-semibold">{pace.averageIntervalDays.toFixed(0)} days/cycle</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Target is {pace.expectedIntervalDays} days — {pace.onPace ? "on pace" : "drifting"}
        </p>
      </CardContent>
    </Card>
  );
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const style = SEVERITY_STYLES[rec.severity];
  return (
    <Card className={style.card}>
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
}: {
  nextMgrEvent: NextMgrEvent | null;
  mgrPace: MgrPace | null;
  recommendations: Recommendation[];
  memberRiskFlags: MemberRiskFlag[];
  isStaff: boolean;
  mgrEnabled: boolean;
}) {
  return (
    <div className="space-y-6">
      {mgrEnabled && (
        <div className="grid gap-4 sm:grid-cols-2">
          <NextUpCard event={nextMgrEvent} />
          <PaceCard pace={mgrPace} />
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-base font-medium">Recommendations</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {recommendations.map((rec) => (
            <RecommendationCard key={rec.id} rec={rec} />
          ))}
        </div>
      </div>

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
