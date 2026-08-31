import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { withTenant } from "@/lib/db/rls";
import { members, loans, groups } from "@/lib/db/schema";
import { apiAuth } from "@/lib/auth/api-response";
import { computeCapitalPosition } from "@/lib/domain/capital";
import { getOrCreateWelfareFund } from "@/app/(dashboard)/dashboard/welfare/welfare-data";

const OUTSTANDING_LOAN_STATUSES = ["pending", "active", "extended", "overdue"] as const;

export async function GET(req: Request) {
  const auth = await apiAuth(req);
  if (auth instanceof NextResponse) return auth;
  const groupId = auth.groupId;

  const [group, memberTotals, loanTotals] = await Promise.all([
    withTenant(groupId, (tx) => tx.query.groups.findFirst({ where: eq(groups.id, groupId) })),
    withTenant(groupId, (tx) =>
      tx
        .select({
          capitalPool: members.capital,
          securityPool: members.security,
          personalSavingsPool: members.personalSavings,
        })
        .from(members)
        .where(and(eq(members.groupId, groupId), eq(members.active, true))),
    ),
    withTenant(groupId, (tx) =>
      tx
        .select({ principal: loans.principal, remaining: loans.amountRemaining })
        .from(loans)
        .where(and(eq(loans.groupId, groupId), inArray(loans.status, OUTSTANDING_LOAN_STATUSES))),
    ),
  ]);
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const welfareFund = group.welfareEnabled ? await withTenant(groupId, (tx) => getOrCreateWelfareFund(tx, groupId)) : null;

  const sum = (rows: { capitalPool?: string; securityPool?: string; personalSavingsPool?: string }[], key: "capitalPool" | "securityPool" | "personalSavingsPool") =>
    rows.reduce((s, r) => s + Number(r[key] ?? 0), 0);

  const position = computeCapitalPosition({
    capitalPool: sum(memberTotals, "capitalPool"),
    securityPool: sum(memberTotals, "securityPool"),
    personalSavingsPool: sum(memberTotals, "personalSavingsPool"),
    welfareAvailable: welfareFund
      ? Number(welfareFund.emergencyBalance) + Number(welfareFund.longTermBalance) + Number(welfareFund.advanceBalance)
      : 0,
    projectsCommitted: 0,
    loanPrincipalOutstanding: loanTotals.reduce((s, l) => s + Number(l.principal), 0),
    loanReceivableOutstanding: loanTotals.reduce((s, l) => s + Number(l.remaining), 0),
  });

  return NextResponse.json({ position });
}
