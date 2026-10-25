-- One invoice per group per month. If duplicates already exist (from two
-- manual clicks at the same moment) the index is skipped with a notice
-- rather than failing the deploy; the app still checks before inserting.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "subscription_invoices" GROUP BY group_id, period_start HAVING count(*) > 1) THEN
    RAISE NOTICE 'subscription_invoices has duplicate months; unique index skipped';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "subscription_invoices_group_period_unique" ON "subscription_invoices" USING btree ("group_id","period_start");
  END IF;
END $$;
