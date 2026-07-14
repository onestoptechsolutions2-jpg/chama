-- Same pattern as drizzle/0001_rls_policies.sql, applied to the Phase 1
-- tenant-scoped tables: enable + force RLS, one USING clause keyed on
-- app.current_group_id (or app.is_platform_admin for the super-admin
-- escape hatch). See lib/db/rls.ts for the transaction wrappers that set
-- these session variables.

ALTER TABLE "rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rules" FORCE ROW LEVEL SECURITY;
CREATE POLICY "rules_tenant_isolation" ON "rules"
  USING (
    group_id = current_setting('app.current_group_id', true)::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER TABLE "announcements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "announcements" FORCE ROW LEVEL SECURITY;
CREATE POLICY "announcements_tenant_isolation" ON "announcements"
  USING (
    group_id = current_setting('app.current_group_id', true)::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER TABLE "contributions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contributions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "contributions_tenant_isolation" ON "contributions"
  USING (
    group_id = current_setting('app.current_group_id', true)::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER TABLE "fines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fines" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fines_tenant_isolation" ON "fines"
  USING (
    group_id = current_setting('app.current_group_id', true)::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER TABLE "meetings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meetings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "meetings_tenant_isolation" ON "meetings"
  USING (
    group_id = current_setting('app.current_group_id', true)::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER TABLE "attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance" FORCE ROW LEVEL SECURITY;
CREATE POLICY "attendance_tenant_isolation" ON "attendance"
  USING (
    group_id = current_setting('app.current_group_id', true)::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );
