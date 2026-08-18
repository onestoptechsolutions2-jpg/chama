-- Phase 8: standard tenant-isolation pattern (same shape as loan_guarantors,
-- group_wallets, etc.) for every new welfare table except welfare_ledger,
-- which gets the append-only treatment below (same reasoning as
-- wallet_transactions/mgr_slot_events). Row-level (per-member/per-user)
-- filtering within a tenant — e.g. "my own requests", "my own
-- notifications" — is done at the application query level, same convention
-- already used for contributions/loans/etc.; RLS here only ever enforces
-- tenant boundaries, not per-user visibility within a tenant.

ALTER TABLE "welfare_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "welfare_policies" FORCE ROW LEVEL SECURITY;

CREATE POLICY "welfare_policies_tenant_isolation" ON "welfare_policies"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER TABLE "welfare_funds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "welfare_funds" FORCE ROW LEVEL SECURITY;

CREATE POLICY "welfare_funds_tenant_isolation" ON "welfare_funds"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER TABLE "welfare_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "welfare_requests" FORCE ROW LEVEL SECURITY;

CREATE POLICY "welfare_requests_tenant_isolation" ON "welfare_requests"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER TABLE "welfare_grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "welfare_grants" FORCE ROW LEVEL SECURITY;

CREATE POLICY "welfare_grants_tenant_isolation" ON "welfare_grants"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER TABLE "welfare_advances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "welfare_advances" FORCE ROW LEVEL SECURITY;

CREATE POLICY "welfare_advances_tenant_isolation" ON "welfare_advances"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER TABLE "welfare_advance_repayments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "welfare_advance_repayments" FORCE ROW LEVEL SECURITY;

CREATE POLICY "welfare_advance_repayments_tenant_isolation" ON "welfare_advance_repayments"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER TABLE "welfare_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "welfare_approvals" FORCE ROW LEVEL SECURITY;

CREATE POLICY "welfare_approvals_tenant_isolation" ON "welfare_approvals"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;

CREATE POLICY "notifications_tenant_isolation" ON "notifications"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

-- welfare_ledger: append-only, same as wallet_transactions/mgr_slot_events —
-- deliberately only SELECT and INSERT policies, no UPDATE, no DELETE. Under
-- RLS with FORCE, a command with no matching policy is denied outright for
-- any role without BYPASSRLS (chama_app has none), so corrections to
-- welfare fund history must be new reversal/adjustment rows, never edits.
ALTER TABLE "welfare_ledger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "welfare_ledger" FORCE ROW LEVEL SECURITY;

CREATE POLICY "welfare_ledger_tenant_read" ON "welfare_ledger"
  FOR SELECT
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

CREATE POLICY "welfare_ledger_tenant_insert" ON "welfare_ledger"
  FOR INSERT
  WITH CHECK (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );
