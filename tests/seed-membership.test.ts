import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "../lib/db/client";
import { groupMemberships, users } from "../lib/db/schema";
import { seedDemoData } from "../scripts/seed";

/**
 * Regression test for bug 8: the old backend/src/scripts/seed.js created
 * users + members but never a group_memberships row, so seeded accounts
 * silently failed the membership check middleware/auth.js relied on and
 * couldn't actually log in to anything. This asserts the rewrite's seed
 * always leaves behind a real, active membership — the exact thing
 * getSession() (lib/auth/session.ts) queries to resolve a user's role.
 */
describe("seedDemoData", () => {
  afterAll(async () => {
    await pool.end();
  });

  it("leaves the admin with an active group membership", async () => {
    const { groupId, adminUserId } = await seedDemoData();

    const admin = await db.query.users.findFirst({
      where: eq(users.id, adminUserId),
    });
    expect(admin?.active).toBe(true);

    const membership = await db.query.groupMemberships.findFirst({
      where: eq(groupMemberships.userId, adminUserId),
    });

    expect(membership).toBeDefined();
    expect(membership?.groupId).toBe(groupId);
    expect(membership?.role).toBe("admin");
    // This is the exact condition getSession() filters on to build
    // `activeMembership`/`memberships` — if this were "pending" (as the
    // group_memberships default is), the seeded admin couldn't reach any
    // group-scoped page after logging in.
    expect(membership?.status).toBe("active");
  });
});
