"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { eq, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { platformUserAuditLogs, users } from "@/lib/db/schema";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { withPlatformAdmin, type Tx } from "@/lib/db/rls";
import { hashPassword } from "@/lib/auth/password";
import {
  canGrantPlatformRole,
  normalizePlatformRole,
  platformRoleChangeSummary,
  type PlatformRole,
} from "@/lib/domain/super-admin";

export type UpdatePlatformRoleState = { error: string } | null;

type PlatformUserInviteResult =
  | { error: string }
  | { ok: true; password: string; created: boolean; userId: number };

function recordPlatformUserAudit(
  tx: Tx,
  targetUserId: number,
  actorUserId: number,
  eventType: string,
  fromRole: PlatformRole | null,
  toRole: PlatformRole | null,
  note?: string,
) {
  return tx.insert(platformUserAuditLogs).values({
    targetUserId,
    actorUserId,
    eventType,
    fromPlatformRole: fromRole,
    toPlatformRole: toRole,
    note: note ?? platformRoleChangeSummary(fromRole, toRole),
  });
}

export async function invitePlatformUserAction(
  input: { name: string; email: string; phone?: string | null },
): Promise<PlatformUserInviteResult> {
  const session = await requirePlatformAdmin();
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone?.trim() || null;

  if (!name || !email) {
    return { error: "Name and email are required" };
  }

  const existing = await db.query.users.findFirst({
    where: phone ? or(eq(users.email, email), eq(users.phone, phone)) : eq(users.email, email),
  });

  if (existing) {
    if (existing.email?.toLowerCase() === email && !existing.active) {
      await withPlatformAdmin(async (tx) => {
        await tx
          .update(users)
          .set({ active: true, name: existing.name || name, phone: existing.phone ?? phone ?? null })
          .where(eq(users.id, existing.id));
        await recordPlatformUserAudit(
          tx,
          existing.id,
          session.user.id,
          "platform_user_reactivated",
          existing.platformRole,
          existing.platformRole,
          "Platform user was reactivated by a super-admin.",
        );
      });
      revalidatePath("/super-admin/users");
      return { ok: true, password: "", created: false, userId: existing.id };
    }
    return { error: "A user with that email already exists" };
  }

  const generatedPassword = `Chama-${randomBytes(6).toString("base64url")}!`;
  const passwordHash = await hashPassword(generatedPassword);

  const user = await withPlatformAdmin(async (tx) => {
    const [createdUser] = await tx
      .insert(users)
      .values({ name, email, phone, passwordHash, active: true })
      .returning();
    await recordPlatformUserAudit(
      tx,
      createdUser.id,
      session.user.id,
      "platform_user_invited",
      null,
      null,
      "Platform account invited by a super-admin.",
    );
    return createdUser;
  });

  revalidatePath("/super-admin/users");
  return { ok: true, password: generatedPassword, created: true, userId: user.id };
}

export async function setPlatformUserActiveAction(
  userId: number,
  active: boolean,
): Promise<{ error?: string; ok?: true } | null> {
  const session = await requirePlatformAdmin();

  const targetUser = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!targetUser) {
    return { error: "User not found" };
  }

  if (targetUser.id === session.user.id && !active) {
    return { error: "You cannot deactivate your own platform account while signed in" };
  }

  await withPlatformAdmin(async (tx) => {
    await tx.update(users).set({ active }).where(eq(users.id, userId));
    await recordPlatformUserAudit(
      tx,
      userId,
      session.user.id,
      active ? "platform_user_activated" : "platform_user_deactivated",
      targetUser.platformRole,
      targetUser.platformRole,
      active
        ? "Platform user account was reactivated by a super-admin."
        : "Platform user account was deactivated by a super-admin.",
    );
  });

  revalidatePath("/super-admin/users");
  return { ok: true };
}

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

  const previousRole = targetUser.platformRole;
  const summary = platformRoleChangeSummary(previousRole, nextRole);

  await withPlatformAdmin(async (tx) => {
    await tx
      .update(users)
      .set({ platformRole: nextRole as PlatformRole | null })
      .where(eq(users.id, userId));

    if (previousRole !== nextRole) {
      await recordPlatformUserAudit(
        tx,
        userId,
        session.user.id,
        "platform_role_changed",
        previousRole,
        nextRole,
        summary,
      );
    }
  });

  revalidatePath("/super-admin/users");
  revalidatePath("/super-admin/stats");
  return null;
}
