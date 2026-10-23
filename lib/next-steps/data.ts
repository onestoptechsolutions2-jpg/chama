import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { withTenant } from "@/lib/db/rls";
import { db } from "@/lib/db/client";
import {
  contributions,
  groupInvites,
  groupMemberships,
  groups,
  incomingPayments,
  loanApplications,
  loanGuarantors,
  loans,
  members,
  mgrMemberTurns,
  rules,
  welfareApprovals,
  welfareRequests,
} from "@/lib/db/schema";
import { can } from "@/lib/auth/permissions";
import type { SessionWithGroup } from "@/lib/auth/session";
import { choicesAreOpen } from "@/lib/domain/mgr";
import { nairobiToday } from "@/lib/domain/dates";
import { generateNextSteps, type NextStep, type NextStepsInput } from "@/lib/domain/next-steps";

const OPEN_LOAN = ["active", "extended", "overdue"] as const;
const OFFICES = [
  { role: "treasurer", label: "Treasurer" },
  { role: "secretary", label: "Secretary" },
  { role: "admin", label: "Chairperson" },
] as const;

const count = sql<number>`count(*)::int`;

/** Reads what Next steps needs (counts only) and runs the rules. One transaction, sequential queries. */
export async function loadNextSteps(session: SessionWithGroup): Promise<NextStep[]> {
  const m = session.activeMembership;
  const { groupId, memberId } = m;
  const flags: NextStepsInput["can"] = {
    membersAdd: can(m, "members.add"),
    membersManage: can(m, "members.manage"),
    membersApprove: can(m, "members.approve"),
    moneyRecord: can(m, "money.record"),
    loansManage: can(m, "loans.manage"),
    welfareManage: can(m, "welfare.manage"),
    settingsManage: can(m, "settings.manage"),
    rulesManage: can(m, "rules.manage"),
  };

  const roles = await db
    .select({ role: groupMemberships.role })
    .from(groupMemberships)
    .where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.status, "active")));
  const pendingJoinRequests = await db
    .select({ n: count })
    .from(groupMemberships)
    .where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.status, "pending")))
    .then((r) => r[0].n);
  const held = new Set(roles.map((r) => r.role));

  return withTenant(groupId, async (tx) => {
    const one = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
    const group = await tx.query.groups.findFirst({ where: eq(groups.id, groupId) });
    const me = memberId ? await tx.query.members.findFirst({ where: eq(members.id, memberId) }) : undefined;
    const myLoan = memberId
      ? await tx.query.loans.findFirst({
          where: and(eq(loans.memberId, memberId), inArray(loans.status, [...OPEN_LOAN])),
          orderBy: (l, { asc }) => [asc(l.dueDate)],
        })
      : undefined;
    const myTurns = memberId && group?.mgrEnabled ? await tx.query.mgrMemberTurns.findFirst({ where: eq(mgrMemberTurns.memberId, memberId) }) : undefined;
    const today = nairobiToday();

    const input: NextStepsInput = {
      can: flags,
      setup: {
        registrationComplete: group?.registrationComplete ?? false,
        missingOffices: OFFICES.filter((o) => !held.has(o.role)).map((o) => o.label),
        memberCount: await one(tx.select({ n: count }).from(members).where(and(eq(members.groupId, groupId), eq(members.active, true)))),
        hasPaybill: Boolean(group?.paybillNumber),
        ruleCount: await one(tx.select({ n: count }).from(rules).where(and(eq(rules.groupId, groupId), eq(rules.active, true)))),
        contributionCount: await one(tx.select({ n: count }).from(contributions).where(eq(contributions.groupId, groupId))),
        pendingInvites: await one(tx.select({ n: count }).from(groupInvites).where(and(eq(groupInvites.groupId, groupId), eq(groupInvites.status, "pending")))),
      },
      work: {
        unmatchedPayments: flags.moneyRecord
          ? await one(tx.select({ n: count }).from(incomingPayments).where(and(eq(incomingPayments.groupId, groupId), eq(incomingPayments.status, "unmatched"))))
          : 0,
        pendingJoinRequests,
        pendingLoanApplications: flags.loansManage
          ? await one(tx.select({ n: count }).from(loanApplications).where(and(eq(loanApplications.groupId, groupId), eq(loanApplications.status, "pending"))))
          : 0,
        overdueLoans: flags.loansManage
          ? await one(tx.select({ n: count }).from(loans).where(and(eq(loans.groupId, groupId), eq(loans.status, "overdue"))))
          : 0,
        pendingWelfareRequests: flags.welfareManage
          ? await one(tx.select({ n: count }).from(welfareRequests).where(and(eq(welfareRequests.groupId, groupId), inArray(welfareRequests.status, ["pending", "under_review"]))))
          : 0,
      },
      me: {
        hasMemberRecord: Boolean(me),
        pendingGuaranteeRequests: memberId
          ? await one(tx.select({ n: count }).from(loanGuarantors).where(and(eq(loanGuarantors.memberId, memberId), eq(loanGuarantors.status, "pending"))))
          : 0,
        pendingWelfareApprovals: memberId
          ? await one(tx.select({ n: count }).from(welfareApprovals).where(and(eq(welfareApprovals.memberId, memberId), eq(welfareApprovals.status, "pending"))))
          : 0,
        unpaidFines: me ? Number(me.totalFines) : 0,
        loanOverdue: myLoan?.status === "overdue",
        loanDueInDays: myLoan?.dueDate
          ? Math.round((Date.parse(`${myLoan.dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
          : null,
        mgrChoicesOpen: Boolean(group?.mgrEnabled && group.mgrChoicesCloseDate && choicesAreOpen(group.mgrChoicesCloseDate, today)),
        mgrHasChosen: Boolean(myTurns?.preferredCycles?.length),
        kycIncomplete: Boolean(me && !me.kycCompletedAt),
      },
    };
    return generateNextSteps(input);
  });
}
