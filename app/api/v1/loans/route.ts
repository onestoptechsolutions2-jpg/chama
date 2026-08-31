import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withTenant } from "@/lib/db/rls";
import { loans } from "@/lib/db/schema";
import { apiAuth } from "@/lib/auth/api-response";

export async function GET(req: Request) {
  const auth = await apiAuth(req);
  if (auth instanceof NextResponse) return auth;

  const rows = await withTenant(auth.groupId, (tx) =>
    tx.query.loans.findMany({
      where: eq(loans.groupId, auth.groupId),
      columns: {
        id: true,
        memberId: true,
        principal: true,
        interestRate: true,
        totalRepayable: true,
        amountRemaining: true,
        status: true,
        purpose: true,
        dueDate: true,
        createdAt: true,
      },
      orderBy: (l, { desc }) => [desc(l.createdAt)],
      limit: 200,
    }),
  );

  return NextResponse.json({ loans: rows });
}
