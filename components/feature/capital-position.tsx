import Link from "next/link";
import type { CapitalPosition, AllocationDrift } from "@/lib/domain/capital";
import type { ProductFlags } from "@/lib/domain/products";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

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
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
        {loanPct > 0 && (
          <div
            className="h-full bg-primary"
            style={{ width: `${loanPct}%` }}
            title={`Out on loan: ${loanPct.toFixed(1)}%`}
          />
        )}
        {reservePct > 0 && (
          <div
            className="h-full bg-emerald-500/60"
            style={{ width: `${reservePct}%` }}
            title={`Reserve: ${reservePct.toFixed(1)}%`}
          />
        )}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-primary" /> Out on loan —{" "}
          {position.loanDeploymentPct.toFixed(1)}%
        </span>
        <span className="flex items-center gap-1.5">
          Reserve — {(100 - position.loanDeploymentPct).toFixed(1)}%{" "}
          <span className="size-2 rounded-full bg-emerald-500/60" />
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

  if (drift.severity === "on_target") {
    return (
      <Card className="border-emerald-500/40 bg-emerald-500/5">
        <CardContent className="pt-6 text-sm">
          On target — {drift.actualPct.toFixed(1)}% deployed against a {drift.targetPct.toFixed(0)}%
          goal.
        </CardContent>
      </Card>
    );
  }

  const over = drift.severity === "over_deployed";
  return (
    <Card className={over ? "border-amber-500/50 bg-amber-500/5" : "border-sky-500/50 bg-sky-500/5"}>
      <CardContent className="pt-6 text-sm">
        <Badge variant={over ? "destructive" : "secondary"} className="mb-2">
          {over ? "Over-deployed" : "Under-deployed"}
        </Badge>
        <p>
          Target is {drift.targetPct.toFixed(0)}% of the capital pool out on loan; actual is{" "}
          {drift.actualPct.toFixed(1)}% ({drift.deltaPts > 0 ? "+" : ""}
          {drift.deltaPts.toFixed(1)} points).{" "}
          {over
            ? "Liquidity is thinner than the group's own target — consider slowing new loan approvals until reserve recovers."
            : "More of the capital pool could be deployed, or the target may be worth revisiting."}
        </p>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Other balances</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">Security fund</p>
            <p className="text-lg font-medium">{ksh(position.securityPool)}</p>
            <p className="text-xs text-muted-foreground">Collateral deposits, not deployed to loans</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Personal savings</p>
            <p className="text-lg font-medium">{ksh(position.personalSavingsPool)}</p>
            <p className="text-xs text-muted-foreground">Individually-owned, not deployed to loans</p>
          </div>
          {products.welfare && (
            <div>
              <p className="text-sm text-muted-foreground">Welfare fund available</p>
              <p className="text-lg font-medium">{ksh(position.welfareAvailable)}</p>
              <p className="text-xs text-muted-foreground">Collected minus disbursed claims</p>
            </div>
          )}
          {products.projects && (
            <div>
              <p className="text-sm text-muted-foreground">Projects committed</p>
              <p className="text-lg font-medium">{ksh(position.projectsCommitted)}</p>
              <p className="text-xs text-muted-foreground">Collected toward open projects</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
