import { addDays } from "./dates";
import { matchPayment, type PaymentPurpose, type RosterEntry } from "./payment-matching";

/**
 * The agent's playbooks. The agent is NOT an AI model: each playbook is a
 * fixed rule that reads the group's records and returns a plan — the same
 * records always give the same plan, and every step names the rule that
 * produced it. The runner (lib/agent/run.ts) carries out a plan through the
 * normal commands, so the permission matrix, maker–checker and audit log all
 * apply, and nothing ever moves money out of the group.
 */
export type PlaybookId = "rematch-payments" | "loan-reminders";

export const PLAYBOOKS: Record<PlaybookId, { label: string; rule: string }> = {
  "rematch-payments": {
    label: "Match waiting payments",
    rule: "Re-checks every unmatched M-Pesa/bank/payroll payment against today's member numbers and phones; records the ones that now point at exactly one member.",
  },
  "loan-reminders": {
    label: "Loan reminders",
    rule: "SMS a borrower 3 days before the due date, on the due date, and every 7 days while overdue.",
  },
};

// ── Match waiting payments ──
export type WaitingPayment = { id: number; source: string; accountRef: string | null; payerPhone: string | null };
export type RematchStep = { paymentId: number; memberId: number; purpose: PaymentPurpose; why: string };

export function planRematch(waiting: WaitingPayment[], roster: RosterEntry[], defaultPurpose: PaymentPurpose): RematchStep[] {
  const steps: RematchStep[] = [];
  for (const p of waiting) {
    const m = matchPayment({ accountRef: p.accountRef, payerPhone: p.payerPhone }, roster, defaultPurpose, {
      scanNarration: p.source === "bank",
    });
    if (m) steps.push({ paymentId: p.id, memberId: m.memberId, purpose: m.purpose, why: `matched by ${m.by}` });
  }
  return steps;
}

// ── Loan reminders ──
export type OpenLoan = {
  id: number;
  memberId: number;
  memberName: string;
  phone: string | null;
  dueDate: string | null;
  amountRemaining: number;
};
export type ReminderKind = "due_soon" | "due_today" | "overdue";
export type ReminderStep = { loanId: number; memberId: number; phone: string; kind: ReminderKind; message: string };

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Which reminder (if any) a loan gets today. Pure: depends only on the due date and today. */
export function reminderKind(dueDate: string | null, today: string): ReminderKind | null {
  if (!dueDate) return null;
  if (dueDate === addDays(today, 3)) return "due_soon";
  if (dueDate === today) return "due_today";
  const late = daysBetween(dueDate, today);
  if (late > 0 && late % 7 === 0) return "overdue";
  return null;
}

export function planLoanReminders(loans: OpenLoan[], today: string, groupName: string): ReminderStep[] {
  const ksh = (n: number) => `Ksh ${Math.round(n).toLocaleString("en-KE")}`;
  const steps: ReminderStep[] = [];
  for (const l of loans) {
    const kind = reminderKind(l.dueDate, today);
    if (!kind || !l.phone || l.amountRemaining <= 0) continue;
    const first = l.memberName.split(" ")[0];
    const message =
      kind === "due_soon"
        ? `${groupName}: Hi ${first}, your loan balance of ${ksh(l.amountRemaining)} is due on ${l.dueDate}.`
        : kind === "due_today"
          ? `${groupName}: Hi ${first}, your loan balance of ${ksh(l.amountRemaining)} is due today.`
          : `${groupName}: Hi ${first}, your loan of ${ksh(l.amountRemaining)} is overdue since ${l.dueDate}. Please pay or talk to the treasurer.`;
    steps.push({ loanId: l.id, memberId: l.memberId, phone: l.phone, kind, message });
  }
  return steps;
}
