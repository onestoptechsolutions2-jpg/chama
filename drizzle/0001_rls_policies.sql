-- Row-level security: defense-in-depth for multi-tenancy, not the sole
-- enforcement mechanism. Every Server Action / Route Handler that touches
-- tenant data still writes an explicit WHERE group_id = ... — RLS is the
-- fail-safe net so a forgotten filter returns zero rows instead of another
-- tenant's data. See lib/db/rls.ts (withTenant) for the app-side half of this.
--
-- One Postgres role serves the whole app (no per-tenant credentials), so
-- tenant scoping is carried per-transaction via `app.current_group_id`
-- (set by withTenant()). Super-admin/cross-tenant access is carried the
-- same way via `app.is_platform_admin`, set only by withPlatformAdmin()
-- after requirePlatformAdmin() has verified users.platform_role — so the
-- bypass is explicit, auditable, and scoped to one transaction, rather than
-- granting BYPASSRLS to the app's role (which would let ANY careless query
-- silently skip RLS, not just verified super-admin code paths).
--
-- Applied here to `members` (the one tenant-scoped business table that
-- exists at this phase) and `groups`; every future tenant-scoped table
-- (contributions, loans, fines, etc.) gets the same pattern when introduced.
--
-- `group_memberships`, `users`, and `sessions` are deliberately NOT covered
-- by a group_id policy: a user must be able to see all of *their own*
-- memberships across every group they belong to (e.g. the group-switcher),
-- which isn't a single-tenant access pattern. Those tables rely on
-- app-level scoping by user_id instead (inherent to "my own data").

ALTER TABLE "members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "members" FORCE ROW LEVEL SECURITY;

CREATE POLICY "members_tenant_isolation" ON "members"
  USING (
    group_id = current_setting('app.current_group_id', true)::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

-- Public group discovery (landing page) reads groups anonymously — this
-- policy encodes that business rule declaratively instead of "no auth on
-- this route". Staff-only fields aren't protected by this policy alone;
-- the query layer selects only public-safe columns for anonymous reads.
ALTER TABLE "groups" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "groups_public_read" ON "groups"
  FOR SELECT
  USING (is_public = true);

CREATE POLICY "groups_tenant_read" ON "groups"
  FOR SELECT
  USING (
    id = current_setting('app.current_group_id', true)::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

CREATE POLICY "groups_tenant_write" ON "groups"
  FOR UPDATE
  USING (
    id = current_setting('app.current_group_id', true)::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

CREATE POLICY "groups_platform_admin_insert" ON "groups"
  FOR INSERT
  WITH CHECK (current_setting('app.is_platform_admin', true) = 'true');
