/**
 * Pure, DB-free logic for compliance obligations (AGM dates, annual
 * returns, and similar recurring administrative deadlines) — see
 * app/api/cron/compliance-reminders/route.ts for where this is called from.
 */

export type ObligationStatus = "upcoming" | "due" | "overdue";

/** `dueDate`/`now` as plain "YYYY-MM-DD" / Date — status only ever tightens (upcoming -> due -> overdue), never loosens, so the cron only needs to check forward. */
export function resolveObligationStatus(
  dueDate: string,
  now: Date,
  reminderWindowDays: number,
): ObligationStatus {
  const due = new Date(dueDate);
  const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDateOnly = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.round((dueDateOnly.getTime() - nowDateOnly.getTime()) / 86_400_000);

  if (diffDays < 0) return "overdue";
  if (diffDays <= reminderWindowDays) return "due";
  return "upcoming";
}

/** The next occurrence's due date, `recurrenceMonths` after the one just completed — e.g. an annual AGM completed on 2026-03-05 with recurrenceMonths=12 next falls due 2027-03-05. */
export function nextOccurrence(dueDate: string, recurrenceMonths: number): string {
  const due = new Date(dueDate);
  const next = new Date(due.getFullYear(), due.getMonth() + recurrenceMonths, due.getDate());
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}
