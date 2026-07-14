-- Same pattern as 0001/0003/0005 — see those files for the full rationale.

ALTER TABLE "welfare_claims" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "welfare_claims" FORCE ROW LEVEL SECURITY;
CREATE POLICY "welfare_claims_tenant_isolation" ON "welfare_claims"
  USING (
    group_id = current_setting('app.current_group_id', true)::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "projects" FORCE ROW LEVEL SECURITY;
CREATE POLICY "projects_tenant_isolation" ON "projects"
  USING (
    group_id = current_setting('app.current_group_id', true)::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER TABLE "project_contributions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "project_contributions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "project_contributions_tenant_isolation" ON "project_contributions"
  USING (
    group_id = current_setting('app.current_group_id', true)::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );
