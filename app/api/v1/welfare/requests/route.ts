import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withTenant } from "@/lib/db/rls";
import { welfareRequests } from "@/lib/db/schema";
import { apiAuth } from "@/lib/auth/api-response";

/**
 * Read-only for now — submission goes through
 * lib/domain/welfare-approval.ts's tiered-approval/eligibility logic
 * (see submitWelfareRequestAction), which isn't yet duplicated here.
 * See docs/api.md.
 */
export async function GET(req: Request) {
  const auth = await apiAuth(req);
  if (auth instanceof NextResponse) return auth;

  const rows = await withTenant(auth.groupId, (tx) =>
    tx.query.welfareRequests.findMany({
      where: eq(welfareRequests.groupId, auth.groupId),
      orderBy: (r, { desc }) => [desc(r.createdAt)],
      limit: 200,
    }),
  );

  return NextResponse.json({ welfareRequests: rows });
}
