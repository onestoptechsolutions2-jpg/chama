import Link from "next/link";
import type { CapitalPosition, AllocationDrift } from "@/lib/domain/capital";
import type { ProductFlags } from "@/lib/domain/products";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { CompositionBar, Meter } from "@/components/feature/charts";

function ksh(n: number) {
  return `Ksh ${Math.round(n).toLocaleString()}`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function AllocationBar({ position }: { position: CapitalPosition }) {
  const loanPct = Math.min(100, position.loanDeploymentPct);
  const reservePct = 100 - loanPct;

  return (
    <div className="space-y-2">
      <div className="flex h-4 w-full overflow-hidden rounded-full" style={{ background: "var(--viz-grid)" }}>
        {loanPct > 0 && (
          <div
            className="h-full rounded-l-[4px]"
            style={{ width: `${loanPct}%`, background: "var(--viz-cat-2)" }}
            title={`Out on loan: ${loanPct.toFixed(1)}%`}
          />
        )}
        {reservePct > 0 && (
          <div
            className="h-full rounded-r-[4px]"
            style={{ width: `${reservePct}%`, background: "var(--viz-cat-3)", marginLeft: loanPct > 0 ? 2 : 0 }}
            title={`Reserve: ${reservePct.toFixed(1)}%`}
          />
        )}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: "var(--viz-cat-2)" }} /> Out on loan —{" "}
          {position.loanDeploymentPct.toFixed(1)}%
        </span>
        <span className="flex items-center gap-1.5">
          Reserve — {(100 - position.loanDeploymentPct).toFixed(1)}%{" "}
          <span className="size-2 rounded-full" style={{ background: "var(--viz-cat-3)" }} />
        </span>
      </div>
    </div>
  );
}

function DriftCallout({ drift, isStaff }: { drift: AllocationDrift | null; isStaff: boolean }) {
  if (!drift) {
    return isStaff ? (
      <Card className="border-dashed">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
          <p className="text-sm text-muted-foreground">
            No target allocation is set — drift alerts are off until one is configured.
          </p>
          <Link href="/dashboard/settings" className={buttonVariants({ size: "sm", variant: "outline" })}>
            Set a target
          </Link>
        </CardContent>
      </Card>
    ) : null;
  }

  const severity = drift.severity === "on_target" ? "good" : drift.severity === "over_deployed" ? "warning" : "serious";

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <Meter
          label="Deployment vs. target"
          value={drift.actualPct}
          max={100}
          target={drift.targetPct}
          formatValue={(n) => `${n.toFixed(1)}%`}
          severity={severity}
        />
        {drift.severity === "on_target" ? (
          <p className="text-sm text-muted-foreground">
            On target — {drift.actualPct.toFixed(1)}% deployed against a {drift.targetPct.toFixed(0)}% goal.
          </p>
        ) : (
          <div className="text-sm">
            <Badge variant={drift.severity === "over_deployed" ? "destructive" : "secondary"} className="mb-2">
              {drift.severity === "over_deployed" ? "Over-deployed" : "Under-deployed"}
            </Badge>
            <p className="text-muted-foreground">
              Target is {drift.targetPct.toFixed(0)}% of the capital pool out on loan; actual is{" "}
              {drift.actualPct.toFixed(1)}% ({drift.deltaPts > 0 ? "+" : ""}
              {drift.deltaPts.toFixed(1)} points).{" "}
              {drift.severity === "over_deployed"
                ? "Liquidity is thinner than the group's own target — consider slowing new loan approvals until reserve recovers."
                : "More of the capital pool could be deployed, or the target may be worth revisiting."}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function CapitalPositionView({
  position,
  drift,
  products,
  isStaff,
}: {
  position: CapitalPosition;
  drift: AllocationDrift | null;
  products: ProductFlags;
  isStaff: boolean;
}) {
  const composition = [
    { label: "Out on loan", value: position.loanPrincipalOutstanding },
    { label: "Reserve", value: position.reserve },
    { label: "Security fund", value: position.securityPool },
    { label: "Personal savings", value: position.personalSavingsPool },
    ...(products.welfare ? [{ label: "Welfare fund", value: position.welfareAvailable }] : []),
    ...(products.projects ? [{ label: "Projects committed", value: position.projectsCommitted }] : []),
  ];

  return (
    <div className="space-y-6">
      {position.overextended && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6 text-sm">
            Outstanding loan principal ({ksh(position.loanPrincipalOutstanding)}) exceeds the
            capital pool ({ksh(position.capitalPool)}). Reserve is shown as zero rather than
            negative — worth reconciling.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Capital pool" value={ksh(position.capitalPool)} hint="Members' capital contributions" />
        <Stat
          label="Out on loan"
          value={ksh(position.loanPrincipalOutstanding)}
          hint={`${ksh(position.loanReceivableOutstanding)} owed back incl. interest`}
        />
        <Stat label="Reserve" value={ksh(position.reserve)} hint="Not currently deployed" />
        <Stat label="Deployment" value={`${position.loanDeploymentPct.toFixed(1)}%`} hint="Of the capital pool" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Allocation</CardTitle>
        </CardHeader>
        <CardContent>
          <AllocationBar position={position} />
        </CardContent>
      </Card>

      <DriftCallout drift={drift} isStaff={isStaff} />

      <CompositionBar title="Every fund at a glance" data={composition} formatValue={ksh} />
    </div>
  );
}
