import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { withTenant, withUser } from "@/lib/db/rls";
import { sessions, groupMemberships, members, groupAuditLog } from "@/lib/db/schema";
import { loadSupportContext } from "@/lib/auth/support";
import { supportWriteError } from "@/lib/auth/support-rules";
import type { ProductFlags } from "@/lib/domain/products";
import {
  can,
  canPlatform,
  type GroupPermission,
  type PlatformPermission,
  type PlatformRole,
} from "@/lib/auth/permissions";

const SESSION_COOKIE = "chama_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type MembershipRole = "admin" | "treasurer" | "secretary" | "member";
export type GroupType = "chama" | "welfare" | "hybrid" | "selfhelp";

export type SessionUser = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  platformRole: PlatformRole | null;
};

export type ActiveMembership = {
  groupId: number;
  groupName: string;
  groupType: GroupType;
  role: MembershipRole;
  status: "pending" | "active" | "rejected" | "suspended";
  /** This user's members.id row within this group, or null if none (e.g. staff with no linked financial profile). */
  memberId: number | null;
  /**
   * Which products (loans/MGR/welfare/projects) this group actually has
   * turned on — independent of `groupType` now (Settings > Products).
   * `groupType` only seeds the defaults at creation; this is the real gate.
   */
  products: ProductFlags;
};

/** Present when platform support has opened this group as a member (lib/auth/support.ts). */
export type SupportContext = {
  supportSessionId: number;
  /** The member being helped, if support is acting as one; null = as the group's admin. */
  asUserId: number | null;
  asUserName: string | null;
  reason: string;
  mode: "view" | "act";
  expiresAt: Date;
};

export type Session = {
  sessionId: string;
  /** Support mode, or null for a normal session. */
  support: SupportContext | null;
  user: SessionUser;
  activeGroupId: number | null;
  /** The caller's role/status in the currently active group, or null if none selected/active. */
  activeMembership: ActiveMembership | null;
  /** All groups the user has an ACTIVE membership in (for the group switcher). */
  memberships: ActiveMembership[];
};

/** A Session with activeMembership guaranteed non-null (see requireActiveGroup). */
export type SessionWithGroup = Session & { activeMembership: ActiveMembership };

