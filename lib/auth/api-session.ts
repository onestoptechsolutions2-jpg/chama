import { eq } from "drizzle-orm";
import { withPlatformAdmin } from "@/lib/db/rls";
import { apiKeys } from "@/lib/db/schema";
import { hashApiKey, extractBearerToken } from "@/lib/auth/api-keys";

export type ApiAuthResult =
  | { ok: true; groupId: number; apiKeyId: number }
  | { ok: false; status: 401; error: string };

/**
 * The public API's equivalent of requireSession()/requireRole() — resolves
 * a Bearer token to the group it belongs to. Genuinely cross-tenant by
 * nature (we don't know which group's api_keys row this is until we've
 * looked it up by hash), so this runs under withPlatformAdmin the same way
 * the IntaSend webhook resolves a payment by invoice_id before it knows
 * the tenant — see docs/architecture.md's wrapper table. Every route
 * handler under app/api/v1/* calls this first, then does its actual work
 * through withTenant(groupId, ...) like any other tenant-scoped code.
 */
export async function requireApiKey(req: Request): Promise<ApiAuthResult> {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) {
    return { ok: false, status: 401, error: "Missing Authorization: Bearer <key> header" };
  }

  const hash = hashApiKey(token);
  const key = await withPlatformAdmin((tx) =>
    tx.query.apiKeys.findFirst({ where: eq(apiKeys.keyHash, hash) }),
  );

  if (!key || key.revokedAt) {
    return { ok: false, status: 401, error: "Invalid or revoked API key" };
  }

  // Best-effort — a failed write here shouldn't block the actual request.
  await withPlatformAdmin((tx) =>
    tx.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id)),
  ).catch(() => {});

  return { ok: true, groupId: key.groupId, apiKeyId: key.id };
}
