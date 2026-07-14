-- Same pattern as 0001/0003 — see those files for the full rationale.

ALTER TABLE "loans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "loans" FORCE ROW LEVEL SECURITY;
CREATE POLICY "loans_tenant_isolation" ON "loans"
  USING (
    group_id = current_setting('app.current_group_id', true)::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER TABLE "loan_repayments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "loan_repayments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "loan_repayments_tenant_isolation" ON "loan_repayments"
  USING (
    group_id = current_setting('app.current_group_id', true)::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER TABLE "loan_applications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "loan_applications" FORCE ROW LEVEL SECURITY;
CREATE POLICY "loan_applications_tenant_isolation" ON "loan_applications"
  USING (
    group_id = current_setting('app.current_group_id', true)::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );
