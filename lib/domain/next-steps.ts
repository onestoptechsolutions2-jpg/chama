/**
 * Next steps — the in-app assistant. Plain rules, not a language model:
 * the same records always give the same list, every item says why it's
 * there and links to the one screen that deals with it. Each person sees
 * only what their role can act on (the `can` flags come from the
 * permission matrix). Setup items first for a new group, then urgent work,
 * then reminders.
 */
export type NextStep = {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  href: string;
  action: string;
};

export type NextStepsInput = {
  can: {
    membersAdd: boolean;
    membersManage: boolean;
    membersApprove: boolean;
    moneyRecord: boolean;
    loansManage: boolean;
    welfareManage: boolean;
    settingsManage: boolean;
    rulesManage: boolean;
    approveWithdrawal: boolean;
  };
  setup: {
    registrationComplete: boolean;
    missingOffices: string[];
    memberCount: number;
    hasPaybill: boolean;
    ruleCount: number;
    contributionCount: number;
    pendingInvites: number;
  };
  work: {
    unmatchedPayments: number;
    pendingJoinRequests: number;
    pendingLoanApplications: number;
    overdueLoans: number;
    pendingWelfareRequests: number;
    /** Group-wallet withdrawals someone else asked for, waiting for this official. */
    withdrawalsToApprove: number;
  };
  me: {
    hasMemberRecord: boolean;
    pendingGuaranteeRequests: number;
    pendingWelfareApprovals: number;
    unpaidFines: number;
    loanOverdue: boolean;
    loanDueInDays: number | null;
    mgrChoicesOpen: boolean;
    mgrHasChosen: boolean;
    kycIncomplete: boolean;
  };
};

