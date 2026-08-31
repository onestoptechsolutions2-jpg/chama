import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withTenant } from "@/lib/db/rls";
import { mgrCycles, mgrSlots } from "@/lib/db/schema";
import { apiAuth } from "@/lib/auth/api-response";

export async function GET(req: Request) {
  const auth = await apiAuth(req);
  if (auth instanceof NextResponse) return auth;

  const [cycles, slots] = await Promise.all([
    withTenant(auth.groupId, (tx) =>
      tx.query.mgrCycles.findMany({
        where: eq(mgrCycles.groupId, auth.groupId),
        orderBy: (c, { asc }) => [asc(c.cycleNumber)],
      }),
    ),
    withTenant(auth.groupId, (tx) =>
      tx.query.mgrSlots.findMany({
        where: eq(mgrSlots.groupId, auth.groupId),
        columns: {
          id: true,
          cycleNumber: true,
          slotNumber: true,
          memberId: true,
          status: true,
          payoutAmount: true,
          paidAt: true,
        },
      }),
    ),
  ]);

  return NextResponse.json({ cycles, slots });
}
