import "server-only";
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import { contributionDues, groups, loans, members, mgrRotations, mgrSlots } from "@/lib/db/schema";
import { nairobiToday } from "@/lib/domain/dates";

const OPEN_LOAN = ["active", "extended", "overdue"] as const;

export type MyMonth = {
  saved: number;
  /** This month's contribution: what's due, by when, and how much is still to pay. */
  due: { date: string; amount: number; paid: number; status: "paid" | "pending" | "overdue" | "waived" | "upcoming" } | null;
  nextTurn: { date: string | null; amount: number | null } | null;
  loan: { remaining: number; dueDate: string | null; overdue: boolean } | null;
  unpaidFines: number;
};

/** A member's own month at a glance — the top of Home and My Money. */
export async function loadMyMonth(tx: Tx, groupId: number, memberId: number): Promise<MyMonth | null> {
  const me = await tx.query.members.findFirst({ where: and(eq(members.id, memberId), eq(members.groupId, groupId)) });
  if (!me) return null;
  const group = await tx.query.groups.findFirst({ where: eq(groups.id, groupId), columns: { contributionDay: true, sharePrice: true, mgrEnabled: true, loansEnabled: true } });
  const today = nairobiToday();
  const monthStart = `${today.slice(0, 7)}-01`;

  const dueRow = await tx.query.contributionDues.findFirst({
    where: and(eq(contributionDues.memberId, memberId), gte(contributionDues.dueDate, monthStart)),
    orderBy: [desc(contributionDues.dueDate)],
  });
  let due: MyMonth["due"] = null;
  if (dueRow) {
    due = { date: dueRow.dueDate, amount: Number(dueRow.amountDue), paid: Number(dueRow.amountPaid), status: dueRow.status };
  } else if (group && Number(group.sharePrice) > 0) {
    // Not generated yet this month: show when it will be due.
    const [y, m] = today.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const day = Math.min(group.contributionDay, last);
    const date = `${today.slice(0, 7)}-${String(day).padStart(2, "0")}`;
    if (date >= today) due = { date, amount: Number(group.sharePrice), paid: 0, status: "upcoming" };
  }

  let nextTurn: MyMonth["nextTurn"] = null;
  if (group?.mgrEnabled) {
    const rotation = await tx.query.mgrRotations.findFirst({ where: and(eq(mgrRotations.groupId, groupId), eq(mgrRotations.status, "active")), columns: { id: true } });
    if (rotation) {
      const slot = await tx.query.mgrSlots.findFirst({
        where: and(eq(mgrSlots.rotationId, rotation.id), eq(mgrSlots.memberId, memberId), inArray(mgrSlots.status, ["claimed", "auto_assigned"])),
        orderBy: [asc(mgrSlots.cycleNumber)],
      });
      if (slot) nextTurn = { date: slot.scheduledDate, amount: slot.payoutAmount === null ? null : Number(slot.payoutAmount) };
    }
  }

  let loan: MyMonth["loan"] = null;
  if (group?.loansEnabled) {
    const open = await tx.query.loans.findMany({
      where: and(eq(loans.memberId, memberId), inArray(loans.status, [...OPEN_LOAN])),
      orderBy: [asc(loans.dueDate)],
    });
    if (open.length) {
      loan = {
        remaining: open.reduce((s, l) => s + Number(l.amountRemaining), 0),
        dueDate: open[0].dueDate,
        overdue: open.some((l) => l.status === "overdue"),
      };
    }
  }

  return {
    saved: Number(me.capital) + Number(me.personalSavings),
    due,
    nextTurn,
    loan,
    unpaidFines: Number(me.totalFines),
  };
}
