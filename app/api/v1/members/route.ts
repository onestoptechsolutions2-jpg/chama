import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withTenant } from "@/lib/db/rls";
import { members } from "@/lib/db/schema";
import { apiAuth } from "@/lib/auth/api-response";

export async function GET(req: Request) {
  const auth = await apiAuth(req);
  if (auth instanceof NextResponse) return auth;

  const rows = await withTenant(auth.groupId, (tx) =>
    tx.query.members.findMany({
      where: eq(members.groupId, auth.groupId),
      columns: {
        id: true,
        name: true,
        phone: true,
        email: true,
        capital: true,
        security: true,
        personalSavings: true,
        totalFines: true,
        active: true,
        joinedDate: true,
      },
      orderBy: (m, { asc }) => [asc(m.name)],
    }),
  );

  return NextResponse.json({ members: rows });
}
