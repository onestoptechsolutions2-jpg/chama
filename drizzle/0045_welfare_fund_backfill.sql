-- Re-runs 0036's welfare_policies/welfare_funds backfill for any group that
-- turned welfare on since then via activateProductAction — which, until
-- now, never actually wrote these rows despite getOrCreateWelfareFund's own
-- doc comment claiming activation-time creation was guaranteed elsewhere.
-- Every such group was silently depending on the lazy get-or-create
-- fail-safe, which a highly-concurrent page (the dashboard home,
-- Promise.all-ing 6 withTenant transactions) could race and fail against —
-- a real, reproduced RLS-violation bug. activateProductAction now creates
-- both rows itself going forward; this one-time backfill closes the gap for
-- every group that already slipped through.
INSERT INTO "welfare_policies" ("group_id")
SELECT "id" FROM "groups" WHERE "welfare_enabled" = true
ON CONFLICT ("group_id") DO NOTHING;

INSERT INTO "welfare_funds" ("group_id")
SELECT "id" FROM "groups" WHERE "welfare_enabled" = true
ON CONFLICT ("group_id") DO NOTHING;
