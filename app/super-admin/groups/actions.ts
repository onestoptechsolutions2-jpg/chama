"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNotNull } from "drizzle-orm";
import { withPlatformAdmin } from "@/lib/db/rls";
import { groups, groupMemberships, members, users } from "@/lib/db/schema";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { createGroupSchema } from "@/lib/validation/groups";
import { isKycComplete } from "@/lib/domain/officials";

export type CreateGroupState = { error: string } | null;

export async function createGroupAction(
  _prev: CreateGroupState,
  formData: FormData,
): Promise<CreateGroupState> {
  const session = await requirePlatformAdmin();
  const parsed = createGroupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { name, type, description, isPublic, requireApproval, maxMembers, adminEmail } =
    parsed.data;

  const result = await withPlatformAdmin(async (tx): Promise<{ error: string } | { ok: true }> => {
    const admin = await tx.query.users.findFirst({ where: eq(users.email, adminEmail) });
    if (!admin) {
      return { error: "No account with that email exists yet — ask them to register first" };
    }

    const [group] = await tx
      .insert(groups)
      .values({
        name,
        type,
        description: description || null,
        isPublic,
        requireApproval,
        maxMembers: maxMembers ?? null,
      })
      .returning();

    await tx.insert(groupMemberships).values({
      userId: admin.id,
      groupId: group.id,
      role: "admin",
      status: "active",
      reviewedBy: session.user.id,
      reviewedAt: new Date(),
      // Same automatic acceptance as approveMembershipAction — the
      // founding admin is bound by the group's rules from the moment
      // their membership exists, same as anyone else who joins.
      rulesAcceptedAt: new Date(),
    });

    // Cross-group KYC reuse (this admin may already have KYC on file from
    // another group) — already inside withPlatformAdmin, no separate call
    // needed. See lib/db/schema.ts's members KYC comment.
    const existingKyc = await tx.query.members.findFirst({
      where: and(eq(members.userId, admin.id), isNotNull(members.kycCompletedAt)),
      orderBy: (m, { desc }) => [desc(m.updatedAt)],
    });
    const kycFields = {
      idType: existingKyc?.idType ?? null,
      idNumber: existingKyc?.idNumber ?? null,
      idDocumentUrl: existingKyc?.idDocumentUrl ?? null,
      photoUrl: existingKyc?.photoUrl ?? null,
      signatureUrl: existingKyc?.signatureUrl ?? null,
      address: existingKyc?.address ?? null,
    };

    await tx.insert(members).values({
      groupId: group.id,
      userId: admin.id,
      name: admin.name,
      phone: existingKyc?.phone ?? admin.phone,
      email: admin.email,
      ...kycFields,
      // The founding admin holds the admin office, which requires the
      // full field set (see lib/domain/officials.ts).
      kycCompletedAt: isKycComplete("admin", kycFields) ? new Date() : null,
    });

    return { ok: true };
  });

  if ("error" in result) return result;

  revalidatePath("/super-admin/groups");
  return null;
}
