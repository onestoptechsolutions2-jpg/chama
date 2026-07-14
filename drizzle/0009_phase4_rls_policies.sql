-- Same pattern as 0001/0003/0005/0007 — see those files for the full rationale.

ALTER TABLE "mgr_cycles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mgr_cycles" FORCE ROW LEVEL SECURITY;
CREATE POLICY "mgr_cycles_tenant_isolation" ON "mgr_cycles"
  USING (
    group_id = current_setting('app.current_group_id', true)::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER TABLE "mgr_slots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mgr_slots" FORCE ROW LEVEL SECURITY;
CREATE POLICY "mgr_slots_tenant_isolation" ON "mgr_slots"
  USING (
    group_id = current_setting('app.current_group_id', true)::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER TABLE "mgr_member_turns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mgr_member_turns" FORCE ROW LEVEL SECURITY;
CREATE POLICY "mgr_member_turns_tenant_isolation" ON "mgr_member_turns"
  USING (
    group_id = current_setting('app.current_group_id', true)::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER TABLE "mgr_agreements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mgr_agreements" FORCE ROW LEVEL SECURITY;
CREATE POLICY "mgr_agreements_tenant_isolation" ON "mgr_agreements"
  USING (
    group_id = current_setting('app.current_group_id', true)::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );
