import { randomBytes } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { fetchGoogleProfile, googleEnabled } from "@/lib/auth/google";
import { hashPassword } from "@/lib/auth/password";
import { startSessionForUser } from "@/lib/auth/session";

/** Only same-origin relative paths — never an open redirect. */
function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const fail = () => NextResponse.redirect(`${origin}/login?error=google`);
  if (!googleEnabled()) return fail();

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const savedState = req.cookies.get("g_state")?.value;
  if (!code || !state || state !== savedState) return fail();

  const profile = await fetchGoogleProfile(code, `${origin}/api/auth/google/callback`);
  if (!profile) return fail();

  // Same Google account → same user; else link to an existing account with
  // that (Google-verified) email; else create one. Google accounts get a
  // random unusable password hash, since the column is required.
  let user =
    (await db.query.users.findFirst({ where: eq(users.googleId, profile.sub) })) ??
    (await db.query.users.findFirst({ where: eq(users.email, profile.email) }));

  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        name: profile.name,
        email: profile.email,
        googleId: profile.sub,
        passwordHash: await hashPassword(randomBytes(32).toString("hex")),
      })
      .returning();
  } else if (!user.googleId) {
    await db.update(users).set({ googleId: profile.sub }).where(eq(users.id, user.id));
  }
  if (!user.active) return fail();

  await startSessionForUser(user.id);

  const res = NextResponse.redirect(`${origin}${safeNext(req.cookies.get("g_next")?.value)}`);
  res.cookies.delete({ name: "g_state", path: "/api/auth/google" });
  res.cookies.delete({ name: "g_next", path: "/api/auth/google" });
  return res;
}
