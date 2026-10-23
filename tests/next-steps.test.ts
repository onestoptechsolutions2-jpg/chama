import { describe, expect, it } from "vitest";
import { generateNextSteps, type NextStepsInput } from "@/lib/domain/next-steps";

const none = {
  membersAdd: false,
  membersManage: false,
  membersApprove: false,
  moneyRecord: false,
  loansManage: false,
  welfareManage: false,
  settingsManage: false,
  rulesManage: false,
};
const admin = Object.fromEntries(Object.keys(none).map((k) => [k, true])) as typeof none;
const base: NextStepsInput = {
  can: none,
  setup: { registrationComplete: true, missingOffices: [], memberCount: 20, hasPaybill: true, ruleCount: 5, contributionCount: 10, pendingInvites: 0 },
  work: { unmatchedPayments: 0, pendingJoinRequests: 0, pendingLoanApplications: 0, overdueLoans: 0, pendingWelfareRequests: 0 },
  me: { hasMemberRecord: true, pendingGuaranteeRequests: 0, pendingWelfareApprovals: 0, unpaidFines: 0, loanOverdue: false, loanDueInDays: null, mgrChoicesOpen: false, mgrHasChosen: false, kycIncomplete: false },
};

describe("generateNextSteps", () => {
  it("walks a new group's admin through setup", () => {
    const ids = generateNextSteps({
      ...base,
      can: admin,
      setup: { registrationComplete: false, missingOffices: ["Treasurer", "Secretary"], memberCount: 1, hasPaybill: false, ruleCount: 0, contributionCount: 0, pendingInvites: 0 },
    }).map((s) => s.id);
    expect(ids).toEqual(["invite-officials", "add-members", "connect-paybill", "add-rules", "first-collection"]);
  });

  it("only shows what the person can act on", () => {
    const steps = generateNextSteps({ ...base, work: { ...base.work, unmatchedPayments: 3, overdueLoans: 2 } });
    expect(steps).toEqual([]);
  });

  it("puts urgent work first", () => {
    const steps = generateNextSteps({
      ...base,
      can: admin,
      work: { ...base.work, unmatchedPayments: 1, overdueLoans: 2 },
      me: { ...base.me, unpaidFines: 200 },
    });
    expect(steps.map((s) => s.id)).toEqual(["overdue-loans", "unmatched-payments", "my-fines"]);
    expect(steps[0].title).toBe("2 loans overdue");
    expect(steps[1].title).toBe("1 payment needs matching");
  });

  it("reminds a member about their own loan, guarantees and turns", () => {
    const ids = generateNextSteps({
      ...base,
      me: { ...base.me, loanDueInDays: 3, pendingGuaranteeRequests: 1, mgrChoicesOpen: true, kycIncomplete: true },
    }).map((s) => s.id);
    expect(ids).toEqual(["my-loan-due", "guarantee-requests", "mgr-choose", "kyc"]);
  });

  it("is deterministic", () => {
    const input = { ...base, can: admin, work: { ...base.work, pendingJoinRequests: 2 } };
    expect(generateNextSteps(input)).toEqual(generateNextSteps(input));
  });
});
