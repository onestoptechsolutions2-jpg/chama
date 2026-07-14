"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { withTenant, withPlatformAdmin } from "@/lib/db/rls";
import { groupMemberships, members, groups } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/session";
import { isKycComplete } from "@/lib/domain/officials";

export type PendingMemberActionState = { error: string } | null;

export async function approveMembershipAction(
  membershipId: number,
): Promise<{ error: string } | null> {
  const session = await requireRole("admin", "treasurer");
  const groupId = session.activeMembership.groupId;

  // group_memberships isn't RLS-protected (see drizzle/0001_rls_policies.sql),
  // so a plain read is fine here — still explicitly scoped to this group in
  // the WHERE clause, matching the app-level-filter half of every other
  // RLS-backed query in this codebase.
  const membership = await db.query.groupMemberships.findFirst({
    where: and(
      eq(groupMemberships.id, membershipId),
      eq(groupMemberships.groupId, groupId),
      eq(groupMemberships.status, "pending"),
    ),
    with: { user: true },
  });
  if (!membership) return { error: "Request not found" };

  // Cross-group KYC reuse — "captured once, reused across every
  // membership" (see lib/db/schema.ts's members KYC comment). Scoped to
  // this specific userId throughout, so withPlatformAdmin's cross-tenant
  // reach can't leak anyone else's data.
  const existingKyc = await withPlatformAdmin((tx) =>
    tx.query.members.findFirst({
      where: and(eq(members.userId, membership.userId), isNotNull(members.kycCompletedAt)),
      orderBy: (m, { desc }) => [desc(m.updatedAt)],
    }),
  );

  const result = await withTenant(groupId, async (tx): Promise<{ error: string } | { ok: true }> => {
    const group = await tx.query.groups.findFirst({ where: eq(groups.id, groupId) });
    // A group without its Chair/Treasurer/Secretary all assigned can't
    // take on new active members yet — see lib/domain/officials.ts.
    if (!group?.registrationComplete) {
      return {
        error: "This group's registration isn't complete yet — assign a Treasurer and Secretary on the Members page before approving new members.",
      };
    }

    await tx
      .update(groupMemberships)
      .set({
        status: "active",
        reviewedBy: session.user.id,
        reviewedAt: new Date(),
        // The group's rule set applies the moment membership becomes
        // active — automatic, not a separate opt-in step (unlike the MGR
        // agreement gate).
        rulesAcceptedAt: new Date(),
      })
      .where(eq(groupMemberships.id, membershipId));

    const existingMember = await tx.query.members.findFirst({
      where: and(eq(members.groupId, groupId), eq(members.userId, membership.userId)),
    });
    if (!existingMember) {
      const kycFields = {
        idType: existingKyc?.idType ?? null,
        idNumber: existingKyc?.idNumber ?? null,
        idDocumentUrl: existingKyc?.idDocumentUrl ?? null,
        photoUrl: existingKyc?.photoUrl ?? null,
        signatureUrl: existingKyc?.signatureUrl ?? null,
        address: existingKyc?.address ?? null,
      };
      await tx.insert(members).values({
        groupId,
        userId: membership.userId,
        name: membership.user.name,
        phone: existingKyc?.phone ?? membership.user.phone,
        email: membership.user.email,
        ...kycFields,
        // A newly-approved join request always lands as role "member"
        // (see requestToJoinAction) — offices are assigned separately.
        kycCompletedAt: isKycComplete("member", kycFields) ? new Date() : null,
      });
    }

    return { ok: true };
  });

  if ("error" in result) return { error: result.error };

  revalidatePath("/pending-members");
  revalidatePath("/members");
  return null;
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