const ksh = (n: number) => `Ksh ${Math.round(n).toLocaleString("en-KE")}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function generateNextSteps(input: NextStepsInput): NextStep[] {
  const { can, setup, work, me } = input;
  const steps: NextStep[] = [];
  const add = (s: NextStep) => steps.push(s);

  // ── Setting up the group ──
  if (!setup.registrationComplete && setup.missingOffices.length && can.membersManage) {
    add({
      id: "invite-officials",
      severity: "warning",
      title: `Invite your ${setup.missingOffices.join(" and ")}`,
      detail:
        setup.pendingInvites > 0
          ? `${plural(setup.pendingInvites, "invite")} waiting to be accepted. The group can't approve new members until every office is filled.`
          : "Add them on Members with their phone number and role. The group can't approve new members until every office is filled.",
      href: "/dashboard/members",
      action: "Invite",
    });
  }
  if (setup.memberCount < 3 && can.membersAdd) {
    add({ id: "add-members", severity: "info", title: "Add your members", detail: "Type them in one by one, or upload your list as a file.", href: "/dashboard/members", action: "Add members" });
  }
  if (!setup.hasPaybill && can.settingsManage) {
    add({
      id: "connect-paybill",
      severity: "info",
      title: "Connect your M-Pesa paybill or till",
      detail: "Members pay with their member number and the payment records itself, with an SMS receipt.",
      href: "/dashboard/payments",
      action: "Set up",
    });
  }
  if (setup.ruleCount === 0 && can.rulesManage) {
    add({ id: "add-rules", severity: "info", title: "Write down your rules", detail: "Start from ready-made rules and edit them to fit.", href: "/dashboard/rules", action: "Add rules" });
  }
  if (setup.contributionCount === 0 && setup.memberCount > 0 && can.moneyRecord) {
    add({ id: "first-collection", severity: "info", title: "Record your first collection", detail: "Type what each member paid on one screen and save once.", href: "/dashboard/collect", action: "Record money" });
  }

  // ── Work waiting for officials ──
  if (work.overdueLoans > 0 && can.loansManage) {
    add({ id: "overdue-loans", severity: "critical", title: `${plural(work.overdueLoans, "loan")} overdue`, detail: "Follow up with the borrowers and their guarantors.", href: "/dashboard/loans", action: "See loans" });
  }
  if (work.unmatchedPayments > 0 && can.moneyRecord) {
    add({
      id: "unmatched-payments",
      severity: "warning",
      title: `${plural(work.unmatchedPayments, "payment")} ${work.unmatchedPayments === 1 ? "needs" : "need"} matching`,
      detail: "We couldn't tell who paid. Pick the member and they get their receipt.",
      href: "/dashboard/payments",
      action: "Match",
    });
  }
  if (work.withdrawalsToApprove > 0 && can.approveWithdrawal) {
    add({
      id: "approve-withdrawals",
      severity: "warning",
      title: `${plural(work.withdrawalsToApprove, "withdrawal")} waiting for your approval`,
      detail: "Another official asked to move money from the group wallet to the group's own account.",
      href: "/dashboard/payments",
      action: "Review",
    });
  }
  if (work.pendingJoinRequests > 0 && can.membersApprove) {
    add({ id: "join-requests", severity: "warning", title: `${plural(work.pendingJoinRequests, "person", "people")} ${work.pendingJoinRequests === 1 ? "wants" : "want"} to join`, detail: "Approve or decline their requests.", href: "/dashboard/pending-members", action: "Review" });
  }
  if (work.pendingLoanApplications > 0 && can.loansManage) {
    add({ id: "loan-applications", severity: "warning", title: `${plural(work.pendingLoanApplications, "loan request")} waiting`, detail: "Check guarantors and limits, then decide.", href: "/dashboard/loans", action: "Review" });
  }
  if (work.pendingWelfareRequests > 0 && can.welfareManage) {
    add({ id: "welfare-requests", severity: "warning", title: `${plural(work.pendingWelfareRequests, "welfare request")} waiting`, detail: "Members are waiting for help.", href: "/dashboard/welfare", action: "Review" });
  }

  // ── For me as a member ──
  if (me.loanOverdue) {
    add({ id: "my-loan-overdue", severity: "critical", title: "Your loan is overdue", detail: "Pay what you can now, or talk to the treasurer.", href: "/dashboard/loans/apply", action: "See my loan" });
  } else if (me.loanDueInDays !== null && me.loanDueInDays <= 7) {
    add({
      id: "my-loan-due",
      severity: "warning",
      title: me.loanDueInDays <= 0 ? "Your loan is due today" : `Your loan is due in ${plural(me.loanDueInDays, "day")}`,
      detail: "Pay on time to keep your loan limit.",
      href: "/dashboard/loans/apply",
      action: "See my loan",
    });
  }
  if (me.pendingGuaranteeRequests > 0) {
    add({ id: "guarantee-requests", severity: "warning", title: `${plural(me.pendingGuaranteeRequests, "member")} asked you to guarantee a loan`, detail: "Accept or decline so they aren't kept waiting.", href: "/dashboard/loans/apply", action: "Answer" });
  }
  if (me.pendingWelfareApprovals > 0) {
    add({ id: "welfare-cosign", severity: "warning", title: `${plural(me.pendingWelfareApprovals, "welfare request")} ${me.pendingWelfareApprovals === 1 ? "needs" : "need"} your approval`, detail: "Another official is waiting for your decision.", href: "/dashboard/welfare", action: "Decide" });
  }
  if (me.mgrChoicesOpen && !me.mgrHasChosen) {
    add({ id: "mgr-choose", severity: "info", title: "Choose your merry-go-round turn", detail: "Pick the rounds you'd like to receive in before choices close.", href: "/dashboard/mgr", action: "Choose" });
  }
  if (me.unpaidFines > 0) {
    add({ id: "my-fines", severity: "info", title: `You have ${ksh(me.unpaidFines)} in fines`, detail: "Pay at the next meeting or by M-Pesa.", href: "/dashboard/statement", action: "See details" });
  }
  if (me.hasMemberRecord && me.kycIncomplete) {
    add({ id: "kyc", severity: "info", title: "Finish your profile", detail: "Your ID and photo are needed for loans and registration papers.", href: "/dashboard/profile", action: "Finish" });
  }

  const rank = { critical: 0, warning: 1, info: 2 } as const;
  // Stable: same severity keeps the order above.
  return steps.map((s, i) => ({ s, i })).sort((a, b) => rank[a.s.severity] - rank[b.s.severity] || a.i - b.i).map((x) => x.s);
}
