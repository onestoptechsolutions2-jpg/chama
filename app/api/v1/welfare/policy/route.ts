import { NextResponse } from "next/server";
import { withTenant } from "@/lib/db/rls";
import { apiAuth } from "@/lib/auth/api-response";
import { getOrCreateWelfarePolicy } from "@/app/(dashboard)/dashboard/welfare/welfare-data";

/** A group's welfare policy — funding method, reserve-allocation split, grant/advance caps, approval tiers, cooldown/tenure rules — so an integrator can build against real limits instead of guessing. */
export async function GET(req: Request) {
  const auth = await apiAuth(req);
  if (auth instanceof NextResponse) return auth;

  const policy = await withTenant(auth.groupId, (tx) => getOrCreateWelfarePolicy(tx, auth.groupId));

  return NextResponse.json({ policy });
}
