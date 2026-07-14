import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../lib/db/client";
import { withTenant, withPlatformAdmin, withUser } from "../lib/db/rls";
import {
  groups,
  members,
  rules,
  contributions,
  fines,
  mgrCycles,
  contributionDues,
  platformPayments,
  users,
} from "../lib/db/schema";

/**
 * Phase 7 hardening: this suite exists because RLS was never actually
 * enforced for this app until now. `neondb_owner` — the only role the app
 * ever connected as through Phase 6 — has BYPASSRLS (Neon grants this to a
 * project's default/owner role), which makes every `FORCE ROW LEVEL
 * SECURITY` in every migration a no-op for that role regardless of what
 * the policies say. Only after adding a separate least-privilege
 * `chama_app` role (see docs/architecture.md Phase 7 notes,
 * lib/db/client.ts's APP_DATABASE_URL) did any of this become real — and
 * turning it on for real immediately surfaced two more bugs, both fixed by
 * migrations 0017-0019: `groups` was missing FORCE entirely, and every
 * policy's bare `current_setting(..., true)::int` cast threw a hard
 * Postgres error instead of failing safe once a pooled connection had
 * previously set the session variable in an earlier, unrelated
 * transaction (empirically confirmed, not assumed — see
 * 0018_phase7_rls_null_guard.sql's comment).
 *
 * This suite runs against `db`/`pool` from lib/db/client.ts, i.e. against
 * whatever role APP_DATABASE_URL points at — meaning it only actually
 * proves anything as long as that role has no RLS bypass. A regression
 * back to a bypass-capable role would make every test below pass
 * vacuously; there's no automated guard against that short of checking
 * pg_roles.rolbypassrls directly, which the first test does.
 */

let tenantA: number;
let tenantB: number;
let memberA: number;

beforeAll(async () => {
  const roleCheck = await pool.query(
    `select rolbypassrls from pg_roles where rolname = current_user`,
  );
  if (roleCheck.rows[0]?.rolbypassrls) {
    throw new Error(
      "The role this test suite is connected as has BYPASSRLS — every " +
        "assertion below would pass vacuously. Point APP_DATABASE_URL at " +
        "the least-privilege chama_app role, not the owner role.",
    );
  }

  const [gA, gB] = await withPlatformAdmin((tx) =>
    Promise.all([
      tx
        .insert(groups)
        .values({ name: "RLS Test Tenant A", type: "chama", isPublic: false })
        .returning({ id: groups.id }),
      tx
        .insert(groups)
        .values({ name: "RLS Test Tenant B", type: "chama", isPublic: false })
        .returning({ id: groups.id }),
    ]),
  );
  tenantA = gA[0].id;
  tenantB = gB[0].id;

  const [m] = await withTenant(tenantA, (tx) =>
    tx
      .insert(members)
      .values({ groupId: tenantA, name: "RLS Test Member A" })
      .returning({ id: members.id }),
  );
  memberA = m.id;
});

afterAll(async () => {
  // Cascades clean up every fixture row (members, contributions, fines,
  // mgr_cycles, contribution_dues, platform_payments, group_memberships)
  // via ON DELETE CASCADE — see lib/db/schema.ts.
  await withPlatformAdmin((tx) =>
    tx.delete(groups).where(inArray(groups.id, [tenantA, tenantB])),
  );
  await pool.end();
});

/**
 * Applies to every "standard" tenant-scoped table: group_id = the tenant,
 * one row visible only within its own tenant or to a platform admin.
 */
// `table`/`idCol` are deliberately untyped (drizzle's generics don't play
// well with a reusable helper like this — `.from(table)` wants a concrete
// PgTable, not a generic `T extends Table`) — this is test-only harness
// code, not a pattern to reuse in the app itself, and every call site below
// passes a real schema table + its own `.id` column, so runtime correctness
// isn't in question, just static typing of the helper.
function testTenantIsolation(
  label: string,
  table: any,
  idCol: any,
  insertValues: () => Record<string, unknown>,
) {
  describe(`RLS: ${label}`, () => {
    let rowId: number;

    beforeAll(async () => {
      const [row] = await withTenant(tenantA, (tx) =>
        tx
          .insert(table)
          .values(insertValues())
          .returning({ id: idCol }),
      );
      rowId = (row as { id: number }).id;
    });

    it("is visible within its own tenant", async () => {
      const rows = await withTenant(tenantA, (tx) =>
        tx.select().from(table).where(eq(idCol, rowId)),
      );
      expect(rows).toHaveLength(1);
    });

    it("is invisible from a different tenant", async () => {
      const rows = await withTenant(tenantB, (tx) =>
        tx.select().from(table).where(eq(idCol, rowId)),
      );
      expect(rows).toHaveLength(0);
    });

    it("is invisible with no RLS context set at all (the fail-safe RLS exists for)", async () => {
      const rows = await db.select().from(table).where(eq(idCol, rowId));
      expect(rows).toHaveLength(0);
    });

    it("cannot be updated or deleted from a different tenant", async () => {
      // Every table this helper is called with has createdAt — an
      // arbitrary but real column to attempt to write, since
      // drizzle rejects .set({}) client-side before RLS is ever consulted.
      const updated = await withTenant(tenantB, (tx) =>
        tx
          .update(table)
          .set({ createdAt: new Date() })
          .where(eq(idCol, rowId))
          .returning({ id: idCol }),
      );
      expect(updated).toHaveLength(0);

      const deleted = await withTenant(tenantB, (tx) =>
        tx
          .delete(table)
          .where(eq(idCol, rowId))
          .returning({ id: idCol }),
      );
      expect(deleted).toHaveLength(0);

      // Confirm it's still there from tenant A's own side — a "delete
      // affected 0 rows" that actually silently deleted from the wrong
      // scope would be a much worse bug than one that visibly fails.
      const stillThere = await withTenant(tenantA, (tx) =>
        tx.select().from(table).where(eq(idCol, rowId)),
      );
      expect(stillThere).toHaveLength(1);
    });

    it("is visible to a platform admin across tenants", async () => {
      const rows = await withPlatformAdmin((tx) =>
        tx.select().from(table).where(eq(idCol, rowId)),
      );
      expect(rows).toHaveLength(1);
    });
  });
}

