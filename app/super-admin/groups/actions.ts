"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { withPlatformAdmin } from "@/lib/db/rls";
import { groups, groupMemberships, members, users } from "@/lib/db/schema";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { createGroupSchema } from "@/lib/validation/groups";

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
    });

    await tx.insert(members).values({
      groupId: group.id,
      userId: admin.id,
      name: admin.name,
      phone: admin.phone,
      email: admin.email,
    });

    return { ok: true };
  });

  if ("error" in result) return result;

  revalidatePath("/super-admin/groups");
  return null;
}
