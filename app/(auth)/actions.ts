"use server";

import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession, startSessionForUser } from "@/lib/auth/session";
import { registerSchema, loginSchema } from "@/lib/validation/auth";
import { isEmailIdentifier, normalizeEmail, normalizePhone } from "@/lib/domain/identity";
import { createUserIfNew } from "@/lib/identity/people";

const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60 * 1000;

export type AuthActionState = { error: string } | null;

/**
 * `next` comes from a client-controlled query string (login/register redirect
 * back to e.g. /discover/[id]) — only allow same-origin relative paths, never
 * a protocol-relative "//evil.com" or absolute URL, to avoid an open redirect.
 */
function safeNext(formData: FormData): string {
  const next = formData.get("next");
  if (typeof next === "string" && next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }
    return "/dashboard";
}

export async function registerAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email") ?? undefined,
    phone: formData.get("phone") ?? undefined,
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { name, phone, email, password } = parsed.data;

  const result = await createUserIfNew({ name, phone, email, passwordHash: await hashPassword(password) });
  if ("error" in result) return { error: result.error };
  if ("existing" in result) {
    return { error: "An account with this phone or email already exists. Sign in instead." };
  }
  const user = result.created;

  await createSession(user.id, null);
  redirect(safeNext(formData));
}

export async function loginAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { password, identifier } = parsed.data;
  // Phones are stored canonical (lib/domain/identity.ts), so "0712…" and
  // "+254712…" both find the same account.
  const where = isEmailIdentifier(identifier)
    ? sql`lower(${users.email}) = ${normalizeEmail(identifier)}`
    : eq(users.phone, normalizePhone(identifier) ?? identifier);
  const user = await db.query.users.findFirst({ where });

  if (user?.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    return { error: "Too many wrong tries. Please wait 15 minutes and try again." };
  }

  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
    if (user) {
      const failed = user.failedLogins + 1;
      await db
        .update(users)
        .set(
          failed >= MAX_FAILED_LOGINS
            ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MS) }
            : { failedLogins: failed },
        )
        .where(eq(users.id, user.id));
    }
    return { error: "Wrong email, phone or password" };
  }

  if (user.failedLogins > 0 || user.lockedUntil) {
    await db.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, user.id));
  }

  await startSessionForUser(user.id);
  redirect(safeNext(formData));
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
