import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withTenant } from "@/lib/db/rls";
import { groups } from "@/lib/db/schema";
import { apiAuth } from "@/lib/auth/api-response";

export async function GET(req: Request) {
  const auth = await apiAuth(req);
  if (auth instanceof NextResponse) return auth;

  const group = await withTenant(auth.groupId, (tx) =>
    tx.query.groups.findFirst({
      where: eq(groups.id, auth.groupId),
      columns: {
        id: true,
        name: true,
        type: true,
        description: true,
        currency: true,
        loansEnabled: true,
        mgrEnabled: true,
        welfareEnabled: true,
        projectsEnabled: true,
        registrationComplete: true,
      },
    }),
  );
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  return NextResponse.json({ group });
}
