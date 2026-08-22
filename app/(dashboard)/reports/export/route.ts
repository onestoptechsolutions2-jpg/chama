import { and, eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { contributions, members } from "@/lib/db/schema";

function csvCell(value: unknown) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }

export async function GET() {
  const session = await requireRole("admin", "treasurer", "secretary");
  const groupId = session.activeMembership.groupId;
  const rows = await withTenant(groupId, (tx) => tx.select({ name: members.name, type: contributions.type, amount: contributions.amount, month: contributions.month, year: contributions.year, status: contributions.status, reference: contributions.reference, createdAt: contributions.createdAt }).from(contributions).innerJoin(members, eq(contributions.memberId, members.id)).where(and(eq(contributions.groupId, groupId), eq(contributions.status, "paid"))));
  const header = ["Member", "Type", "Amount", "Month", "Year", "Status", "Reference", "Recorded at"];
  const body = rows.map((row) => [row.name, row.type, row.amount, row.month, row.year, row.status, row.reference, row.createdAt.toISOString()].map(csvCell).join(","));
  return new Response([header.map(csvCell).join(","), ...body].join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="group-contributions-${groupId}.csv"` } });
}