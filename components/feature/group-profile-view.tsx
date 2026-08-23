"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { NextMgrEvent } from "@/lib/domain/insights";
import type { CapitalPosition } from "@/lib/domain/capital";
import { setGroupActiveAction } from "@/app/super-admin/groups/actions";
import { EditGroupDialog, type Group, type PlatformUser, type AccountActivity } from "@/components/feature/super-admin-groups-manager";
import { SequentialColumnChart, StatusBarList, Meter } from "@/components/feature/charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";

type Invoice = {
  id: number;
  periodStart: string;
  periodEnd: string;
  totalAmount: string;
  status: string;
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

const INVOICE_BADGE: Record<string, "secondary" | "outline" | "destructive"> = {
  paid: "secondary",
  pending: "outline",
  failed: "destructive",
  cancelled: "outline",
};

function money(value: string | number) {
  return `Ksh ${Number(value).toLocaleString()}`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tabular-nums tracking-tight">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function OfficialBadge({ label, present }: { label: string; present: boolean }) {
  return (
    <Badge variant={present ? "secondary" : "destructive"} className="font-normal">
      {label} {present ? "✓" : "missing"}
    </Badge>
  );
}

export function GroupProfileView({
  group,
  activeMemberCount,
  pendingMemberCount,
  officials,
  position,
  loansByStatus,
  finesByStatus,
  monthly,
  nextMgrEvent,
  invoices,
  billing,
  activities,
  platformUsers,
}: {
  group: Group;
  activeMemberCount: number;
  pendingMemberCount: number;
  officials: { admin: boolean; treasurer: boolean; secretary: boolean };
  position: CapitalPosition;
  loansByStatus: { status: string; count: number; outstanding: string }[];
  finesByStatus: { status: string; total: string }[];
  monthly: { year: number | null; month: number | null; total: string }[];
  nextMgrEvent: NextMgrEvent | null;
  invoices: Invoice[];
  billing: { paidAmount: string; pendingAmount: string };
  activities: AccountActivity[];
  platformUsers: PlatformUser[];
}) {
  const [editing, setEditing] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);

  async function handleToggleActive() {
    setTogglingActive(true);
    const result = await setGroupActiveAction(group.id, !group.active);
    setTogglingActive(false);
    if (result && "error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(group.active ? "Group deactivated" : "Group reactivated");
  }

  const monthlyData = monthly.map((row) => ({
    label: row.month ? `${MONTH_LABELS[row.month - 1]} ${String(row.year ?? "").slice(2)}` : "—",
    value: Number(row.total),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={group.active ? "secondary" : "destructive"}>{group.active ? "Active" : "Inactive"}</Badge>
          <Badge variant={group.isPublic ? "secondary" : "outline"}>{group.isPublic ? "Public" : "Private"}</Badge>
          <Badge variant={group.registrationComplete ? "secondary" : "destructive"}>
            {group.registrationComplete ? "Registration complete" : "Registration incomplete"}
          </Badge>
          <Badge variant="outline" className="capitalize">{group.onboardingStage.replace("_", " ")}</Badge>
          <Badge variant="outline" className="capitalize">{group.accountTier} tier</Badge>
        </div>
        <div className="flex gap-2">
          <Link href="/super-admin/groups" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Back to groups
          </Link>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit</Button>
          <Button size="sm" variant={group.active ? "secondary" : "default"} onClick={handleToggleActive} disabled={togglingActive}>
            {togglingActive ? "Working..." : group.active ? "Deactivate" : "Activate"}
          </Button>
        </div>
      </div>

      {group.description && <p className="text-sm text-muted-foreground">{group.description}</p>}

      <div className="flex flex-wrap gap-2">
        <OfficialBadge label="Chair" present={officials.admin} />
        <OfficialBadge label="Treasurer" present={officials.treasurer} />
        <OfficialBadge label="Secretary" present={officials.secretary} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active members" value={String(activeMemberCount)} hint={pendingMemberCount > 0 ? `${pendingMemberCount} pending` : undefined} />
        <Stat label="Capital pool" value={money(position.capitalPool)} />
        <Stat label="Deployment" value={`${position.loanDeploymentPct.toFixed(1)}%`} hint={money(position.reserve) + " in reserve"} />
        <Stat label="Subscription collected" value={money(billing.paidAmount)} hint={Number(billing.pendingAmount) > 0 ? `${money(billing.pendingAmount)} pending` : undefined} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Contact &amp; account</CardTitle></CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div><p className="text-muted-foreground">Contact person</p><p className="font-medium">{group.contactPersonName || "—"}</p></div>
          <div><p className="text-muted-foreground">Role</p><p className="font-medium">{group.contactPersonRole || "—"}</p></div>
          <div><p className="text-muted-foreground">Phone</p><p className="font-medium">{group.contactPersonPhone || "—"}</p></div>
          <div><p className="text-muted-foreground">Email</p><p className="font-medium">{group.contactPersonEmail || "—"}</p></div>
          <div><p className="text-muted-foreground">Account owner</p><p className="font-medium">{platformUsers.find((u) => u.id === group.accountOwnerUserId)?.name ?? "Unassigned"}</p></div>
          <div><p className="text-muted-foreground">Next follow-up</p><p className="font-medium">{group.nextFollowUpAt ? new Date(group.nextFollowUpAt).toLocaleString() : "None"}</p></div>
          {group.internalNotes && <div className="sm:col-span-2 lg:col-span-3"><p className="text-muted-foreground">Internal notes</p><p className="font-medium">{group.internalNotes}</p></div>}
        </CardContent>
      </Card>

      {nextMgrEvent && (
        <Card className={nextMgrEvent.daysUntil < 0 ? "border-destructive/50 bg-destructive/5" : undefined}>
          <CardHeader><CardTitle className="text-base">Next MGR payout</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <p className="text-lg font-semibold">{nextMgrEvent.recipientName ?? "Unassigned"}</p>
            <p className="text-muted-foreground">
              Cycle {nextMgrEvent.cycleNumber} · {nextMgrEvent.scheduledDate} ·{" "}
              {nextMgrEvent.daysUntil < 0
                ? `${Math.abs(nextMgrEvent.daysUntil)} day${Math.abs(nextMgrEvent.daysUntil) === 1 ? "" : "s"} overdue`
                : nextMgrEvent.daysUntil === 0
                  ? "today"
                  : `in ${nextMgrEvent.daysUntil} day${nextMgrEvent.daysUntil === 1 ? "" : "s"}`}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <h2 className="text-base font-medium">Group performance</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <SequentialColumnChart title="Contributions by month" data={monthlyData} formatValue={money} emptyLabel="No contributions recorded yet." />
          <div className="space-y-4">
            <Meter
              label="Loan deployment vs. capital pool"
              value={position.loanPrincipalOutstanding}
              max={Math.max(position.capitalPool, position.loanPrincipalOutstanding, 1)}
              formatValue={money}
              severity={position.overextended ? "critical" : "good"}
            />
            <StatusBarList
              title="Loan exposure"
              rows={loansByStatus.map((row) => ({
                label: row.status,
                value: Number(row.outstanding),
                secondary: `${row.count} loan${row.count === 1 ? "" : "s"}`,
                status: LOAN_STATUS_ROLE[row.status] ?? "neutral",
              }))}
              formatValue={money}
              emptyLabel="No loans recorded yet."
            />
          </div>
        </div>
        <StatusBarList
          title="Fines by status"
          rows={finesByStatus.map((row) => ({ label: row.status, value: Number(row.total), status: FINE_STATUS_ROLE[row.status] ?? "neutral" }))}
          formatValue={money}
          emptyLabel="No fines recorded yet."
        />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent subscription invoices</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {invoices.length === 0 && <p className="text-sm text-muted-foreground">No invoices generated yet.</p>}
          {invoices.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{inv.periodStart} → {inv.periodEnd}</span>
              <span className="flex items-center gap-2">
                <Badge variant={INVOICE_BADGE[inv.status] ?? "outline"} className="capitalize">{inv.status}</Badge>
                <span className="font-medium tabular-nums">{money(inv.totalAmount)}</span>
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Activity timeline</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {activities.length === 0 && <p className="text-sm text-muted-foreground">No account activity logged yet.</p>}
          {activities.map((activity) => (
            <div key={activity.id} className="border-l-2 border-muted pl-3 text-sm">
              <p>{activity.note}</p>
              <p className="text-xs text-muted-foreground">
                <span className="capitalize">{activity.activityType.replace("_", " ")}</span> · {new Date(activity.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      {editing && (
        <EditGroupDialog
          group={group}
          platformUsers={platformUsers}
          activities={activities}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
