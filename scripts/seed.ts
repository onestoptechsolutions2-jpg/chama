/**
 * Seed script — creates one demo group with one admin user.
 *
 * Deliberately does group -> user -> group_membership as ONE transaction.
 * The old backend/src/scripts/seed.js never created the group_memberships
 * row for seeded accounts, so they silently failed the membership check on
 * login (bug 8 in the rewrite plan) — this is the structural fix, regression
 * tested by tests/seed-membership.test.ts (seed -> assert the membership
 * check that getSession()/requireSession() rely on actually passes).
 *
 * Safe to re-run: skips entirely if any group already exists.
 */
// Env vars are loaded via `node --env-file=.env.local` (see the db:seed npm
// script) rather than dotenv here — ESM import statements are hoisted above
// any top-level code in this file, so a dotenv.config() call here would run
// too late: "../lib/db/client" (imported below) already reads
// process.env.APP_DATABASE_URL at module-evaluation time.
import { fileURLToPath } from "url";
import { pool } from "../lib/db/client";
import { withPlatformAdmin } from "../lib/db/rls";
import { groups, users, groupMemberships } from "../lib/db/schema";
import { hashPassword } from "../lib/auth/password";

const GROUP_NAME = process.env.GROUP_NAME || "My Chama";
const GROUP_TYPE = (process.env.GROUP_TYPE || "chama") as
  | "chama"
  | "welfare"
  | "hybrid"
  | "selfhelp";
const ADMIN_NAME = process.env.ADMIN_NAME || "Admin";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@chama.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin1234!";

export type SeedResult = { groupId: number; adminUserId: number; created: boolean };

/**
 * Idempotent: if any group already exists, returns the first existing
 * group's admin membership instead of creating a second one. Callers (the
 * CLI entrypoint below, and the regression test) can rely on the return
 * value pointing at a real, active group_memberships row either way.
 */
export async function seedDemoData(): Promise<SeedResult> {
  // groups is RLS-protected (see docs/architecture.md Phase 7 notes) — a
  // freshly-seeded group could be private, and seeding/bootstrapping a
  // brand-new tenant is inherently a platform-level operation, not scoped
  // to any single existing tenant, so withPlatformAdmin is the right escape
  // hatch here (same one the super-admin console's createGroupAction uses).
  const existing = await withPlatformAdmin((tx) => tx.query.groups.findFirst());
  if (existing) {
    const membership = await withPlatformAdmin((tx) =>
      tx.query.groupMemberships.findFirst({
        where: (m, { eq, and }) => and(eq(m.groupId, existing.id), eq(m.role, "admin")),
      }),
    );
    if (!membership) {
      throw new Error(
        `Group "${existing.name}" exists but has no admin membership — seed data is inconsistent`,
      );
    }
    return { groupId: existing.id, adminUserId: membership.userId, created: false };
  }

  const passwordHash = await hashPassword(ADMIN_PASSWORD);

  return withPlatformAdmin(async (tx) => {
    const [group] = await tx
      .insert(groups)
      .values({
        name: GROUP_NAME,
        type: GROUP_TYPE,
        currency: "KES",
        meetingDay: "first_sunday",
        meetingTime: "15:00",
      })
      .returning();

    const [admin] = await tx
      .insert(users)
      .values({
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        passwordHash,
      })
      .returning();

    await tx.insert(groupMemberships).values({
      userId: admin.id,
      groupId: group.id,
      role: "admin",
      status: "active",
    });

    return { groupId: group.id, adminUserId: admin.id, created: true };
  });
}

async function main() {
  const result = await seedDemoData();
  if (result.created) {
    console.log(`Seeded group #${result.groupId}`);
    console.log(`Admin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  } else {
    console.log("Seed skipped — a group already exists (id", result.groupId, ")");
  }
}

// Only run when invoked directly as the CLI script (`npm run db:seed`), not
// when imported by tests.
const isMainModule =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  main()
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
