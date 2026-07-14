import Link from "next/link";
import { and, eq, gte, sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { members, fines, meetings } from "@/lib/db/schema";
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
            You&apos;re not part of any group yet. Browse public groups and
            request to join one, or ask an admin to add you directly.
          </p>
          <Link href="/discover" className={buttonVariants()}>
            Discover groups
          </Link>
        </CardContent>
      </Card>
    );
  }

  const { groupId, groupName, groupType, role } = session.activeMembership;
  const showWelfare = groupType === "welfare" || groupType === "hybrid";

  const [totals, pendingFines, nextMeeting] = await withTenant(groupId, (tx) =>
    Promise.all([
      tx
        .select({
          memberCount: sql<number>`count(*)::int`,
          capital: sql<string>`coalesce(sum(${members.capital}), 0)`,
          security: sql<string>`coalesce(sum(${members.security}), 0)`,
          personalSavings: sql<string>`coalesce(sum(${members.personalSavings}), 0)`,
          welfareBalance: sql<string>`coalesce(sum(${members.welfareBalance}), 0)`,
        })
        .from(members)
        .where(and(eq(members.groupId, groupId), eq(members.active, true)))
        .then((rows) => rows[0]),
      tx.query.fines.findMany({
        where: and(eq(fines.groupId, groupId), eq(fines.status, "pending")),
        with: { member: true },
        orderBy: (f, { desc }) => [desc(f.createdAt)],
        limit: 5,
      }),
      tx.query.meetings.findFirst({
        where: and(
          eq(meetings.groupId, groupId),
          gte(meetings.meetingDate, new Date().toISOString().split("T")[0]),
        ),
        orderBy: (m, { asc }) => [asc(m.meetingDate)],
      }),
    ]),
  );

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

      <div className={`grid gap-4 sm:grid-cols-2 ${showWelfare ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        <Metric label="Members" value={String(totals.memberCount)} />
        <Metric label="Capital" value={ksh(totals.capital)} />
        <Metric label="Security" value={ksh(totals.security)} />
        <Metric label="Personal savings" value={ksh(totals.personalSavings)} />
        {showWelfare && <Metric label="Welfare fund" value={ksh(totals.welfareBalance)} />}
      </div>

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
