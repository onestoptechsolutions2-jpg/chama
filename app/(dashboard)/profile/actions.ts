"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { requireActiveGroup } from "@/lib/auth/session";
import { withTenant, withPlatformAdmin } from "@/lib/db/rls";
import { members, groupMemberships } from "@/lib/db/schema";
import { updateKycSchema } from "@/lib/validation/profile";
import { isKycComplete, type MembershipRole } from "@/lib/domain/officials";

export type ProfileActionState = { error: string } | { ok: true } | null;

export async function updateMyKycAction(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const session = await requireActiveGroup();
  const memberId = session.activeMembership.memberId;
  if (!memberId) {
    return { error: "No financial profile linked to your account in this group" };
  }

  const parsed = updateKycSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { idType, idNumber, idDocumentUrl, phone, photoUrl, address, signatureUrl } = parsed.data;
  const groupId = session.activeMembership.groupId;
  const role = session.activeMembership.role;

  const kycFields = {
    idType: idType || null,
    idNumber: idNumber || null,
    idDocumentUrl: idDocumentUrl || null,
    phone: phone || null,
    photoUrl: photoUrl || null,
    address: address || null,
    signatureUrl: signatureUrl || null,
  };

  await withTenant(groupId, async (tx) => {
    const complete = isKycComplete(role, kycFields);
    await tx
      .update(members)
      .set({ ...kycFields, kycCompletedAt: complete ? new Date() : null, updatedAt: new Date() })
      .where(and(eq(members.id, memberId), eq(members.userId, session.user.id)));
  });

  // Propagate to every OTHER members row this user has, across every other
  // group they belong to — "captured once, reused across every
  // membership" (see lib/db/schema.ts's members KYC comment). Scoped to
  // members.userId = the caller's own id throughout, so withPlatformAdmin's
  // cross-tenant reach can never touch anyone else's data even though it
  // needs to cross RLS tenant boundaries to update rows in other groups.
  // kycCompletedAt is recomputed per target row against THAT group's own
  // role for this user, since office-holder requirements differ by group.
  await withPlatformAdmin(async (tx) => {
    const otherMemberRows = await tx.query.members.findMany({
      where: and(eq(members.userId, session.user.id), ne(members.groupId, groupId)),
    });
    for (const other of otherMemberRows) {
      const otherMembership = await tx.query.groupMemberships.findFirst({
        where: and(
          eq(groupMemberships.userId, session.user.id),
          eq(groupMemberships.groupId, other.groupId),
        ),
      });
      const otherRole = (otherMembership?.role ?? "member") as MembershipRole;
      const otherComplete = isKycComplete(otherRole, kycFields);
      await tx
        .update(members)
        .set({
          ...kycFields,
          kycCompletedAt: otherComplete ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(members.id, other.id));
    }
  });

  revalidatePath("/profile");
  revalidatePath("/members");
  return { ok: true };
}
