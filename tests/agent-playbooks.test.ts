import { describe, expect, it } from "vitest";
import { planLoanReminders, planRematch, reminderKind } from "@/lib/domain/agent-playbooks";

describe("reminderKind", () => {
  const today = "2026-10-23";
  it("reminds 3 days before, on the day, and weekly while overdue", () => {
    expect(reminderKind("2026-10-26", today)).toBe("due_soon");
    expect(reminderKind("2026-10-23", today)).toBe("due_today");
    expect(reminderKind("2026-10-16", today)).toBe("overdue");
    expect(reminderKind("2026-10-09", today)).toBe("overdue");
  });
  it("stays quiet on other days", () => {
    for (const d of ["2026-10-25", "2026-10-24", "2026-10-22", "2026-10-17", null]) expect(reminderKind(d, today)).toBeNull();
  });
});

describe("planLoanReminders", () => {
  it("only messages members with a phone and a balance, and is deterministic", () => {
    const loans = [
      { id: 1, memberId: 1, memberName: "Wanjiku Kamau", phone: "254712345678", dueDate: "2026-10-23", amountRemaining: 4500 },
      { id: 2, memberId: 2, memberName: "No Phone", phone: null, dueDate: "2026-10-23", amountRemaining: 100 },
      { id: 3, memberId: 3, memberName: "Paid Up", phone: "254700000000", dueDate: "2026-10-23", amountRemaining: 0 },
    ];
    const a = planLoanReminders(loans, "2026-10-23", "Umoja");
    expect(a).toEqual([
      { loanId: 1, memberId: 1, phone: "254712345678", kind: "due_today", message: "Umoja: Hi Wanjiku, your loan balance of Ksh 4,500 is due today." },
    ]);
    expect(planLoanReminders(loans, "2026-10-23", "Umoja")).toEqual(a);
  });
});

describe("planRematch", () => {
  it("records payments that now point at exactly one member", () => {
    const roster = [
      { id: 1, memberNumber: "12", phone: null },
      { id: 2, memberNumber: "7", phone: null },
    ];
    const steps = planRematch(
      [
        { id: 10, source: "mpesa", accountRef: "12", payerPhone: null },
        { id: 11, source: "mpesa", accountRef: "99", payerPhone: null },
        { id: 12, source: "bank", accountRef: "Deposit 7 loan", payerPhone: null },
      ],
      roster,
      "capital",
    );
    expect(steps).toEqual([
      { paymentId: 10, memberId: 1, purpose: "capital", why: "matched by account" },
      { paymentId: 12, memberId: 2, purpose: "loan", why: "matched by account" },
    ]);
  });
});
