"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/lib/db/rls";
import { groupMemberships, members } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/session";

export type PendingMemberActionState = { error: string } | null;

export async function approveMembershipAction(membershipId: number): Promise<void> {
  const session = await requireRole("admin", "treasurer");
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, async (tx) => {
    const membership = await tx.query.groupMemberships.findFirst({
      where: and(
        eq(groupMemberships.id, membershipId),
        eq(groupMemberships.groupId, groupId),
        eq(groupMemberships.status, "pending"),
      ),
      with: { user: true },
    });
    if (!membership) return;

    await tx
      .update(groupMemberships)
      .set({ status: "active", reviewedBy: session.user.id, reviewedAt: new Date() })
      .where(eq(groupMemberships.id, membershipId));

    const existingMember = await tx.query.members.findFirst({
      where: and(eq(members.groupId, groupId), eq(members.userId, membership.userId)),
    });
    if (!existingMember) {
      await tx.insert(members).values({
        groupId,
        userId: membership.userId,
        name: membership.user.name,
        phone: membership.user.phone,
        email: membership.user.email,
      });
    }
  });

  revalidatePath("/pending-members");
  revalidatePath("/members");
}

export async function rejectMembershipAction(membershipId: number): Promise<void> {
  const session = await requireRole("admin", "treasurer");
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, (tx) =>
    tx
      .update(groupMemberships)
      .set({ status: "rejected", reviewedBy: session.user.id, reviewedAt: new Date() })
      .where(
        and(
          eq(groupMemberships.id, membershipId),
          eq(groupMemberships.groupId, groupId),
          eq(groupMemberships.status, "pending"),
        ),
      ),
  );

  revalidatePath("/pending-members");
}
