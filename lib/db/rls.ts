import { sql } from "drizzle-orm";
import { db } from "./client";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Runs `fn` inside a transaction with the tenant's group id set for the
 * duration of that transaction via `SET LOCAL` (through `set_config`, which
 * — unlike raw `SET LOCAL` — accepts a bound parameter, so this is injection-safe
 * even though groupId is a plain number here).
 *
 * Every RLS policy in the schema reads `current_setting('app.current_group_id')`,
 * so any query run through `tx` here is automatically confined to this tenant
 * even if a call site forgets an explicit `WHERE group_id = ...` filter.
 * This is the defense-in-depth net described in the architecture plan — the
 * app-level `WHERE group_id = ...` filters must still be written; RLS just
 * makes "forgot the filter" fail safe (zero rows) instead of leaking data.
 */
export async function withTenant<T>(
  groupId: number,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.current_group_id', ${String(groupId)}, true)`,
    );
    return fn(tx);
  });
}

/**
 * Cross-tenant escape hatch for the super-admin surface only. Callers MUST
 * have already verified `session.user.platformRole` via requirePlatformAdmin()
 * before calling this — this function does not check authorization itself,
 * it only carries the already-verified flag into the RLS policies (which
 * OR-in `app.is_platform_admin = 'true'`). See drizzle/0001_rls_policies.sql.
 */
export async function withPlatformAdmin<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.is_platform_admin', 'true', true)`);
    return fn(tx);
  });
}

/**
 * "My own data" escape hatch — not tenant-scoped (a user can belong to many
 * groups at once, the whole point of multi-tenancy), so withTenant doesn't
 * fit. Used by getSession() to read a user's own group_memberships joined
 * with each membership's `group`, which needs `groups_own_membership_read`
 * (drizzle/0017_phase7_groups_rls_hardening.sql) to see a *private* group
 * they're actually a member of — groups_public_read only covers public
 * ones, and there's no single current_group_id to satisfy
 * groups_tenant_read since this query spans every group the user is in.
 */
export async function withUser<T>(userId: number, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_user_id', ${String(userId)}, true)`);
    return fn(tx);
  });
}
