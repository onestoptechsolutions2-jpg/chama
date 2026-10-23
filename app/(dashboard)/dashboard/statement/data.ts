import "server-only";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/lib/db/rls";
import { members, contributions, loans, fines, groups } from "@/lib/db/schema";

/** One member's full money history in one group — shared by My Money and the no-password statement link. */
export async function loadStatement(groupId: number, targetId: number) {
  // Fixes bug 2 (docs/architecture.md): the original app's /statement
  // endpoint queried contributions.payment_date and contributions.month_label,
  // neither of which exists on the contributions table (it has `month` as
  // an int and `createdAt`) — every call 500'd. This queries the real schema.
  return withTenant(
    groupId,
    async (tx) => {
      const member = await tx.query.members.findFirst({
        where: and(eq(members.id, targetId), eq(members.groupId, groupId)),
      });
      if (!member) return { member: undefined, contribs: [], memberLoans: [], repayments: [], memberFines: [], paybillNumber: null };
      const group = await tx.query.groups.findFirst({ where: eq(groups.id, groupId), columns: { paybillNumber: true } });
      const contribs = await tx.query.contributions.findMany({
        where: eq(contributions.memberId, targetId),
        orderBy: (c, { desc }) => [desc(c.createdAt)],
      });
      const memberLoans = await tx.query.loans.findMany({
        where: eq(loans.memberId, targetId),
        orderBy: (l, { desc }) => [desc(l.createdAt)],
      });
      const loanIds = memberLoans.map((l) => l.id);
      const repayments = loanIds.length
        ? await tx.query.loanRepayments.findMany({
            where: (r, { inArray }) => inArray(r.loanId, loanIds),
            orderBy: (r, { desc }) => [desc(r.createdAt)],
          })
        : [];
      const memberFines = await tx.query.fines.findMany({
        where: eq(fines.memberId, targetId),
        orderBy: (f, { desc }) => [desc(f.createdAt)],
      });
      return { member, contribs, memberLoans, repayments, memberFines, paybillNumber: group?.paybillNumber ?? null };
    },
  );
}