function newSessionId(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(
  userId: number,
  activeGroupId: number | null,
): Promise<string> {
  const id = newSessionId();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await db.insert(sessions).values({ id, userId, activeGroupId, expiresAt });

  const store = await cookies();
  store.set(SESSION_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return id;
}

/** Logs a user in: opens a session on their earliest active group (or none). */
export async function startSessionForUser(userId: number): Promise<void> {
  const firstActive = await db.query.groupMemberships.findFirst({
    where: and(eq(groupMemberships.userId, userId), eq(groupMemberships.status, "active")),
    orderBy: (m, { asc }) => [asc(m.createdAt)],
  });
  await createSession(userId, firstActive?.groupId ?? null);
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const id = store.get(SESSION_COOKIE)?.value;
  if (id) {
    await db.delete(sessions).where(eq(sessions.id, id));
  }
  store.delete(SESSION_COOKIE);
}

/**
 * Loads the current session from the cookie. Wrapped in React `cache()` so
 * every Server Component/Action in a single request tree shares one lookup
 * instead of re-querying — this is the sole source of truth for "who is
 * this request acting as, in which group," replacing the old client-supplied
 * X-Group-Id header entirely.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const store = await cookies();
  const sessionId = store.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const row = await db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
    with: { user: true },
  });

  if (!row || row.expiresAt.getTime() < Date.now() || !row.user.active) {
    return null;
  }

  // Neither query is scoped to one tenant (a user can belong to many groups
  // at once), so withTenant doesn't fit — withUser sets app.current_user_id
  // instead, which groups_own_membership_read and members_own_row_read
  // (both added in Phase 7) check directly.
  //
  // Two independent withUser calls, not one Promise.all sharing a
  // transaction — concurrent queries against the same `tx` aren't
  // guaranteed to share the transaction-local SET LOCAL context withUser
  // relies on for RLS (see app/(dashboard)/dashboard/billing/data.ts for where this
  // exact race was first caught). Here it silently dropped `myMemberRows`
  // to empty on an unlucky race, which meant a genuine member's own
  // activeMembership.memberId came back null — every member-scoped feature
  // (loan applications, own capital/statement data) would then fail with
  // "no member profile linked," despite one existing. Found by that exact
  // symptom while testing loan guarantors, not by inspection — this
  // function is the source of truth for every authenticated request, so
  // the race was real, just not consistently reproducible.
  const memberships = await withUser(row.user.id, (tx) =>
    tx.query.groupMemberships.findMany({
      where: eq(groupMemberships.userId, row.user.id),
      with: { group: true },
    }),
  );
  const myMemberRows = await withUser(row.user.id, (tx) =>
    tx.query.members.findMany({ where: eq(members.userId, row.user.id) }),
  );
  const memberIdByGroup = new Map(myMemberRows.map((m) => [m.groupId, m.id]));

  const activeMemberships: ActiveMembership[] = memberships
    .filter((m) => m.status === "active")
    .map((m) => ({
      groupId: m.groupId,
      groupName: m.group.name,
      groupType: m.group.type,
      role: m.role,
      status: m.status,
      memberId: memberIdByGroup.get(m.groupId) ?? null,
      products: {
        loans: m.group.loansEnabled,
        mgr: m.group.mgrEnabled,
        welfare: m.group.welfareEnabled,
        projects: m.group.projectsEnabled,
      },
    }));

  let activeMembership =
    activeMemberships.find((m) => m.groupId === row.activeGroupId) ?? null;

  // Support mode: platform staff inside a group, seeing it as a member does.
  let support: SupportContext | null = null;
  let activeGroupId = row.activeGroupId;
  if (row.supportSessionId) {
    const ctx = await loadSupportContext(row.supportSessionId, { id: row.user.id, platformRole: row.user.platformRole });
    if (ctx) {
      support = ctx.support;
      activeMembership = ctx.membership;
      activeGroupId = ctx.membership.groupId;
    }
  }

  return {
    sessionId: row.id,
    support,
    user: {
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
      phone: row.user.phone,
      platformRole: row.user.platformRole,
    },
    activeGroupId,
    activeMembership,
    memberships: activeMemberships,
  };
});

/** Redirects to /login if there's no valid session. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * Redirects to /login if unauthenticated, or to /dashboard if authenticated
 * but the active-group role doesn't match. Coarse-grained gate — RLS is the
 * defense-in-depth net underneath every query these pages make.
 */
export async function requireRole(...roles: MembershipRole[]): Promise<SessionWithGroup> {
  const session = await requireSession();
  if (!session.activeMembership || !roles.includes(session.activeMembership.role)) {
    redirect("/dashboard");
  }
  return session as SessionWithGroup;
}

/** Redirects to /dashboard unless the session has an active group selected. */
export async function requireActiveGroup(): Promise<SessionWithGroup> {
  const session = await requireSession();
  if (!session.activeMembership) redirect("/dashboard");
  return session as SessionWithGroup;
}

/**
 * Redirects to /dashboard unless the active group has `product` turned on
 * (Settings > Products — lib/domain/products.ts), and optionally unless
 * the role also matches. Every product page (loans, mgr, welfare,
 * projects) previously relied ONLY on the nav menu hiding the link for
 * this — nothing stopped a member of a non-welfare group from reaching
 * /welfare directly by URL. This is the actual enforcement; the nav's
 * `product` filter (lib/nav-config.ts) is just the coarse "don't show it"
 * half, same relationship requireRole already has with the role filter.
 */
export async function requireProduct(
  product: keyof ProductFlags,
  ...roles: MembershipRole[]
): Promise<SessionWithGroup> {
  const session = roles.length ? await requireRole(...roles) : await requireActiveGroup();
  if (!session.activeMembership.products[product]) redirect("/dashboard");
  return session;
}

/**
 * The standard gate for anything inside a group: redirects to /login when
 * signed out, to /dashboard when the active group's role or product switch
 * doesn't grant `permission` (see lib/auth/permissions.ts for the matrix).
 */
export async function requirePermission(permission: GroupPermission): Promise<SessionWithGroup> {
  const session = await requireActiveGroup();
  if (!can(session.activeMembership, permission)) redirect("/dashboard");
  if (session.support) await guardSupportWrite(session as SessionWithGroup, permission);
  return session;
}

/**
 * In support mode every Server Action (a write — the request carries a
 * Next-Action header) is checked against the support rules and written to
 * the group's audit log with the reason, whether or not the action itself
 * runs through lib/commands. Page loads (reads) pass through.
 */
async function guardSupportWrite(session: SessionWithGroup, permission: GroupPermission): Promise<void> {
  const isWrite = (await headers()).has("next-action");
  if (!isWrite || !session.support) return;
  const refused = supportWriteError(session.support, session.user.platformRole, permission);
  await withTenant(session.activeMembership.groupId, (tx) =>
    tx.insert(groupAuditLog).values({
      groupId: session.activeMembership.groupId,
      command: `action:${permission}`,
      actorUserId: session.user.id,
      via: "support",
      onBehalfOfUserId: session.support!.asUserId,
      reason: session.support!.reason,
      input: {},
      ok: !refused,
      error: refused,
    }),
  ).catch(() => {});
  if (refused) throw new Error(refused);
}

/** Like requirePermission, for platform (super-admin/support/agent) permissions. */
export async function requirePlatformPermission(permission: PlatformPermission): Promise<Session> {
  const session = await requireSession();
  if (!canPlatform(session.user.platformRole, permission)) redirect("/dashboard");
  return session;
}

/** Redirects to /dashboard unless the user may open the super-admin console. */
export async function requirePlatformAdmin(): Promise<Session> {
  return requirePlatformPermission("platform.console");
}

/**
 * Validates the target membership is active for the current user, then
 * updates the session's active_group_id server-side. This is the entire
 * replacement for the old client-side X-Group-Id header — nothing on the
 * client can tamper with which tenant a request is scoped to.
 */
export async function setActiveGroup(groupId: number): Promise<void> {
  const session = await requireSession();
  const allowed = session.memberships.some((m) => m.groupId === groupId);
  if (!allowed) {
    throw new Error("Not an active member of that group");
  }
  await db
    .update(sessions)
    .set({ activeGroupId: groupId })
    .where(eq(sessions.id, session.sessionId));
}
