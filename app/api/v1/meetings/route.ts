import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withTenant } from "@/lib/db/rls";
import { meetings } from "@/lib/db/schema";
import { apiAuth } from "@/lib/auth/api-response";

export async function GET(req: Request) {
  const auth = await apiAuth(req);
  if (auth instanceof NextResponse) return auth;

  const rows = await withTenant(auth.groupId, (tx) =>
    tx.query.meetings.findMany({
      where: eq(meetings.groupId, auth.groupId),
      orderBy: (m, { desc }) => [desc(m.meetingDate)],
      limit: 200,
    }),
  );

  return NextResponse.json({ meetings: rows });
}
