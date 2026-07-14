-- Same pattern as 0001/0003/0005/0007/0009/0011 — see those files for the
-- full rationale. The overdue-fine cron writes to this table via
-- withPlatformAdmin() (it iterates every group in one pass, so it isn't
-- scoped to a single tenant's app.current_group_id the way a normal
-- request is) — same escape hatch the payments webhook handler uses.

ALTER TABLE "contribution_dues" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contribution_dues" FORCE ROW LEVEL SECURITY;
CREATE POLICY "contribution_dues_tenant_isolation" ON "contribution_dues"
  USING (
    group_id = current_setting('app.current_group_id', true)::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );
