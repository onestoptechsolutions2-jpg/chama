import { NextResponse } from "next/server";
import { requireApiKey } from "@/lib/auth/api-session";

/**
 * Shared entry point for every app/api/v1/* route — resolves the Bearer
 * token to a groupId or returns the 401 response directly, so each route
 * handler is just `const auth = await apiAuth(req); if (auth instanceof
 * NextResponse) return auth; const { groupId } = auth;`.
 */
export async function apiAuth(req: Request) {
  const result = await requireApiKey(req);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return result;
}
