-- Every RLS policy written before this point (0001 through 0013, plus
-- groups_tenant_read/groups_tenant_write) casts
-- current_setting('app.current_group_id', true) straight to ::int without
-- guarding against an empty string. On a pooled connection (exactly how
-- lib/db/client.ts connects — one Pool reused across many requests), once
-- ANY transaction has set app.current_group_id via withTenant()/
-- withPlatformAdmin(), a LATER transaction on that same pooled connection
-- that never sets it sees current_setting(..., true) return '' (empty
-- string), not NULL — confirmed empirically while building the Phase 7 RLS
-- test suite, not assumed. ''::int throws a hard Postgres error (22P02),
-- so any query that reached an RLS-protected table without going through
-- withTenant/withPlatformAdmin at all — the exact "forgot the wrapper"
-- mistake RLS exists to fail safely against — would 500 instead of
-- gracefully returning zero rows, on a connection that had prior tenant
-- traffic. NULLIF(x, '') converts the empty string back to NULL before
-- the cast, restoring the intended fail-safe behavior. This never surfaced
-- before because neondb_owner (the sole role this app connected as through
-- Phase 6) has BYPASSRLS — see docs/architecture.md Phase 7 notes and
-- 0017_phase7_groups_rls_hardening.sql for the role-separation fix that
-- made RLS actually load-bearing for the first time, which is what
-- exposed this.

ALTER POLICY "members_tenant_isolation" ON "members"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER POLICY "rules_tenant_isolation" ON "rules"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER POLICY "announcements_tenant_isolation" ON "announcements"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER POLICY "contributions_tenant_isolation" ON "contributions"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER POLICY "fines_tenant_isolation" ON "fines"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER POLICY "meetings_tenant_isolation" ON "meetings"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER POLICY "attendance_tenant_isolation" ON "attendance"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER POLICY "loans_tenant_isolation" ON "loans"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER POLICY "loan_repayments_tenant_isolation" ON "loan_repayments"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER POLICY "loan_applications_tenant_isolation" ON "loan_applications"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER POLICY "welfare_claims_tenant_isolation" ON "welfare_claims"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER POLICY "projects_tenant_isolation" ON "projects"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER POLICY "project_contributions_tenant_isolation" ON "project_contributions"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER POLICY "mgr_cycles_tenant_isolation" ON "mgr_cycles"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER POLICY "mgr_slots_tenant_isolation" ON "mgr_slots"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER POLICY "mgr_member_turns_tenant_isolation" ON "mgr_member_turns"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER POLICY "mgr_agreements_tenant_isolation" ON "mgr_agreements"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER POLICY "platform_payments_tenant_isolation" ON "platform_payments"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER POLICY "contribution_dues_tenant_isolation" ON "contribution_dues"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER POLICY "groups_tenant_read" ON "groups"
  USING (
    id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER POLICY "groups_tenant_write" ON "groups"
  USING (
    id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

