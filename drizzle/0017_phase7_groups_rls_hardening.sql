-- Phase 7 hardening: `groups` was ENABLE ROW LEVEL SECURITY but never got
-- FORCE ROW LEVEL SECURITY (every other tenant-scoped table has both — see
-- 0001_rls_policies.sql). Our app connects as the role that owns every
-- table (it ran the migrations), and Postgres exempts a table's owner from
-- RLS unless FORCE is set — so every "groups_*" policy below has been dead
-- code from a security-enforcement standpoint since Phase 0: confirmed live
-- by querying `groups` with app.current_group_id set to a nonexistent
-- tenant id and getting every group back anyway. Only the app-level
-- `WHERE group_id = ...` filters were ever actually protecting this table.
ALTER TABLE "groups" FORCE ROW LEVEL SECURITY;

-- Turning FORCE on for real exposes a second, previously-masked gap:
-- getSession() (lib/auth/session.ts) reads a user's own group_memberships
-- joined with each membership's `group` — for a *private* (is_public =
-- false) group, that join has no policy to satisfy once FORCE is real
-- (groups_public_read requires is_public = true; groups_tenant_read/write
-- require an app.current_group_id that getSession() never sets, since it's
-- deliberately not scoped to any one tenant — a user can belong to many).
-- This mirrors why group_memberships itself was deliberately left
-- unprotected by RLS ("relies on app-level scoping by user_id, inherent to
-- 'my own data'" — see 0001_rls_policies.sql) — a group a user actually
-- belongs to is equally "my own data," just one join further out.
-- NULLIF guards the cast: on a pooled connection, once app.current_user_id
-- has been SET (even LOCAL) by any earlier transaction, a later transaction
-- that never sets it sees current_setting(..., true) return '' rather than
-- NULL (confirmed empirically — a well-known custom-GUC quirk, not
-- documented behavior worth assuming). Without the guard, ''::int throws a
-- hard Postgres error instead of the intended "no access" — see
-- 0018_phase7_rls_null_guard.sql, which applies the same fix retroactively
-- to every other policy in the schema (all written before this was caught).
CREATE POLICY "groups_own_membership_read" ON "groups"
  FOR SELECT
  USING (
    id IN (
      SELECT group_id FROM group_memberships
      WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        AND status = 'active'
    )
  );
