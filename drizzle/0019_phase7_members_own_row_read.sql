-- getSession() (lib/auth/session.ts) reads a user's own `members` rows
-- across every group they belong to, to build memberIdByGroup — it isn't
-- scoped to any one tenant (a user can have a members row in several
-- groups), so members_tenant_isolation's app.current_group_id check can't
-- cover it, the same reason groups_own_membership_read
-- (0017_phase7_groups_rls_hardening.sql) exists. Additive (FOR SELECT
-- only, doesn't touch members_tenant_isolation) — a user can always read
-- their own financial-profile row regardless of which tenant is currently
-- "active" in their session, but writes to it still only ever happen
-- through a tenant-scoped, staff-authorized path (withTenant), not this.
CREATE POLICY "members_own_row_read" ON "members"
  FOR SELECT
  USING (
    user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
  );
