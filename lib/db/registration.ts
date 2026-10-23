import "server-only";
import { and, eq } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import { groupMemberships, groups } from "@/lib/db/schema";
import { computeRegistrationComplete, type MembershipRole } from "@/lib/domain/officials";

/**
 * Recomputes groups.registrationComplete from the group's actual current
 * active roles — called after every role change rather than trusted to
 * stay in sync, so it can't go stale if e.g. a treasurer is later demoted.
 * Shared by updateMemberRoleAction and anything else that changes a
 * membership's role or status (join approval, login creation for a member).
 */
export async function refreshRegistrationStatus(tx: Tx, groupId: number): Promise<void> {
  const active = await tx
    .select({ role: groupMemberships.role })
    .from(groupMemberships)
    .where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.status, "active")));

  const complete = computeRegistrationComplete(active.map((r) => r.role as MembershipRole));

  await tx.update(groups).set({ registrationComplete: complete }).where(eq(groups.id, groupId));
}
