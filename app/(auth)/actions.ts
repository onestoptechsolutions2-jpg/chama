"use server";

import { redirect } from "next/navigation";
import { and, eq, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, groupMemberships } from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { registerSchema, loginSchema } from "@/lib/validation/auth";

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
  return "/";
}

export async function registerAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { name, email, phone, password } = parsed.data;

  const existing = email
    ? await db.query.users.findFirst({ where: eq(users.email, email) })
    : null;
  if (existing) {
    return { error: "An account with that email already exists" };
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({
      name,
      email: email || null,
      phone: phone || null,
      passwordHash,
    })
    .returning();

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
  const { identifier, password } = parsed.data;

  const user = await db.query.users.findFirst({
    where: or(eq(users.email, identifier), eq(users.phone, identifier)),
  });

  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Invalid credentials" };
  }

  const firstActive = await db.query.groupMemberships.findFirst({
    where: and(
      eq(groupMemberships.userId, user.id),
      eq(groupMemberships.status, "active"),
    ),
    orderBy: (m, { asc }) => [asc(m.createdAt)],
  });
  const activeGroupId = firstActive?.groupId ?? null;

  await createSession(user.id, activeGroupId);
  redirect(safeNext(formData));
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
