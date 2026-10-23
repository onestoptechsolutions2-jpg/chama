import Link from "next/link";
import { nairobiToday } from "@/lib/domain/dates";
import { listMyInvites } from "@/lib/invites/data";
import { MyInvites } from "@/components/feature/my-invites";
import { redirect } from "next/navigation";
import { and, eq, gte, sql } from "drizzle-orm";
import { Landmark, Wallet, HeartHandshake, CalendarDays, Gavel, RefreshCw, type LucideIcon } from "lucide-react";
import { requireSession, type SessionWithGroup } from "@/lib/auth/session";
import { loadNextSteps } from "@/lib/next-steps/data";
import { NextSteps } from "@/components/feature/next-steps";
import { can, canPlatform } from "@/lib/auth/permissions";
import { withTenant } from "@/lib/db/rls";
import { members, fines, meetings } from "@/lib/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

function ksh(n: string | number) {
  return `Ksh ${Number(n).toLocaleString()}`;
}

type Tile = { href: string; label: string; hint: string; icon: LucideIcon };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ support_blocked?: string }> }) {
  const session = await requireSession();

  const myInvites = await listMyInvites(session.user);
  const { support_blocked: supportBlocked } = await searchParams;

  if (!session.activeMembership) {
    // Platform staff don't need a group; their home is the super-admin area.
    if (canPlatform(session.user.platformRole, "platform.console")) redirect("/super-admin/support");
    return (
      <div className="space-y-4">
      <MyInvites invites={myInvites} />
      <Card>
        <CardHeader>
          <CardTitle>Welcome, {session.user.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            You&apos;re not part of a group yet. Start one, or find a group to join.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard/onboarding" className={buttonVariants()}>Start a group</Link>
            <Link href="/discover" className={buttonVariants({ variant: "outline" })}>Find a group</Link>
          </div>
        </CardContent>
      </Card>
      </div>
    );
  }

  const { groupId, groupName } = session.activeMembership;
  const today = nairobiToday();

  const { totals, pendingFines, nextMeeting } = await withTenant(groupId, async (tx) => ({
    totals: await tx
      .select({
        memberCount: sql<number>`count(*)::int`,
        saved: sql<string>`coalesce(sum(${members.capital} + ${members.security} + ${members.personalSavings}), 0)`,
      })
      .from(members)
      .where(and(eq(members.groupId, groupId), eq(members.active, true)))
      .then((rows) => rows[0]),
    pendingFines: await tx.query.fines.findMany({
      where: and(eq(fines.groupId, groupId), eq(fines.status, "pending")),
      with: { member: true },
      orderBy: (f, { desc }) => [desc(f.createdAt)],
      limit: 5,
    }),
    nextMeeting: await tx.query.meetings.findFirst({
      where: and(eq(meetings.groupId, groupId), gte(meetings.meetingDate, today)),
      orderBy: (m, { asc }) => [asc(m.meetingDate)],
    }),
  }));

  // Tiles follow permissions, so nobody sees a button for something they can't do.
  const m = session.activeMembership;
  const nextSteps = await loadNextSteps(session as SessionWithGroup);

  const tiles: Tile[] = [
    ...(can(m, "money.record") ? [{ href: "/dashboard/collect", label: "Add Money", hint: "Record today's payments", icon: Wallet }] : []),
    ...(can(m, "meetings.manage") ? [{ href: "/dashboard/meetings", label: "Meetings", hint: "Who came today", icon: CalendarDays }] : []),
    ...(can(m, "loans.manage") ? [{ href: "/dashboard/loans", label: "Loans", hint: "Requests and repayments", icon: Landmark }] : []),
    ...(can(m, "fines.issue") ? [{ href: "/dashboard/fines", label: "Fines", hint: "Who owes what", icon: Gavel }] : []),
    { href: "/dashboard/statement", label: "My Money", hint: "What I have saved", icon: Wallet },
    ...(can(m, "loans.use") ? [{ href: "/dashboard/loans/apply", label: "Ask for Loan", hint: "Borrow from the group", icon: Landmark }] : []),
    ...(can(m, "welfare.use") ? [{ href: "/dashboard/welfare", label: "Get Help", hint: "Welfare support", icon: HeartHandshake }] : []),
    ...(can(m, "mgr.use") ? [{ href: "/dashboard/mgr", label: "Mzunguko", hint: "When I receive", icon: RefreshCw }] : []),
  ].slice(0, 4);

  return (
    <div className="space-y-6">
      {session.support && supportBlocked && (
        <Card className="border-red-500/50 bg-red-500/5">
          <CardContent className="pt-6 text-sm">Not done: {supportBlocked}</CardContent>
        </Card>
      )}
      <MyInvites invites={myInvites} />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Hello, {session.user.name.split(" ")[0]}</h1>
        <p className="text-base text-muted-foreground">
          {groupName} · {totals.memberCount} members · {ksh(totals.saved)} saved together
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(({ href, label, hint, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl border bg-card p-4 text-center hover:border-primary hover:bg-accent"
          >
            <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon className="size-7" />
            </span>
            <span className="text-lg font-bold leading-tight">{label}</span>
            <span className="text-sm text-muted-foreground">{hint}</span>
          </Link>
        ))}
      </div>

      <NextSteps steps={nextSteps} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fines not paid yet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {pendingFines.length === 0 && <p className="text-muted-foreground">None.</p>}
            {pendingFines.map((f) => (
              <div key={f.id} className="flex justify-between">
                <span>{f.member.name}</span>
                <span>{ksh(f.amount)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Next meeting</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {nextMeeting ? (
              <>
                <p className="font-medium">{nextMeeting.meetingDate}</p>
                {nextMeeting.venue && <p className="text-muted-foreground">{nextMeeting.venue}</p>}
              </>
            ) : (
              <p className="text-muted-foreground">No meeting planned.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
