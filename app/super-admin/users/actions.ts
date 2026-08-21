"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { canGrantPlatformRole, normalizePlatformRole, type PlatformRole } from "@/lib/domain/super-admin";

export type UpdatePlatformRoleState = { error: string } | null;

export async function updatePlatformRoleAction(
  userId: number,
  rawRole: string,
): Promise<UpdatePlatformRoleState> {
  const session = await requirePlatformAdmin();
  const callerRole = session.user.platformRole;
  const nextRole = rawRole === "none" ? null : normalizePlatformRole(rawRole);

  if (rawRole !== "none" && !nextRole) {
    return { error: "Unsupported platform role" };
  }

  if (!canGrantPlatformRole(callerRole, nextRole)) {
    return { error: "You do not have permission to assign that platform role" };
  }

  const targetUser = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!targetUser) {
    return { error: "User not found" };
  }

  if (nextRole === "owner" && callerRole !== "owner") {
    return { error: "Only owners can assign the owner platform role" };
  }

  const ownerCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.platformRole, "owner"));

  if (targetUser.platformRole === "owner" && nextRole !== "owner" && ownerCount[0].count <= 1) {
    return { error: "At least one owner must remain on the platform" };
  }

  if (targetUser.id === session.user.id && nextRole !== "owner" && callerRole === "owner") {
    // Allow self-demotion only when at least one other owner remains. The count check above
    // covers the last-owner situation, but we also protect direct self-removal to avoid a
    // user locking themselves out while still being the active platform admin session.
    if (ownerCount[0].count <= 1) {
      return { error: "You cannot remove the final owner role while signed in as that owner" };
    }
  }

  await db
    .update(users)
    .set({ platformRole: nextRole as PlatformRole | null })
    .where(eq(users.id, userId));

  revalidatePath("/super-admin/users");
  revalidatePath("/super-admin/stats");
  return null;
}