testTenantIsolation("members", members, members.id, () => ({
  groupId: tenantA,
  name: "RLS Isolation Member",
}));

testTenantIsolation("rules", rules, rules.id, () => ({
  groupId: tenantA,
  ruleNumber: "RLS-1",
  description: "RLS test rule",
}));

testTenantIsolation("contributions", contributions, contributions.id, () => ({
  groupId: tenantA,
  memberId: memberA,
  amount: "100",
  type: "capital",
}));

testTenantIsolation("fines", fines, fines.id, () => ({
  groupId: tenantA,
  memberId: memberA,
  amount: "50",
}));

testTenantIsolation("mgrCycles", mgrCycles, mgrCycles.id, () => ({
  groupId: tenantA,
  cycleNumber: 999,
}));

testTenantIsolation("contributionDues", contributionDues, contributionDues.id, () => ({
  groupId: tenantA,
  memberId: memberA,
  dueDate: "2026-01-01",
  amountDue: "100",
}));

testTenantIsolation("platformPayments", platformPayments, platformPayments.id, () => ({
  groupId: tenantA,
  amount: "150",
  feePct: "5",
}));

describe("RLS: groups (special-cased policies, not the standard tenant pattern)", () => {
  it("a private group is invisible cross-tenant and with no context", async () => {
    const crossTenant = await withTenant(tenantB, (tx) =>
      tx.select().from(groups).where(eq(groups.id, tenantA)),
    );
    expect(crossTenant).toHaveLength(0);

    const noContext = await db.select().from(groups).where(eq(groups.id, tenantA));
    expect(noContext).toHaveLength(0);
  });

  it("a public group is visible regardless of tenant context (by design — /discover)", async () => {
    const [pub] = await withPlatformAdmin((tx) =>
      tx
        .insert(groups)
        .values({
          name: "RLS Test Public Group",
          type: "chama",
          isPublic: true,
          // groups_public_read requires both — a group missing its
          // officials isn't publicly discoverable even if isPublic is
          // true (see lib/domain/officials.ts, 0023_..._public_read_gate.sql).
          registrationComplete: true,
        })
        .returning({ id: groups.id }),
    );
    try {
      const fromWrongTenant = await withTenant(tenantB, (tx) =>
        tx.select().from(groups).where(eq(groups.id, pub.id)),
      );
      expect(fromWrongTenant).toHaveLength(1);

      const withNoContext = await db.select().from(groups).where(eq(groups.id, pub.id));
      expect(withNoContext).toHaveLength(1);
    } finally {
      await withPlatformAdmin((tx) => tx.delete(groups).where(eq(groups.id, pub.id)));
    }
  });

  it("a platform admin can create a group; a tenant-scoped context cannot", async () => {
    const denied = await withTenant(tenantA, (tx) =>
      tx
        .insert(groups)
        .values({ name: "Should Not Be Insertable", type: "chama" })
        .returning({ id: groups.id })
        .catch(() => []),
    );
    expect(denied).toHaveLength(0);
  });
});

describe("RLS: 'my own data' escape hatches (withUser)", () => {
  it("members_own_row_read: a user sees their own member row without any tenant context", async () => {
    // `users` isn't RLS-protected (see 0001_rls_policies.sql — it relies on
    // app-level scoping by id, same as group_memberships), so this needs
    // no wrapper.
    const [testUser] = await db
      .insert(users)
      .values({
        name: "RLS Test User",
        email: "rls-test-user@example.local",
        passwordHash: "x",
      })
      .returning({ id: users.id });
    const testUserId = testUser.id;

    try {
      await withTenant(tenantA, (tx) =>
        tx.update(members).set({ userId: testUserId }).where(eq(members.id, memberA)),
      );

      const viaOwnRow = await withUser(testUserId, (tx) =>
        tx.select().from(members).where(eq(members.userId, testUserId)),
      );
      expect(viaOwnRow).toHaveLength(1);

      const viaNoContext = await db.select().from(members).where(eq(members.userId, testUserId));
      expect(viaNoContext).toHaveLength(0);
    } finally {
      await withTenant(tenantA, (tx) =>
        tx.update(members).set({ userId: null }).where(eq(members.id, memberA)),
      );
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });
});

describe("RLS: the NULLIF empty-string guard (0018_phase7_rls_null_guard.sql)", () => {
  it("a pooled connection that previously set app.current_group_id doesn't crash a later unscoped query", async () => {
    // Reproduces the exact scenario that originally threw
    // `invalid input syntax for type integer: ""` — a session variable set
    // (even LOCAL) in one transaction on a reused connection leaves
    // current_setting(..., true) returning '' rather than NULL in a later
    // transaction that never sets it, on this Postgres/Neon setup.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`select set_config('app.current_group_id', $1, true)`, [String(tenantA)]);
      await client.query("COMMIT");

      await client.query("BEGIN");
      // Would throw `invalid input syntax for type integer: ""` (22P02)
      // without the NULLIF guard — resolving at all is half the assertion,
      // the empty result is the other half (fails safe: no context this
      // transaction, so no rows, not an error).
      const result = await client.query("select id from members where id = $1", [memberA]);
      expect(result.rows).toHaveLength(0);
      await client.query("COMMIT");
    } finally {
      client.release();
    }
  });
});
