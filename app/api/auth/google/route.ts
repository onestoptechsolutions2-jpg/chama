import { randomBytes } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { googleAuthUrl, googleEnabled } from "@/lib/auth/google";

/** Starts Google sign-in: remember a state token (+ where to go after), then hand off to Google. */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  if (!googleEnabled()) {
    return NextResponse.redirect(`${origin}/login?error=google`);
  }

  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(googleAuthUrl(`${origin}/api/auth/google/callback`, state));
  const cookie = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/auth/google",
    maxAge: 600,
  };
  res.cookies.set("g_state", state, cookie);
  const next = req.nextUrl.searchParams.get("next");
  if (next) res.cookies.set("g_next", next, cookie);
  return res;
}
