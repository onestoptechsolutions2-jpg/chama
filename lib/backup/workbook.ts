import "server-only";
import ExcelJS from "exceljs";
import { asc, eq } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import {
  attendance,
  contributions,
  fines,
  groupMemberships,
  groups,
  loanRepayments,
  loans,
  meetings,
  members,
  mgrCycles,
  mgrRotations,
  mgrSlots,
  projectContributions,
  projects,
  welfareAdvances,
  welfareFunds,
  welfareGrants,
  welfareRequests,
} from "@/lib/db/schema";

/**
 * A group's full record as one Excel workbook: a cover sheet with totals,
 * then one sheet per area. Read inside the group's own tenant transaction,
 * so it can only ever contain that group's data. Money is written as
 * numbers (so the sheet can add them up), dates as YYYY-MM-DD text.
 */
type Col = { header: string; key: string; width?: number };
type Row = Record<string, string | number | boolean | null>;

const num = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? null : Number(v));
const day = (v: Date | string | null | undefined) =>
  v === null || v === undefined ? null : typeof v === "string" ? v.slice(0, 10) : v.toISOString().slice(0, 10);

function addSheet(wb: ExcelJS.Workbook, name: string, cols: Col[], rows: Row[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width ?? Math.max(12, c.header.length + 2) }));
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  if (rows.length === 0) ws.addRow({ [cols[0].key]: "(none)" });
  return ws;
}

