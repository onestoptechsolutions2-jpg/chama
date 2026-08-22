import { and, eq, sql } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { contributions, fines, loans, members } from "@/lib/db/schema";
import { PageHeader } from "@/components/feature/page-header";
import { ReportsView } from "@/components/feature/reports-view";

export default async function ReportsPage() {
  const session = await requireRole("admin", "treasurer", "secretary");
  const groupId = session.activeMembership.groupId;
  const report = await withTenant(groupId, async (tx) => {
    const monthly = await tx.select({ year: contributions.year, month: contributions.month, total: sql<string>`coalesce(sum(${contributions.amount}), 0)` })
        .from(contributions).where(and(eq(contributions.groupId, groupId), eq(contributions.status, "paid")))
        .groupBy(contributions.year, contributions.month).orderBy(contributions.year, contributions.month);
    const balances = await tx.select({ name: members.name, total: sql<string>`(${members.capital} + ${members.security} + ${members.personalSavings})` })
        .from(members).where(and(eq(members.groupId, groupId), eq(members.active, true))).orderBy(sql`(${members.capital} + ${members.security} + ${members.personalSavings}) desc`).limit(10);
    const loansByStatus = await tx.select({ status: loans.status, count: sql<number>`count(*)::int`, outstanding: sql<string>`coalesce(sum(${loans.amountRemaining}), 0)` })
        .from(loans).where(eq(loans.groupId, groupId)).groupBy(loans.status);
    const finesByStatus = await tx.select({ status: fines.status, total: sql<string>`coalesce(sum(${fines.amount}), 0)` })
        .from(fines).where(eq(fines.groupId, groupId)).groupBy(fines.status);
    return { monthly, balances, loansByStatus, finesByStatus };
  });

  return <div className="space-y-6"><PageHeader title="Reports" description="A clear view of group performance and financial activity." /><ReportsView report={report} /></div>;
}