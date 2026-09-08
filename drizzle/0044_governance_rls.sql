-- Standard tenant-isolation shape (see 0001_rls_policies.sql) for the new
-- governance tables — managed through Server Actions (withTenant), so the
-- usual group_id = current_group_id policy is correct for both.
ALTER TABLE "group_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "group_documents" FORCE ROW LEVEL SECURITY;

CREATE POLICY "group_documents_tenant_isolation" ON "group_documents"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER TABLE "compliance_obligations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "compliance_obligations" FORCE ROW LEVEL SECURITY;

CREATE POLICY "compliance_obligations_tenant_isolation" ON "compliance_obligations"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );
