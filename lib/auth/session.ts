import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { withUser } from "@/lib/db/rls";
import { sessions, groupMemberships, members } from "@/lib/db/schema";
import type { ProductFlags } from "@/lib/domain/products";

const SESSION_COOKIE = "chama_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type MembershipRole = "admin" | "treasurer" | "secretary" | "member";
export type GroupType = "chama" | "welfare" | "hybrid" | "selfhelp";

export type SessionUser = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  platformRole: "owner" | "support" | null;
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

export type Session = {
  sessionId: string;
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
  const [memberships, myMemberRows] = await withUser(row.user.id, (tx) =>
    Promise.all([
      tx.query.groupMemberships.findMany({
        where: eq(groupMemberships.userId, row.user.id),
        with: { group: true },
      }),
      tx.query.members.findMany({ where: eq(members.userId, row.user.id) }),
    ]),
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

  const activeMembership =
    activeMemberships.find((m) => m.groupId === row.activeGroupId) ?? null;

  return {
    sessionId: row.id,
    user: {
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
      phone: row.user.phone,
      platformRole: row.user.platformRole,
    },
    activeGroupId: row.activeGroupId,
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
 * Redirects to /login if unauthenticated, or to / if authenticated but the
 * active-group role doesn't match. Coarse-grained gate — RLS is the
 * defense-in-depth net underneath every query these pages make.
 */
export async function requireRole(...roles: MembershipRole[]): Promise<SessionWithGroup> {
  const session = await requireSession();
  if (!session.activeMembership || !roles.includes(session.activeMembership.role)) {
    redirect("/");
  }
  return session as SessionWithGroup;
}

/** Redirects to / unless the session has an active group selected. */
export async function requireActiveGroup(): Promise<SessionWithGroup> {
  const session = await requireSession();
  if (!session.activeMembership) redirect("/");
  return session as SessionWithGroup;
}

/**
 * Redirects to / unless the active group has `product` turned on
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
  if (!session.activeMembership.products[product]) redirect("/");
  return session;
}

/** Redirects to / unless the user has a platform-level (super-admin) role. */
export async function requirePlatformAdmin(): Promise<Session> {
  const session = await requireSession();
  if (!session.user.platformRole) redirect("/");
  return session;
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
