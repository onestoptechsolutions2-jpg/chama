import "server-only";
import { and, eq, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { Tx } from "@/lib/db/rls";
import { members, users } from "@/lib/db/schema";
import { findRosterRowFor, normalizeEmail, normalizePhone, resolvePerson } from "@/lib/domain/identity";

/**
 * The only way the app finds or creates a person. Every entry point —
 * register, Google, invites, staff "create login", join approval — goes
 * through here, so one phone or email can never become two accounts.
 * See lib/domain/identity.ts for the canonical phone/email form.
 */

export type Contact = { phone?: string | null; email?: string | null };
type UserRow = typeof users.$inferSelect;

export const DUPLICATE_CONTACT_ERROR =
  "This phone and email belong to two different accounts. Contact support to merge them.";

function contactWhere({ phone, email }: Contact): SQL | undefined {
  const p = normalizePhone(phone ?? null);
  const e = normalizeEmail(email ?? null);
  const parts: SQL[] = [];
  if (p) parts.push(eq(users.phone, p));
  if (e) parts.push(sql`lower(${users.email}) = ${e}`);
  return parts.length ? or(...parts) : undefined;
}

/** Users matching the phone or the email (0, 1, or 2 rows). */
export async function findUsersByContact(contact: Contact): Promise<UserRow[]> {
  const where = contactWhere(contact);
  if (!where) return [];
  return db.query.users.findMany({ where, limit: 5 });
}

/** The one user with this phone/email, null if none, or an error when they point at two accounts. */
export async function findPerson(contact: Contact): Promise<{ user: UserRow | null } | { error: string }> {
  const matches = await findUsersByContact(contact);
  const resolved = resolvePerson(matches);
  if (resolved.kind === "conflict") return { error: DUPLICATE_CONTACT_ERROR };
  if (resolved.kind === "none") return { user: null };
  return { user: matches.find((u) => u.id === resolved.userId)! };
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}

/**
 * Creates a user unless one already owns this phone/email — in which case
 * `{ existing }` is returned and the caller decides (sign in, link, or
 * refuse). A concurrent insert of the same phone/email is caught by the
 * unique indexes and reported the same way.
 */
export async function createUserIfNew(input: {
  name: string;
  phone?: string | null;
  email?: string | null;
  passwordHash: string;
  googleId?: string | null;
}): Promise<{ created: UserRow } | { existing: UserRow } | { error: string }> {
  const phone = normalizePhone(input.phone ?? null);
  const email = normalizeEmail(input.email ?? null);
  if (!phone && !email) return { error: "A phone number or email is required" };

  const found = await findPerson({ phone, email });
  if ("error" in found) return found;
  if (found.user) return { existing: found.user };

  try {
    const [created] = await db
      .insert(users)
      .values({ name: input.name, phone, email, passwordHash: input.passwordHash, googleId: input.googleId ?? null })
      .returning();
    return { created };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const again = await findPerson({ phone, email });
    if ("error" in again) return again;
    if (again.user) return { existing: again.user };
    throw error;
  }
}

/**
 * Makes sure `user` has exactly one members row in `groupId`: reuses the row
 * already linked to them, else links an unlinked roster row with the same
 * phone/email (someone staff added by hand earlier), else creates one.
 * Must run inside the caller's withTenant(groupId) transaction.
 */
export async function linkOrCreateMemberRow(
  tx: Tx,
  groupId: number,
  user: { id: number; name: string; phone: string | null; email: string | null },
  extra: Partial<typeof members.$inferInsert> = {},
): Promise<{ memberId: number; linked: boolean }> {
  const phone = normalizePhone(user.phone);
  const email = normalizeEmail(user.email);
  const candidates = await tx
    .select({ id: members.id, userId: members.userId, phone: members.phone, email: members.email, active: members.active })
    .from(members)
    .where(
      and(
        eq(members.groupId, groupId),
        or(
          eq(members.userId, user.id),
          ...(phone ? [eq(members.phone, phone)] : []),
          ...(email ? [sql`lower(${members.email}) = ${email}`] : []),
        ),
      ),
    );

  const row = findRosterRowFor(candidates, { userId: user.id, phone, email });
  if (row) {
    await tx
      .update(members)
      .set({ userId: user.id, phone: phone ?? row.phone, email: email ?? row.email, updatedAt: new Date() })
      .where(eq(members.id, row.id));
    return { memberId: row.id, linked: row.userId === null };
  }

  const [created] = await tx
    .insert(members)
    .values({ groupId, userId: user.id, name: user.name, phone, email, ...extra })
    .returning({ id: members.id });
  return { memberId: created.id, linked: false };
}
