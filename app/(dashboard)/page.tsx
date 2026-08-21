import Link from "next/link";
import { and, eq, gte, sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { members, fines, meetings, groups, mgrCycles, mgrSlots } from "@/lib/db/schema";
import { computeNextMgrEvent } from "@/lib/domain/insights";
import { getOrCreateWelfareFund } from "@/app/(dashboard)/welfare/welfare-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

function ksh(n: string | number) {
  return `Ksh ${Number(n).toLocaleString()}`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const session = await requireSession();

  if (!session.activeMembership) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Welcome, {session.user.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            You&apos;re not part of any group yet. Create one for your chama, or browse public groups
            and request to join one.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/onboarding" className={buttonVariants()}>
              Create your group
            </Link>
            <Link href="/discover" className={buttonVariants({ variant: "outline" })}>
              Discover groups
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { groupId, groupName, groupType, role, products } = session.activeMembership;
  const showWelfare = products.welfare;

  const isStaff = ["admin", "treasurer", "secretary"].includes(role);

  // Independent withTenant calls run concurrently, not one Promise.all
  // sharing a single transaction — concurrent queries against the same `tx`
  // aren't guaranteed to share the transaction-local SET LOCAL context
  // withTenant relies on for RLS (see app/(dashboard)/billing/data.ts for
  // where this was caught: a race silently made RLS fail-safe to zero rows).
  // Each call below gets its own connection/transaction, so there's nothing
  // to race — still concurrent, just safely so.
  const [totals, pendingFines, nextMeeting, group, mgrNext, welfareFund] = await Promise.all([
    withTenant(groupId, (tx) =>
      tx
        .select({
          memberCount: sql<number>`count(*)::int`,
          capital: sql<string>`coalesce(sum(${members.capital}), 0)`,
          security: sql<string>`coalesce(sum(${members.security}), 0)`,
          personalSavings: sql<string>`coalesce(sum(${members.personalSavings}), 0)`,
        })
        .from(members)
        .where(and(eq(members.groupId, groupId), eq(members.active, true)))
        .then((rows) => rows[0]),
    ),
    withTenant(groupId, (tx) =>
      tx.query.fines.findMany({
        where: and(eq(fines.groupId, groupId), eq(fines.status, "pending")),
        with: { member: true },
        orderBy: (f, { desc }) => [desc(f.createdAt)],
        limit: 5,
      }),
    ),
    withTenant(groupId, (tx) =>
      tx.query.meetings.findFirst({
        where: and(
          eq(meetings.groupId, groupId),
          gte(meetings.meetingDate, new Date().toISOString().split("T")[0]),
        ),
        orderBy: (m, { asc }) => [asc(m.meetingDate)],
      }),
    ),
    withTenant(groupId, (tx) => tx.query.groups.findFirst({ where: eq(groups.id, groupId) })),
    products.mgr
      ? withTenant(groupId, async (tx) => {
          const cycles = await tx.query.mgrCycles.findMany({ where: eq(mgrCycles.groupId, groupId) });
          const slots = await tx.query.mgrSlots.findMany({
            where: eq(mgrSlots.groupId, groupId),
            with: { member: true },
          });
          return computeNextMgrEvent(
            cycles.map((c) => ({ cycleNumber: c.cycleNumber, status: c.status, scheduledDate: c.scheduledDate })),
            slots.map((s) => ({
              cycleNumber: s.cycleNumber,
              memberId: s.memberId,
              memberName: s.member?.name ?? null,
            })),
            new Date(),
          );
        })
      : Promise.resolve(null),
    products.welfare
      ? withTenant(groupId, (tx) => getOrCreateWelfareFund(tx, groupId))
      : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back, {session.user.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {groupName} · <span className="capitalize">{groupType}</span> ·{" "}
          <span className="capitalize">{role}</span>
        </p>
      </div>

      {isStaff && group && !group.registrationComplete && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <p className="text-sm">
              This group&apos;s registration isn&apos;t complete — it needs a Treasurer and
              Secretary assigned before it&apos;s publicly discoverable or can approve new
              members.
            </p>
            <Link href="/members" className={buttonVariants({ size: "sm", variant: "outline" })}>
              Assign officials
            </Link>
          </CardContent>
        </Card>
      )}

      <div className={`grid gap-4 sm:grid-cols-2 ${showWelfare ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        <Metric label="Members" value={String(totals.memberCount)} />
        <Metric label="Capital" value={ksh(totals.capital)} />
        <Metric label="Security" value={ksh(totals.security)} />
        <Metric label="Personal savings" value={ksh(totals.personalSavings)} />
        {showWelfare && welfareFund && (
          <Metric
            label="Welfare fund"
            value={ksh(
              Number(welfareFund.emergencyBalance) +
                Number(welfareFund.longTermBalance) +
                Number(welfareFund.advanceBalance),
            )}
          />
        )}
      </div>

      {products.mgr && (
        <Card className={mgrNext && mgrNext.daysUntil < 0 ? "border-destructive/50 bg-destructive/5" : undefined}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Next MGR payout</CardTitle>
            <Link href="/insights" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
              View insights
            </Link>
          </CardHeader>
          <CardContent>
            {mgrNext ? (
              <div className="text-sm">
                <p className="text-lg font-semibold">{mgrNext.recipientName ?? "Unassigned"}</p>
                <p className="text-muted-foreground">
                  Cycle {mgrNext.cycleNumber} · {mgrNext.scheduledDate} ·{" "}
                  {mgrNext.daysUntil < 0
                    ? `${Math.abs(mgrNext.daysUntil)} day${Math.abs(mgrNext.daysUntil) === 1 ? "" : "s"} overdue`
                    : mgrNext.daysUntil === 0
                      ? "today"
                      : `in ${mgrNext.daysUntil} day${mgrNext.daysUntil === 1 ? "" : "s"}`}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No MGR cycle is active or scheduled yet.</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending fines</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingFines.length === 0 && (
              <p className="text-sm text-muted-foreground">No pending fines.</p>
            )}
            {pendingFines.map((f) => (
              <div key={f.id} className="flex items-center justify-between text-sm">
                <span>{f.member.name}</span>
                <span className="flex items-center gap-2">
                  <Badge variant="secondary" className="capitalize">
                    {f.type.replace("_", " ")}
                  </Badge>
                  {ksh(f.amount)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Next meeting</CardTitle>
          </CardHeader>
          <CardContent>
            {nextMeeting ? (
              <div className="text-sm">
                <p className="font-medium">{nextMeeting.meetingDate}</p>
                <p className="capitalize text-muted-foreground">
                  {nextMeeting.meetingType}
                  {nextMeeting.venue ? ` · ${nextMeeting.venue}` : ""}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No upcoming meetings scheduled.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
