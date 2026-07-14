-- Same pattern as 0001/0003/0005/0007/0009 — see those files for the full
-- rationale. payment_webhook_events and cron_runs deliberately have NO RLS:
-- they're written by trusted system code (the webhook handler, the cron
-- handlers) that isn't scoped to any single tenant, and nothing in the app
-- queries them through a tenant-scoped path.

ALTER TABLE "platform_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "platform_payments_tenant_isolation" ON "platform_payments"
  USING (
    group_id = current_setting('app.current_group_id', true)::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );
