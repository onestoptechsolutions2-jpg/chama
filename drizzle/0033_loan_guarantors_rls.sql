-- loan_guarantors: standard tenant-isolation pattern (same as loans/
-- loan_applications) — staff can view/manage guarantor records for their
-- own group's loans; platform admin can see across tenants for support.
-- Not append-only: a guarantor's own accept/decline is a normal update
-- (respondToGuaranteeRequestAction), not an audit-log entry.
ALTER TABLE "loan_guarantors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "loan_guarantors" FORCE ROW LEVEL SECURITY;

CREATE POLICY "loan_guarantors_tenant_isolation" ON "loan_guarantors"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );
