-- subscription_invoices: standard tenant-isolation pattern (same as
-- platform_payments/group_wallets) — staff can view/manage their own
-- group's invoices; platform admin can see across tenants for support.
-- Not append-only like mgr_slot_events/wallet_transactions: this is a
-- computed financial record the group's own staff should be able to
-- manage (e.g. cancel a stale pending invoice), not an audit log of
-- actions taken.
ALTER TABLE "subscription_invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscription_invoices" FORCE ROW LEVEL SECURITY;

CREATE POLICY "subscription_invoices_tenant_isolation" ON "subscription_invoices"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );
