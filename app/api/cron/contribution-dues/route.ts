import { NextResponse } from "next/server";
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { isAuthorizedCronRequest, runCronJob } from "@/lib/cron/helpers";
import { withPlatformAdmin } from "@/lib/db/rls";
import { groups, members, contributionDues, fines } from "@/lib/db/schema";
import { GRACE_DAYS, SECOND_REMINDER_DAYS, dueReminderKind, dueReminderText } from "@/lib/domain/contribution-dues";
import { addDays, formatDate, nairobiToday } from "@/lib/domain/dates";
import { alreadySentToday } from "@/lib/commands/reminders";
import { sendSms } from "@/lib/notify/sms";


/**
 * Daily at 08:00 Africa/Nairobi (Vercel Cron is UTC-only, no DST in Nairobi
 * — see vercel.json: 05:00 UTC).
 *
 * Two passes, both scoped across every tenant via withPlatformAdmin() (this
 * job isn't request-scoped to one group the way a normal action is):
 *
 * 1. Generate this month's contribution_dues row for every active member
 *    whose group's contributionDay has arrived, if one doesn't already
 *    exist. Nothing in the original app (or any earlier phase of this
 *    rewrite) ever populated contribution_dues, which would have made this
 *    whole cron permanently a no-op — this generation step is a genuine
 *    addition, not a port, so the enforcement half actually has real rows
 *    to act on.
 * 2. SMS members who still owe: on the due date, and SECOND_REMINDER_DAYS
 *    later (before the fine). Paid dues are skipped — savings recorded by
 *    any door pay off dues (lib/commands/contributions.ts). Never the same
 *    message twice a day; within each group's SMS allowance.
 * 3. Fine members whose due is still pending GRACE_DAYS after the due
 *    date. Each row is processed in its own transaction with a row lock,
 *    so one bad row can't roll back another's already-committed fine.
 */
export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runCronJob("contribution-dues", async () => {
    await generateThisMonthsDues();
    await sendDueReminders();
    return fineOverdueDues();
  });

  if (!result.ranJob) {
    return NextResponse.json({ ok: true, skipped: "already running" });
  }
  return NextResponse.json({ ok: !result.error, ...result });
}

async function generateThisMonthsDues(): Promise<void> {
  await withPlatformAdmin(async (tx) => {
    const allGroups = await tx.query.groups.findMany({ where: eq(groups.active, true) });
    const today = new Date();

    for (const group of allGroups) {
      const dueDate = new Date(today.getFullYear(), today.getMonth(), group.contributionDay);
      if (dueDate > today) continue; // this month's due date hasn't arrived yet

      // Deliberately NOT toISOString().split("T")[0] here: `new Date(y, m, d)`
      // (separate numeric args) builds a LOCAL-time Date, but toISOString()
      // always converts to UTC — in any timezone ahead of UTC (e.g.
      // Africa/Nairobi, UTC+3) that silently shifts the date back by one day.
      const dueDateStr = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, "0")}-${String(dueDate.getDate()).padStart(2, "0")}`;
      const activeMembers = await tx.query.members.findMany({
        where: and(eq(members.groupId, group.id), eq(members.active, true)),
      });

      for (const member of activeMembers) {
        await tx
          .insert(contributionDues)
          .values({
            groupId: group.id,
            memberId: member.id,
            dueDate: dueDateStr,
            amountDue: group.sharePrice,
          })
          .onConflictDoNothing();
      }
    }
  });
}

async function sendDueReminders(): Promise<number> {
  const today = nairobiToday();
  const pending = await withPlatformAdmin((tx) =>
    tx
      .select({
        groupId: contributionDues.groupId,
        dueDate: contributionDues.dueDate,
        amountDue: contributionDues.amountDue,
        amountPaid: contributionDues.amountPaid,
        phone: members.phone,
        groupName: groups.name,
        fine: groups.fineAbsence,
      })
      .from(contributionDues)
      .innerJoin(members, eq(members.id, contributionDues.memberId))
      .innerJoin(groups, eq(groups.id, contributionDues.groupId))
      .where(
        and(
          eq(contributionDues.status, "pending"),
          eq(members.active, true),
          inArray(contributionDues.dueDate, [today, addDays(today, -SECOND_REMINDER_DAYS)]),
        ),
      ),
  );
  let sent = 0;
  for (const d of pending) {
    const kind = dueReminderKind(d.dueDate, today);
    const owed = Number(d.amountDue) - Number(d.amountPaid);
    if (!kind || !d.phone || owed <= 0) continue;
    const message = dueReminderText({
      kind,
      groupName: d.groupName,
      owed,
      dueDate: d.dueDate,
      fine: Number(d.fine),
      fineDate: addDays(d.dueDate, GRACE_DAYS),
    });
    if (await withPlatformAdmin((tx) => alreadySentToday(tx, d.groupId, d.phone!, message))) continue;
    if (await sendSms(d.groupId, d.phone, message)) sent++;
  }
  return sent;
}

async function fineOverdueDues(): Promise<number> {
  const overdue = await withPlatformAdmin((tx) =>
    tx
      .select({ id: contributionDues.id })
      .from(contributionDues)
      .where(
        and(
          eq(contributionDues.status, "pending"),
          isNull(contributionDues.fineId),
          lt(sql`${contributionDues.dueDate} + ${GRACE_DAYS}::integer`, sql`current_date`),
        ),
      ),
  );

  let count = 0;
  for (const { id } of overdue) {
    const fined = await withPlatformAdmin(async (tx) => {
      const [due] = await tx
        .select()
        .from(contributionDues)
        .where(eq(contributionDues.id, id))
        .for("update");
      if (!due || due.status !== "pending" || due.fineId) return false;

      const group = await tx.query.groups.findFirst({ where: eq(groups.id, due.groupId) });
      if (!group) return false;

      const [fine] = await tx
        .insert(fines)
        .values({
          groupId: due.groupId,
          memberId: due.memberId,
          amount: group.fineAbsence,
          reason: `Missed contribution due ${formatDate(due.dueDate)}`,
        })
        .returning();

      await tx
        .update(contributionDues)
        .set({ status: "overdue", fineId: fine.id, updatedAt: new Date() })
        .where(eq(contributionDues.id, due.id));

      await tx
        .update(members)
        .set({
          totalFines: sql`${members.totalFines} + ${group.fineAbsence}`,
          updatedAt: new Date(),
        })
        .where(eq(members.id, due.memberId));

      return true;
    });
    if (fined) count++;
  }
  return count;
}
