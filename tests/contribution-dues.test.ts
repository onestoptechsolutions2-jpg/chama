import { describe, expect, it } from "vitest";
import { allocateToDues, dueReminderKind, dueReminderText } from "@/lib/domain/contribution-dues";

describe("contribution dues", () => {
  it("spreads a payment over the oldest open dues", () => {
    const dues = [
      { id: 1, amountDue: 1000, amountPaid: 400 },
      { id: 2, amountDue: 1000, amountPaid: 0 },
    ];
    expect(allocateToDues(1000, dues)).toEqual([
      { id: 1, amountPaid: 1000, paid: true },
      { id: 2, amountPaid: 400, paid: false },
    ]);
    expect(allocateToDues(5000, dues)).toEqual([
      { id: 1, amountPaid: 1000, paid: true },
      { id: 2, amountPaid: 1000, paid: true },
    ]);
    expect(allocateToDues(0, dues)).toEqual([]);
  });

  it("reminds on the due date and three days later", () => {
    expect(dueReminderKind("2026-11-05", "2026-11-05")).toBe("due_today");
    expect(dueReminderKind("2026-11-05", "2026-11-08")).toBe("fine_soon");
    expect(dueReminderKind("2026-11-05", "2026-11-06")).toBeNull();
    expect(dueReminderKind("2026-10-30", "2026-11-02")).toBe("fine_soon");
  });

  it("words the reminders", () => {
    expect(dueReminderText({ kind: "due_today", groupName: "Umoja", owed: 1000, dueDate: "2026-11-05", fine: 200, fineDate: "2026-11-10" })).toBe(
      "Umoja: your contribution of Ksh 1,000 is due today. Thank you!",
    );
    expect(dueReminderText({ kind: "fine_soon", groupName: "Umoja", owed: 600, dueDate: "2026-11-05", fine: 200, fineDate: "2026-11-10" })).toBe(
      "Umoja: reminder, your contribution of Ksh 600 (due 2026-11-05) is still unpaid. A fine of Ksh 200 applies after 2026-11-10.",
    );
  });
});
