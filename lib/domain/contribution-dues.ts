/**
 * Monthly contribution dues: each month a member owes the group's regular
 * amount by its contribution day. Savings paid in (shares or personal
 * savings) go towards their oldest open dues first; a due is paid once
 * covered. Pure rules — lib/commands/contributions.ts and the daily
 * contribution-dues job apply them.
 */
export const DUE_SAVINGS_TYPES = ["capital", "personal_savings"] as const;
export const GRACE_DAYS = 5;
/** Days after the due date when the second reminder goes (before the fine). */
export const SECOND_REMINDER_DAYS = 3;

export type OpenDue = { id: number; amountDue: number; amountPaid: number };

/** How a payment spreads over open dues, oldest first. Whatever is left over is just savings. */
export function allocateToDues(amount: number, dues: OpenDue[]): { id: number; amountPaid: number; paid: boolean }[] {
  let left = Math.max(0, amount);
  const out = [];
  for (const d of dues) {
    if (left <= 0) break;
    const owed = Math.max(0, d.amountDue - d.amountPaid);
    if (owed <= 0) continue;
    const put = Math.min(owed, left);
    left -= put;
    const amountPaid = Math.round((d.amountPaid + put) * 100) / 100;
    out.push({ id: d.id, amountPaid, paid: amountPaid >= d.amountDue });
  }
  return out;
}

/** Which reminder (if any) a pending due gets today. Dates are YYYY-MM-DD. */
export function dueReminderKind(dueDate: string, today: string): "due_today" | "fine_soon" | null {
  if (dueDate === today) return "due_today";
  const second = new Date(`${dueDate}T00:00:00Z`);
  second.setUTCDate(second.getUTCDate() + SECOND_REMINDER_DAYS);
  return second.toISOString().slice(0, 10) === today ? "fine_soon" : null;
}

export function dueReminderText(input: {
  kind: "due_today" | "fine_soon";
  groupName: string;
  owed: number;
  dueDate: string;
  fine: number;
  fineDate: string;
}): string {
  const owed = `Ksh ${Math.ceil(input.owed).toLocaleString("en-KE")}`;
  if (input.kind === "due_today") return `${input.groupName}: your contribution of ${owed} is due today. Thank you!`;
  const fine = input.fine > 0 ? ` A fine of Ksh ${Math.round(input.fine).toLocaleString("en-KE")} applies after ${input.fineDate}.` : "";
  return `${input.groupName}: reminder, your contribution of ${owed} (due ${input.dueDate}) is still unpaid.${fine}`;
}