export async function buildGroupWorkbook(tx: Tx, groupId: number, backupDate: string): Promise<{ buffer: Buffer; fileName: string }> {
  const group = await tx.query.groups.findFirst({ where: eq(groups.id, groupId) });
  if (!group) throw new Error(`Group ${groupId} not found`);

  const roster = await tx.query.members.findMany({ where: eq(members.groupId, groupId), orderBy: [asc(members.name)] });
  const nameOf = new Map(roster.map((m) => [m.id, m.name]));
  const memberName = (id: number | null) => (id === null ? null : (nameOf.get(id) ?? `#${id}`));
  const roles = await tx
    .select({ userId: groupMemberships.userId, role: groupMemberships.role, status: groupMemberships.status })
    .from(groupMemberships)
    .where(eq(groupMemberships.groupId, groupId));
  const roleOf = new Map(roles.filter((r) => r.status === "active").map((r) => [r.userId, r.role]));

  const contribs = await tx.query.contributions.findMany({ where: eq(contributions.groupId, groupId), orderBy: [asc(contributions.createdAt)] });
  const rotations = await tx.query.mgrRotations.findMany({ where: eq(mgrRotations.groupId, groupId), orderBy: [asc(mgrRotations.number)] });
  const cycles = await tx.query.mgrCycles.findMany({ where: eq(mgrCycles.groupId, groupId), orderBy: [asc(mgrCycles.cycleNumber)] });
  const slots = await tx.query.mgrSlots.findMany({ where: eq(mgrSlots.groupId, groupId), orderBy: [asc(mgrSlots.cycleNumber), asc(mgrSlots.slotNumber)] });
  const fineRows = await tx.query.fines.findMany({ where: eq(fines.groupId, groupId), orderBy: [asc(fines.createdAt)] });
  const fund = await tx.query.welfareFunds.findFirst({ where: eq(welfareFunds.groupId, groupId) });
  const wRequests = await tx.query.welfareRequests.findMany({ where: eq(welfareRequests.groupId, groupId), orderBy: [asc(welfareRequests.createdAt)] });
  const wGrants = await tx.query.welfareGrants.findMany({ where: eq(welfareGrants.groupId, groupId), orderBy: [asc(welfareGrants.createdAt)] });
  const wAdvances = await tx.query.welfareAdvances.findMany({ where: eq(welfareAdvances.groupId, groupId), orderBy: [asc(welfareAdvances.createdAt)] });
  const projectRows = await tx.query.projects.findMany({ where: eq(projects.groupId, groupId), orderBy: [asc(projects.createdAt)] });
  const projectMoney = await tx.query.projectContributions.findMany({ where: eq(projectContributions.groupId, groupId), orderBy: [asc(projectContributions.createdAt)] });
  const loanRows = await tx.query.loans.findMany({ where: eq(loans.groupId, groupId), orderBy: [asc(loans.issuedDate)] });
  const repayments = await tx.query.loanRepayments.findMany({ where: eq(loanRepayments.groupId, groupId), orderBy: [asc(loanRepayments.createdAt)] });
  const meetingRows = await tx.query.meetings.findMany({ where: eq(meetings.groupId, groupId), orderBy: [asc(meetings.meetingDate)] });
  const attendanceRows = await tx.query.attendance.findMany({ where: eq(attendance.groupId, groupId) });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Chama";
  wb.created = new Date();

  // Cover
  const active = roster.filter((m) => m.active);
  const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
  const cover = wb.addWorksheet("Cover");
  cover.columns = [
    { key: "a", width: 34 },
    { key: "b", width: 24 },
  ];
  const coverRows: [string, string | number][] = [
    ["Group", group.name],
    ["Backup date", backupDate],
    ["Active members", active.length],
    ["Shares held (Ksh)", sum(active, (m) => Number(m.capital))],
    ["Personal savings (Ksh)", sum(active, (m) => Number(m.personalSavings))],
    ["Contributions recorded", contribs.length],
    ["Contributions total (Ksh)", sum(contribs.filter((c) => c.status === "paid"), (c) => Number(c.amount))],
    ["Loans outstanding (Ksh)", sum(loanRows.filter((l) => ["active", "extended", "overdue"].includes(l.status)), (l) => Number(l.amountRemaining))],
    ["Unpaid fines (Ksh)", sum(fineRows.filter((f) => f.status === "pending"), (f) => Number(f.amount))],
    ["Welfare fund (Ksh)", fund ? Number(fund.emergencyBalance) + Number(fund.longTermBalance) + Number(fund.advanceBalance) : 0],
    ["Merry-go-round turns paid", slots.filter((s) => s.status === "paid").length],
  ];
  cover.addRow(["Chama — group backup"]).font = { bold: true, size: 14 };
  cover.addRow([]);
  for (const [k, v] of coverRows) cover.addRow([k, v]);
  cover.addRow([]);
  cover.addRow(["Contains members' personal details and money. Keep it private."]).font = { italic: true };

  addSheet(
    wb,
    "Members",
    [
      { header: "Name", key: "name", width: 26 },
      { header: "Member no.", key: "number" },
      { header: "Phone", key: "phone", width: 16 },
      { header: "Email", key: "email", width: 24 },
      { header: "Role", key: "role" },
      { header: "Active", key: "active" },
      { header: "Joined", key: "joined" },
      { header: "Shares", key: "capital" },
      { header: "Security", key: "security" },
      { header: "Personal savings", key: "savings" },
      { header: "Welfare balance", key: "welfare" },
      { header: "Unpaid fines", key: "fines" },
      { header: "ID type", key: "idType" },
      { header: "ID number", key: "idNumber" },
    ],
    roster.map((m) => ({
      name: m.name,
      number: m.memberNumber,
      phone: m.phone,
      email: m.email,
      role: m.userId ? (roleOf.get(m.userId) ?? "member") : "member",
      active: m.active ? "yes" : "no",
      joined: day(m.joinedDate),
      capital: num(m.capital),
      security: num(m.security),
      savings: num(m.personalSavings),
      welfare: num(m.welfareBalance),
      fines: num(m.totalFines),
      idType: m.idType,
      idNumber: m.idNumber,
    })),
  );

  addSheet(
    wb,
    "Contributions",
    [
      { header: "Date", key: "date" },
      { header: "Member", key: "member", width: 26 },
      { header: "Type", key: "type" },
      { header: "Amount", key: "amount" },
      { header: "Status", key: "status" },
      { header: "Reference", key: "reference", width: 18 },
      { header: "Notes", key: "notes", width: 30 },
    ],
    contribs.map((c) => ({
      date: day(c.createdAt),
      member: memberName(c.memberId),
      type: c.type,
      amount: num(c.amount),
      status: c.status,
      reference: c.reference,
      notes: c.notes,
    })),
  );

  const rotationNo = new Map(rotations.map((r) => [r.id, r.number]));
  const mgr = addSheet(
    wb,
    "Merry-go-round",
    [
      { header: "Rotation", key: "rotation" },
      { header: "Cycle", key: "cycle" },
      { header: "Turn", key: "slot" },
      { header: "Date", key: "date" },
      { header: "Receiver", key: "member", width: 26 },
      { header: "Payout", key: "payout" },
      { header: "Status", key: "status" },
      { header: "Paid on", key: "paidAt" },
      { header: "Payout reference", key: "reference", width: 20 },
    ],
    slots.map((s) => ({
      rotation: rotationNo.get(s.rotationId) ?? null,
      cycle: s.cycleNumber,
      slot: s.slotNumber,
      date: day(s.scheduledDate),
      member: memberName(s.memberId),
      payout: num(s.payoutAmount),
      status: s.status,
      paidAt: day(s.paidAt),
      reference: s.payoutReference,
    })),
  );
  if (rotations.length > 0) {
    mgr.addRow([]);
    mgr.addRow(["Rotations"]).font = { bold: true };
    mgr.addRow(["Number", "Status", "Start", "End", "Frequency", "Contribution", "Cycles"]).font = { bold: true };
    for (const r of rotations) mgr.addRow([r.number, r.status, r.startDate, r.endDate, r.frequency, num(r.contributionAmount), r.totalCycles]);
    mgr.addRow([]);
    mgr.addRow(["Cycles"]).font = { bold: true };
    mgr.addRow(["Rotation", "Cycle", "Date", "Status", "Turns", "Payout per turn"]).font = { bold: true };
    for (const c of cycles) mgr.addRow([rotationNo.get(c.rotationId) ?? null, c.cycleNumber, c.scheduledDate, c.status, c.slotCount, num(c.payoutPerSlot)]);
  }

  addSheet(
    wb,
    "Fines",
    [
      { header: "Date", key: "date" },
      { header: "Member", key: "member", width: 26 },
      { header: "Type", key: "type" },
      { header: "Amount", key: "amount" },
      { header: "Status", key: "status" },
      { header: "Reason", key: "reason", width: 34 },
    ],
    fineRows.map((f) => ({ date: day(f.createdAt), member: memberName(f.memberId), type: f.type, amount: num(f.amount), status: f.status, reason: f.reason })),
  );

  const welfare = addSheet(
    wb,
    "Welfare",
    [
      { header: "Requested", key: "date" },
      { header: "Member", key: "member", width: 26 },
      { header: "Reason", key: "reason" },
      { header: "Beneficiary", key: "beneficiary", width: 20 },
      { header: "Asked (emergency)", key: "askE" },
      { header: "Asked (long-term)", key: "askL" },
      { header: "Asked (advance)", key: "askA" },
      { header: "Approved (emergency)", key: "okE" },
      { header: "Approved (long-term)", key: "okL" },
      { header: "Approved (advance)", key: "okA" },
      { header: "Status", key: "status" },
      { header: "Paid out", key: "disbursed" },
    ],
    wRequests.map((r) => ({
      date: day(r.createdAt),
      member: memberName(r.memberId),
      reason: r.reason,
      beneficiary: r.beneficiaryName,
      askE: num(r.requestedEmergencyAmount),
      askL: num(r.requestedLongTermAmount),
      askA: num(r.requestedAdvanceAmount),
      okE: num(r.approvedEmergencyAmount),
      okL: num(r.approvedLongTermAmount),
      okA: num(r.approvedAdvanceAmount),
      status: r.status,
      disbursed: day(r.disbursedAt),
    })),
  );
  welfare.addRow([]);
  welfare.addRow(["Fund"]).font = { bold: true };
  welfare.addRow(["Emergency", num(fund?.emergencyBalance ?? 0)]);
  welfare.addRow(["Long-term", num(fund?.longTermBalance ?? 0)]);
  welfare.addRow(["Advances", num(fund?.advanceBalance ?? 0)]);
  welfare.addRow([]);
  welfare.addRow(["Grants paid"]).font = { bold: true };
  welfare.addRow(["Date", "Request", "Emergency", "Long-term"]).font = { bold: true };
  for (const g of wGrants) welfare.addRow([day(g.disbursedAt ?? g.createdAt), g.requestId, num(g.emergencyAmount), num(g.longTermAmount)]);
  welfare.addRow([]);
  welfare.addRow(["Advances"]).font = { bold: true };
  welfare.addRow(["Issued", "Member", "Principal", "Repayable", "Remaining", "Status", "Due"]).font = { bold: true };
  for (const a of wAdvances) welfare.addRow([day(a.issuedDate), memberName(a.memberId), num(a.principal), num(a.totalRepayable), num(a.amountRemaining), a.status, day(a.dueDate)]);

  const projectName = new Map(projectRows.map((p) => [p.id, p.name]));
  const proj = addSheet(
    wb,
    "Projects",
    [
      { header: "Project", key: "name", width: 26 },
      { header: "Status", key: "status" },
      { header: "Target", key: "target" },
      { header: "Collected", key: "collected" },
      { header: "Start", key: "start" },
      { header: "End", key: "end" },
    ],
    projectRows.map((p) => ({ name: p.name, status: p.status, target: num(p.targetAmount), collected: num(p.collectedAmount), start: day(p.startDate), end: day(p.endDate) })),
  );
  proj.addRow([]);
  proj.addRow(["Project contributions"]).font = { bold: true };
  proj.addRow(["Date", "Project", "Member", "Amount", "Reference", "Notes"]).font = { bold: true };
  for (const c of projectMoney) proj.addRow([day(c.createdAt), projectName.get(c.projectId) ?? null, memberName(c.memberId), num(c.amount), c.reference, c.notes]);

  const loanSheet = addSheet(
    wb,
    "Loans",
    [
      { header: "Issued", key: "issued" },
      { header: "Member", key: "member", width: 26 },
      { header: "Principal", key: "principal" },
      { header: "Interest %", key: "rate" },
      { header: "Repayable", key: "repayable" },
      { header: "Remaining", key: "remaining" },
      { header: "Status", key: "status" },
      { header: "Due", key: "due" },
      { header: "Cleared", key: "cleared" },
      { header: "Purpose", key: "purpose", width: 24 },
    ],
    loanRows.map((l) => ({
      issued: day(l.issuedDate),
      member: memberName(l.memberId),
      principal: num(l.principal),
      rate: num(l.interestRate),
      repayable: num(l.totalRepayable),
      remaining: num(l.amountRemaining),
      status: l.status,
      due: day(l.dueDate),
      cleared: day(l.clearedDate),
      purpose: l.purpose,
    })),
  );
  const loanOwner = new Map(loanRows.map((l) => [l.id, l.memberId]));
  loanSheet.addRow([]);
  loanSheet.addRow(["Repayments"]).font = { bold: true };
  loanSheet.addRow(["Date", "Loan", "Member", "Amount", "Reference", "Notes"]).font = { bold: true };
  for (const r of repayments) loanSheet.addRow([day(r.createdAt), r.loanId, memberName(loanOwner.get(r.loanId) ?? null), num(r.amount), r.reference, r.notes]);

  const meetingDate = new Map(meetingRows.map((m) => [m.id, m.meetingDate]));
  const meetingSheet = addSheet(
    wb,
    "Meetings",
    [
      { header: "Date", key: "date" },
      { header: "Type", key: "type" },
      { header: "Venue", key: "venue", width: 20 },
      { header: "Quorum met", key: "quorum" },
      { header: "Agenda", key: "agenda", width: 30 },
      { header: "Minutes", key: "minutes", width: 40 },
    ],
    meetingRows.map((m) => ({ date: day(m.meetingDate), type: m.meetingType, venue: m.venue, quorum: m.quorumMet === null ? null : m.quorumMet ? "yes" : "no", agenda: m.agenda, minutes: m.minutes })),
  );
  meetingSheet.addRow([]);
  meetingSheet.addRow(["Attendance"]).font = { bold: true };
  meetingSheet.addRow(["Meeting date", "Member", "Status", "Fined", "Notes"]).font = { bold: true };
  for (const a of attendanceRows) meetingSheet.addRow([day(meetingDate.get(a.meetingId) ?? null), memberName(a.memberId), a.status, a.fineIssued ? "yes" : "no", a.notes]);

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const safeName = group.name.replace(/[^\w-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || `group-${groupId}`;
  return { buffer, fileName: `${safeName}-backup-${backupDate}.xlsx` };
}
