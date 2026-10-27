import Link from "next/link";
import { formatDay, nairobiToday } from "@/lib/domain/dates";
import { listMyInvites } from "@/lib/invites/data";
import { MyInvites } from "@/components/feature/my-invites";
import { redirect } from "next/navigation";
import { and, eq, gte, sql } from "drizzle-orm";
import { Landmark, Wallet, HeartHandshake, CalendarDays, Gavel, RefreshCw, type LucideIcon } from "lucide-react";
import { requireSession, type SessionWithGroup } from "@/lib/auth/session";
import { loadNextSteps } from "@/lib/next-steps/data";
import { NextSteps } from "@/components/feature/next-steps";
import { FundCard } from "@/components/feature/fund-card";
import { fundSummary } from "@/lib/funds/funds";
import { can, canPlatform } from "@/lib/auth/permissions";
import { withTenant } from "@/lib/db/rls";
import { members, fines, meetings } from "@/lib/db/schema";
import { loadMyMonth } from "@/lib/members/my-month";
import { MyMonthCard } from "@/components/feature/my-month-card";
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
  const m = session.activeMembership;
  // Officials (members.view) get "what needs me"; members get "my month".
  const isOfficial = can(m, "members.view");

  const { totals, finesOwed, nextMeeting, myMonth } = await withTenant(groupId, async (tx) => ({
    totals: await tx
      .select({
        memberCount: sql<number>`count(*)::int`,
        saved: sql<string>`coalesce(sum(${members.capital} + ${members.security} + ${members.personalSavings}), 0)`,
      })
      .from(members)
      .where(and(eq(members.groupId, groupId), eq(members.active, true)))
      .then((rows) => rows[0]),
    finesOwed: isOfficial
      ? await tx
          .select({ count: sql<number>`count(*)::int`, total: sql<string>`coalesce(sum(${fines.amount}), 0)` })
          .from(fines)
          .where(and(eq(fines.groupId, groupId), eq(fines.status, "pending")))
          .then((rows) => rows[0])
      : null,
    nextMeeting: await tx.query.meetings.findFirst({
      where: and(eq(meetings.groupId, groupId), gte(meetings.meetingDate, today)),
      orderBy: (mt, { asc }) => [asc(mt.meetingDate)],
    }),
    myMonth: m.memberId ? await loadMyMonth(tx, groupId, m.memberId) : null,
  }));

  const nextSteps = await loadNextSteps(session as SessionWithGroup);
  // A funeral fund's committee sees the fund first (lib/funds/funds.ts).
  const fund = isOfficial ? await fundSummary(groupId) : null;

  // Shortcuts follow permissions, so nobody sees a button for something they can't do.
  const shortcuts: Tile[] = isOfficial
    ? [
        ...(can(m, "money.record") ? [{ href: "/dashboard/collect", label: "Record money", hint: "", icon: Wallet }] : []),
        ...(can(m, "meetings.manage") ? [{ href: "/dashboard/meetings", label: "Meetings", hint: "", icon: CalendarDays }] : []),
        ...(can(m, "loans.manage") ? [{ href: "/dashboard/loans", label: "Loans", hint: "", icon: Landmark }] : []),
        ...(can(m, "fines.issue") ? [{ href: "/dashboard/fines", label: "Fines", hint: "", icon: Gavel }] : []),
        ...(can(m, "mgr.use") ? [{ href: "/dashboard/mgr", label: "Merry-go-round", hint: "", icon: RefreshCw }] : []),
        ...(can(m, "welfare.use") ? [{ href: "/dashboard/welfare", label: "Welfare", hint: "", icon: HeartHandshake }] : []),
      ].slice(0, 4)
    : [
        { href: "/dashboard/statement", label: "My money", hint: "", icon: Wallet },
        ...(can(m, "mgr.use") ? [{ href: "/dashboard/mgr", label: "Merry-go-round", hint: "", icon: RefreshCw }] : []),
        ...(can(m, "loans.use") ? [{ href: "/dashboard/loans/apply", label: "Ask for a loan", hint: "", icon: Landmark }] : []),
        ...(can(m, "welfare.use") ? [{ href: "/dashboard/welfare", label: "Get help", hint: "", icon: HeartHandshake }] : []),
      ].slice(0, 4);

  const shortcutRow = (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {shortcuts.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex min-h-14 items-center gap-3 rounded-xl border bg-card px-3 py-2 font-medium hover:border-primary hover:bg-accent"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon className="size-5" />
          </span>
          <span className="leading-tight">{label}</span>
        </Link>
      ))}
    </div>
  );

  const comingUp = (
    <Card>
      <CardContent className="space-y-1 pt-6 text-sm">
        <p>
          <span className="text-muted-foreground">Next meeting: </span>
          {nextMeeting ? (
            <span className="font-medium">
              {formatDay(nextMeeting.meetingDate, today)}
              {nextMeeting.venue ? ` · ${nextMeeting.venue}` : ""}
            </span>
          ) : (
            <span className="text-muted-foreground">none planned</span>
          )}
        </p>
        {finesOwed && finesOwed.count > 0 && (
          <p>
            <span className="text-muted-foreground">Unpaid fines: </span>
            <Link href="/dashboard/fines" className="font-medium underline-offset-2 hover:underline">
              {finesOwed.count} · {ksh(finesOwed.total)}
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-5">
      {session.support && supportBlocked && (
        <Card className="border-red-500/50 bg-red-500/5">
          <CardContent className="pt-6 text-sm">Not done: {supportBlocked}</CardContent>
        </Card>
      )}
      <MyInvites invites={myInvites} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Hello, {session.user.name.split(" ")[0]}</h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          {groupName} · {totals.memberCount} members · {ksh(totals.saved)} saved together
        </p>
      </div>

      {isOfficial ? (
        <>
          {fund && <FundCard s={fund} canWithdraw={can(m, "money.withdraw") || can(m, "money.approveWithdrawal")} />}
          <NextSteps steps={nextSteps} limit={5} title="Needs you" emptyText="Nothing waiting on you right now." />
          {shortcutRow}
          {myMonth && <MyMonthCard month={myMonth} title="Your own month" />}
          {comingUp}
        </>
      ) : (
        <>
          {myMonth && <MyMonthCard month={myMonth} />}
          <NextSteps steps={nextSteps} title="To do" />
          {shortcutRow}
          {comingUp}
        </>
      )}
    </div>
  );
}
