-- Standard tenant-isolation shape (see 0001_rls_policies.sql) for api_keys
-- and webhook_endpoints — staff manage these through Server Actions
-- (withTenant), so the usual group_id = current_group_id policy is correct.
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_keys" FORCE ROW LEVEL SECURITY;

CREATE POLICY "api_keys_tenant_isolation" ON "api_keys"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER TABLE "webhook_endpoints" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_endpoints" FORCE ROW LEVEL SECURITY;

CREATE POLICY "webhook_endpoints_tenant_isolation" ON "webhook_endpoints"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

-- webhook_deliveries: append-only, same pattern as mgr_slot_events/
-- wallet_transactions/welfare_ledger — only SELECT/INSERT policies exist,
-- so under FORCE RLS an UPDATE or DELETE is denied outright for any role
-- without BYPASSRLS (chama_app deliberately has none). A delivery attempt
-- is a permanent fact.
ALTER TABLE "webhook_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_deliveries" FORCE ROW LEVEL SECURITY;

CREATE POLICY "webhook_deliveries_tenant_read" ON "webhook_deliveries"
  FOR SELECT
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

CREATE POLICY "webhook_deliveries_tenant_insert" ON "webhook_deliveries"
  FOR INSERT
  WITH CHECK (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );
