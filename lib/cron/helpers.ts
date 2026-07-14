import "server-only";
import { eq } from "drizzle-orm";
import { pool, db } from "@/lib/db/client";
import { cronRuns } from "@/lib/db/schema";

/** Vercel attaches this header automatically for requests it originates when CRON_SECRET is set. */
export function isAuthorizedCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Runs `fn` while holding a session-scoped Postgres advisory lock keyed by
 * job name, with a cron_runs audit row bracketing the whole attempt.
 * Serverless cron is documented at-least-once and can double-fire; if the
 * lock is already held (another invocation is mid-flight), this returns
 * immediately without calling `fn` — the caller should still respond 200
 * so Vercel doesn't treat the skip as a failure and retry.
 *
 * The lock is acquired and released on one dedicated connection checked
 * out directly from the pool (`pool.connect()`), not through `db` (which
 * runs over the shared pool and could serve any two calls from different
 * connections) — `pg_advisory_lock`/`pg_advisory_unlock` are session-scoped
 * and only meaningful on the same connection. `fn` itself still does its
 * real work through independent per-row transactions (via `db`/
 * `withPlatformAdmin`) so one bad row's rollback can't undo another row's
 * already-committed work — the lock's job is only to stop two cron
 * invocations from processing the same rows concurrently, not to make the
 * whole batch one all-or-nothing unit.
 */
export async function runCronJob(
  jobName: string,
  fn: () => Promise<number>,
): Promise<{ ranJob: boolean; rowsAffected?: number; error?: string }> {
  const lockClient = await pool.connect();
  try {
    const { rows } = await lockClient.query<{ locked: boolean }>(
      "select pg_try_advisory_lock(hashtext($1)) as locked",
      [jobName],
    );
    if (!rows[0]?.locked) {
      return { ranJob: false };
    }

    const [run] = await db.insert(cronRuns).values({ jobName, status: "running" }).returning();

    try {
      const rowsAffected = await fn();
      await db
        .update(cronRuns)
        .set({ status: "success", finishedAt: new Date(), rowsAffected })
        .where(eq(cronRuns.id, run.id));
      return { ranJob: true, rowsAffected };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await db
        .update(cronRuns)
        .set({ status: "error", finishedAt: new Date(), errorMessage: message })
        .where(eq(cronRuns.id, run.id));
      return { ranJob: true, error: message };
    }
  } finally {
    await lockClient.query("select pg_advisory_unlock(hashtext($1))", [jobName]);
    lockClient.release();
  }
}
