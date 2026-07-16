-- group_wallets: standard tenant-isolation pattern (same as every other
-- tenant-scoped table since Phase 1/7) — the cached balance legitimately
-- gets updated by the app on every topup/deduction, so all commands are
-- allowed within the owning tenant.
ALTER TABLE "group_wallets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "group_wallets" FORCE ROW LEVEL SECURITY;

CREATE POLICY "group_wallets_tenant_isolation" ON "group_wallets"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

-- wallet_transactions: append-only, same as mgr_slot_events
-- (0021_phase7_mgr_slot_events_rls.sql) — deliberately only SELECT and
-- INSERT policies, no UPDATE, no DELETE. Under RLS with FORCE, a command
-- with no matching policy is denied outright for any role without
-- BYPASSRLS (chama_app has none), so this ledger can't be edited or
-- erased by the running app at all, regardless of what a bug or a
-- compromised session tries.
ALTER TABLE "wallet_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wallet_transactions" FORCE ROW LEVEL SECURITY;

CREATE POLICY "wallet_transactions_tenant_read" ON "wallet_transactions"
  FOR SELECT
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

CREATE POLICY "wallet_transactions_tenant_insert" ON "wallet_transactions"
  FOR INSERT
  WITH CHECK (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );
