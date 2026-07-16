import { and, eq, sql } from "drizzle-orm";
import { requireProduct } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { welfareClaims, contributions } from "@/lib/db/schema";
import { PageHeader } from "@/components/feature/page-header";
import { WelfareManager } from "@/components/feature/welfare-manager";

export default async function WelfarePage() {
  const session = await requireProduct("welfare");
  const groupId = session.activeMembership.groupId;
  const isStaff = ["admin", "treasurer"].includes(session.activeMembership.role);

  const { claims, fund } = await withTenant(groupId, async (tx) => {
    const claims = await tx.query.welfareClaims.findMany({
      where: eq(welfareClaims.groupId, groupId),
      with: { member: true },
      orderBy: (c, { desc }) => [desc(c.createdAt)],
    });

    // Fixes bug 4 (docs/architecture.md): the original app CROSS JOINed an
    // aggregate over contributions with a filtered/grouped subquery over
    // welfare_claims, which returned ZERO rows (silently zeroing
    // total_collected) whenever there were no disbursed claims yet. Running
    // two independent, always-one-row aggregates and combining them in JS
    // avoids that whole class of "join returns nothing" bug entirely.
    const [[collected], [disbursed]] = await Promise.all([
      tx
        .select({
          total: sql<string>`coalesce(sum(${contributions.amount}), 0)`,
        })
        .from(contributions)
        .where(
          and(
            eq(contributions.groupId, groupId),
            eq(contributions.type, "welfare"),
            eq(contributions.status, "paid"),
          ),
        ),
      tx
        .select({
          total: sql<string>`coalesce(sum(${welfareClaims.amountApproved}), 0)`,
        })
        .from(welfareClaims)
        .where(and(eq(welfareClaims.groupId, groupId), eq(welfareClaims.status, "disbursed"))),
    ]);

    return {
      claims,
      fund: {
        totalCollected: Number(collected.total),
        totalDisbursed: Number(disbursed.total),
      },
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Welfare" description="Claims and the welfare fund." />
      <WelfareManager claims={claims} fund={fund} isStaff={isStaff} />
    </div>
  );
}
