"use server";

import { isPlatformStaff } from "@/lib/auth/permissions";
import { findPerson } from "@/lib/identity/people";
import { normalizePhone, planMerge, type MergeMembership } from "@/lib/domain/identity";
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { groupMemberships, groups, members, notifications, platformUserAuditLogs, sessions, users } from "@/lib/db/schema";
import { requirePlatformPermission } from "@/lib/auth/session";
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
  const session = await requirePlatformPermission("platform.users.manage");
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const phone = normalizePhone(input.phone);

  if (!name || !email) {
    return { error: "Name and email are required" };
  }
  if (input.phone?.trim() && !phone) return { error: "Enter a Kenyan mobile number, e.g. 0712 345 678" };

  const found = await findPerson({ phone, email });
  if ("error" in found) return { error: found.error };
  const existing = found.user;

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
  const session = await requirePlatformPermission("platform.users.manage");

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

/**
 * Sets a new password for any user, signs them out everywhere and clears any
 * lockout. Only owners may reset another platform user's password, so a
 * support account can't take over an owner account.
 */
export async function resetUserPasswordAction(
  userId: number,
  password: string,
): Promise<{ error?: string; ok?: true }> {
  const session = await requirePlatformPermission("platform.users.manage");

  if (password.length < 8) return { error: "Password must be at least 8 characters" };
  if (userId === session.user.id) return { error: "Use your profile to change your own password" };

  const targetUser = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!targetUser) return { error: "User not found" };

  if (targetUser.platformRole && session.user.platformRole !== "owner") {
    return { error: "Only owners can reset a platform user's password" };
  }

  const passwordHash = await hashPassword(password);

  await withPlatformAdmin(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, failedLogins: 0, lockedUntil: null, updatedAt: new Date() })
      .where(eq(users.id, userId));
    await recordPlatformUserAudit(
      tx,
      userId,
      session.user.id,
      "password_reset",
      targetUser.platformRole,
      targetUser.platformRole,
      "Password was reset by a super-admin.",
    );
  });
  await db.delete(sessions).where(eq(sessions.userId, userId));

  revalidatePath("/super-admin/users");
  return { ok: true };
}

export async function updatePlatformRoleAction(
  userId: number,
  rawRole: string,
): Promise<UpdatePlatformRoleState> {
  const session = await requirePlatformPermission("platform.users.manage");
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
  if (nextRole && !targetUser.platformRole && (await activeGroupCount(targetUser.id)) > 0) {
    return {
      error: "This person belongs to a group. Platform staff can't be group members — hand over their group roles and remove them first, or use a separate staff account.",
    };
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

/**
 * Folds a duplicate account into the account being kept: memberships,
 * savings records, MGR agreements, notifications and account ownership move
 * over; the duplicate is deactivated (not deleted, so history that names it
 * still resolves) and signed out. Owners only. What moves is decided by
 * lib/domain/identity.ts's planMerge, which refuses when both accounts
 * have savings in the same group.
 */
export async function mergeUsersAction(
  keepUserId: number,
  duplicateUserId: number,
): Promise<{ error: string } | { ok: true }> {
  const session = await requirePlatformPermission("platform.users.merge");
  if (keepUserId === duplicateUserId) return { error: "Choose two different accounts" };

  const result = await withPlatformAdmin(async (tx): Promise<{ error: string } | { ok: true }> => {
    const [keep, dup] = [
      await tx.query.users.findFirst({ where: eq(users.id, keepUserId) }),
      await tx.query.users.findFirst({ where: eq(users.id, duplicateUserId) }),
    ];
    if (!keep || !dup) return { error: "User not found" };
    if (dup.platformRole) return { error: "Remove the duplicate's platform role before merging" };

    const load = async (userId: number): Promise<MergeMembership[]> => {
      const rows = await tx.query.groupMemberships.findMany({
        where: eq(groupMemberships.userId, userId),
        with: { group: true },
      });
      const memberRows = await tx.query.members.findMany({ where: eq(members.userId, userId) });
      return rows.map((r) => ({
        groupId: r.groupId,
        groupName: r.group.name,
        status: r.status,
        role: r.role,
        hasMemberRow: memberRows.some((m) => m.groupId === r.groupId),
      }));
    };
    const dupMemberships = await load(dup.id);
    if (isPlatformStaff(keep.platformRole) && dupMemberships.length > 0) {
      return { error: "The account you're keeping is platform staff, which can't hold the other account's group memberships. Keep the member account instead." };
    }
    const plan = planMerge(await load(keep.id), dupMemberships);
    if (!plan.ok) return { error: plan.error };

    for (const groupId of plan.moveGroupIds) {
      await tx
        .update(groupMemberships)
        .set({ userId: keep.id, updatedAt: new Date() })
        .where(and(eq(groupMemberships.userId, dup.id), eq(groupMemberships.groupId, groupId)));
    }
    for (const c of plan.collapse) {
      if (c.takeFromDuplicate) {
        await tx
          .update(groupMemberships)
          .set({ ...c.takeFromDuplicate, updatedAt: new Date() })
          .where(and(eq(groupMemberships.userId, keep.id), eq(groupMemberships.groupId, c.groupId)));
      }
      await tx
        .delete(groupMemberships)
        .where(and(eq(groupMemberships.userId, dup.id), eq(groupMemberships.groupId, c.groupId)));
    }
    // Savings records follow the person (only in groups where the kept
    // account has none — planMerge refused the rest).
    await tx.update(members).set({ userId: keep.id, updatedAt: new Date() }).where(eq(members.userId, dup.id));

    await tx.execute(sql`
      update mgr_agreements a set user_id = ${keep.id}
      where a.user_id = ${dup.id}
        and not exists (select 1 from mgr_agreements k where k.user_id = ${keep.id} and k.cycle_id = a.cycle_id)`);
    await tx.update(notifications).set({ userId: keep.id }).where(eq(notifications.userId, dup.id));
    await tx.update(groups).set({ accountOwnerUserId: keep.id }).where(eq(groups.accountOwnerUserId, dup.id));

    // Free the duplicate's phone/email/Google first (they're unique), then
    // fill any gaps on the kept account.
    await tx
      .update(users)
      .set({ phone: null, email: null, googleId: null, active: false, mergedIntoUserId: keep.id, updatedAt: new Date() })
      .where(eq(users.id, dup.id));
    await tx
      .update(users)
      .set({
        phone: keep.phone ?? dup.phone,
        email: keep.email ?? dup.email,
        googleId: keep.googleId ?? dup.googleId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, keep.id));
    await tx.delete(sessions).where(eq(sessions.userId, dup.id));

    const note = `Merged account #${dup.id} (${dup.name}) into #${keep.id} (${keep.name}).`;
    await recordPlatformUserAudit(tx, keep.id, session.user.id, "user_merged", keep.platformRole, keep.platformRole, note);
    await recordPlatformUserAudit(tx, dup.id, session.user.id, "user_merged_away", null, null, note);
    return { ok: true };
  });

  revalidatePath("/super-admin/users");
  return result;
}

/** Groups this user is an active or pending member of (platform staff must have none). */
async function activeGroupCount(userId: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(groupMemberships)
    .where(and(eq(groupMemberships.userId, userId), inArray(groupMemberships.status, ["active", "pending"])));
  return row?.n ?? 0;
}
