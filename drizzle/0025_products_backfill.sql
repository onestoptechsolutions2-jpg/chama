-- Backfills the new groups.*_enabled flags from each existing group's
-- `type`, using the exact mapping lib/nav-config.ts's old `groupTypes`
-- filter already encoded (now lib/domain/products.ts's
-- defaultProductsForType) — so no existing group's actual feature access
-- changes the moment this deploys. From here on, `type` is just a label;
-- only these flags (Settings > Products) control access.
UPDATE "groups" SET "loans_enabled" = true, "mgr_enabled" = true
  WHERE "type" = 'chama';

UPDATE "groups" SET "welfare_enabled" = true
  WHERE "type" = 'welfare';

UPDATE "groups" SET "loans_enabled" = true, "mgr_enabled" = true, "welfare_enabled" = true, "projects_enabled" = true
  WHERE "type" = 'hybrid';

UPDATE "groups" SET "loans_enabled" = true, "projects_enabled" = true
  WHERE "type" = 'selfhelp';
