import "server-only";
import { z } from "zod";
import { and, eq, gte } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import { loans, members, smsMessages } from "@/lib/db/schema";
import { nairobiToday } from "@/lib/domain/dates";
import { planLoanReminders } from "@/lib/domain/agent-playbooks";
import { sendSms } from "@/lib/notify/sms";
import { defineCommand, done, fail } from "./types";

/**
 * One loan reminder SMS. Re-applies the rule (lib/domain/agent-playbooks.ts)
 * to the loan as it is now, so a plan made earlier can't send a wrong or
 * duplicate message; the SMS goes out after the audit row is committed.
 */
/** Same text to the same phone today already (e.g. the daily run, then a manual one)? */
export async function alreadySentToday(tx: Tx, groupId: number, phone: string, message: string): Promise<boolean> {
  const since = new Date(`${nairobiToday()}T00:00:00+03:00`);
  const [row] = await tx
    .select({ id: smsMessages.id })
    .from(smsMessages)
    .where(and(eq(smsMessages.groupId, groupId), eq(smsMessages.toPhone, phone), eq(smsMessages.body, message), gte(smsMessages.createdAt, since)))
    .limit(1);
  return Boolean(row);
}

export const sendLoanReminder = defineCommand({
  name: "reminders.loanDue",
  description: "SMS a borrower about a loan due soon, due today, or overdue (by the fixed reminder rule).",
  permission: "loans.manage",
  input: z.object({ loanId: z.coerce.number().int().positive() }),
  run: async (tx, actor, input) => {
    const loan = await tx.query.loans.findFirst({ where: and(eq(loans.id, input.loanId), eq(loans.groupId, actor.groupId)) });
    if (!loan || !["active", "extended", "overdue"].includes(loan.status)) return fail("Loan is not open");
    const member = await tx.query.members.findFirst({ where: eq(members.id, loan.memberId) });
    if (!member) return fail("Member not found", 404);
    const [step] = planLoanReminders(
      [{ id: loan.id, memberId: member.id, memberName: member.name, phone: member.phone, dueDate: loan.dueDate, amountRemaining: Number(loan.amountRemaining) }],
      nairobiToday(),
      actor.groupName,
    );
    if (!step) return fail("No reminder is due for this loan today");
    if (await alreadySentToday(tx, actor.groupId, step.phone, step.message)) return fail("Already reminded today");
    return done(step);
  },
  afterCommit: async (actor, _input, step) => {
    await sendSms(actor.groupId, step.phone, step.message);
  },
});
