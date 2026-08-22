import Link from "next/link";
import { and, eq, gte, sql } from "drizzle-orm";
import { Users, Landmark, ShieldCheck, Wallet, HeartHandshake, type LucideIcon } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { members, fines, meetings, groups } from "@/lib/db/schema";
import { getOrCreateWelfareFund } from "@/app/(dashboard)/dashboard/welfare/welfare-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

function ksh(n: string | number) {
  return `Ksh ${Number(n).toLocaleString()}`;
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-6">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-xl font-bold tabular-nums tracking-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const session = await requireSession();

  if (!session.activeMembership) {
    return (
      <Card>
        <CardHeader><CardTitle>Welcome, {session.user.name}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">You&apos;re not part of any group yet. Create one for your chama, or browse public groups and request to join one.</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard/onboarding" className={buttonVariants()}>Create your group</Link>
            <Link href="/discover" className={buttonVariants({ variant: "outline" })}>Discover groups</Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { groupId, groupName, groupType, role, products } = session.activeMembership;
  const isStaff = ["admin", "treasurer", "secretary"].includes(role);
  const [totals, pendingFines, nextMeeting, group, welfareFund] = await Promise.all([
    withTenant(groupId, (tx) => tx.select({ memberCount: sql<number>`count(*)::int`, capital: sql<string>`coalesce(sum(${members.capital}), 0)`, security: sql<string>`coalesce(sum(${members.security}), 0)`, personalSavings: sql<string>`coalesce(sum(${members.personalSavings}), 0)` }).from(members).where(and(eq(members.groupId, groupId), eq(members.active, true))).then((rows) => rows[0])),
    withTenant(groupId, (tx) => tx.query.fines.findMany({ where: and(eq(fines.groupId, groupId), eq(fines.status, "pending")), with: { member: true }, orderBy: (f, { desc }) => [desc(f.createdAt)], limit: 5 })),
    withTenant(groupId, (tx) => tx.query.meetings.findFirst({ where: and(eq(meetings.groupId, groupId), gte(meetings.meetingDate, new Date().toISOString().split("T")[0])), orderBy: (m, { asc }) => [asc(m.meetingDate)] })),
    withTenant(groupId, (tx) => tx.query.groups.findFirst({ where: eq(groups.id, groupId) })),
    products.welfare ? withTenant(groupId, (tx) => getOrCreateWelfareFund(tx, groupId)) : Promise.resolve(null),
  ]);
  const showWelfare = products.welfare;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome back, {session.user.name.split(" ")[0]}</h1>
        <p className="text-sm text-muted-foreground">{groupName} · <span className="capitalize">{groupType}</span> · <span className="capitalize">{role}</span></p>
      </div>
      {isStaff && group && !group.registrationComplete && <Card className="border-amber-500/50 bg-amber-500/5"><CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6"><p className="text-sm">This group&apos;s registration isn&apos;t complete — it needs a Treasurer and Secretary assigned before it&apos;s publicly discoverable or can approve new members.</p><Link href="/dashboard/members" className={buttonVariants({ size: "sm", variant: "outline" })}>Assign officials</Link></CardContent></Card>}
      <div className={`grid grid-cols-2 gap-3 ${showWelfare ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        <Metric label="Members" value={String(totals.memberCount)} icon={Users} />
        <Metric label="Capital" value={ksh(totals.capital)} icon={Landmark} />
        <Metric label="Security" value={ksh(totals.security)} icon={ShieldCheck} />
        <Metric label="Personal savings" value={ksh(totals.personalSavings)} icon={Wallet} />
        {showWelfare && welfareFund && (
          <Metric
            label="Welfare fund"
            value={ksh(Number(welfareFund.emergencyBalance) + Number(welfareFund.longTermBalance) + Number(welfareFund.advanceBalance))}
            icon={HeartHandshake}
          />
        )}
      </div>
      <Link href="/dashboard/insights" className="flex items-center justify-between rounded-lg border bg-gradient-to-br from-primary/10 via-transparent to-transparent px-4 py-3 text-sm transition-colors hover:from-primary/15">
        <span className="font-medium">See what&apos;s next — MGR pacing, recommendations &amp; group performance</span>
        <span className="text-muted-foreground">→</span>
      </Link>
      <div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">Pending fines</CardTitle></CardHeader><CardContent className="space-y-2">{pendingFines.length === 0 && <p className="text-sm text-muted-foreground">No pending fines.</p>}{pendingFines.map((f) => <div key={f.id} className="flex items-center justify-between text-sm"><span>{f.member.name}</span><span className="flex items-center gap-2"><Badge variant="secondary" className="capitalize">{f.type.replace("_", " ")}</Badge>{ksh(f.amount)}</span></div>)}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Next meeting</CardTitle></CardHeader><CardContent>{nextMeeting ? <div className="text-sm"><p className="font-medium">{nextMeeting.meetingDate}</p><p className="capitalize text-muted-foreground">{nextMeeting.meetingType}{nextMeeting.venue ? ` · ${nextMeeting.venue}` : ""}</p></div> : <p className="text-sm text-muted-foreground">No upcoming meetings scheduled.</p>}</CardContent></Card></div>
    </div>
  );
}
