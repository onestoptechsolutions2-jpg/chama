import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withTenant } from "@/lib/db/rls";
import { fines } from "@/lib/db/schema";
import { apiAuth } from "@/lib/auth/api-response";

export async function GET(req: Request) {
  const auth = await apiAuth(req);
  if (auth instanceof NextResponse) return auth;

  const rows = await withTenant(auth.groupId, (tx) =>
    tx.query.fines.findMany({
      where: eq(fines.groupId, auth.groupId),
      orderBy: (f, { desc }) => [desc(f.createdAt)],
      limit: 200,
    }),
  );

  return NextResponse.json({ fines: rows });
}
