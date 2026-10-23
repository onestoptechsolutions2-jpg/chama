-- One person = one phone/email (lib/domain/identity.ts).
-- Hand-edited from the generated file: existing data is normalised first,
-- and each unique index is only created when no duplicates remain, so a
-- deploy never fails on old duplicate data. Duplicates are listed on
-- /super-admin/users ("Possible duplicates") for support to merge; then run
-- `npm run db:enforce-unique-contacts` to add any index skipped here.
ALTER TABLE "users" ADD COLUMN "merged_into_user_id" integer;--> statement-breakpoint

-- Canonical Kenyan phone: "2547XXXXXXXX" / "2541XXXXXXXX".
UPDATE "users" SET "phone" = '254' || right(regexp_replace("phone", '[^0-9]', '', 'g'), 9)
WHERE "phone" IS NOT NULL
  AND regexp_replace("phone", '[^0-9]', '', 'g') ~ '^(254|0)?[17][0-9]{8}$'
  AND "phone" <> '254' || right(regexp_replace("phone", '[^0-9]', '', 'g'), 9);--> statement-breakpoint
UPDATE "members" SET "phone" = '254' || right(regexp_replace("phone", '[^0-9]', '', 'g'), 9)
WHERE "phone" IS NOT NULL
  AND regexp_replace("phone", '[^0-9]', '', 'g') ~ '^(254|0)?[17][0-9]{8}$'
  AND "phone" <> '254' || right(regexp_replace("phone", '[^0-9]', '', 'g'), 9);--> statement-breakpoint
UPDATE "users" SET "phone" = NULL WHERE "phone" = '';--> statement-breakpoint
UPDATE "members" SET "phone" = NULL WHERE "phone" = '';--> statement-breakpoint

-- Lowercase emails, except where that would collide with another account
-- (those are duplicates for support to merge).
UPDATE "users" u SET "email" = lower(trim(u."email"))
WHERE u."email" IS NOT NULL AND u."email" <> lower(trim(u."email"))
  AND NOT EXISTS (SELECT 1 FROM "users" o WHERE o."id" <> u."id" AND lower(o."email") = lower(trim(u."email")));--> statement-breakpoint
UPDATE "members" SET "email" = lower(trim("email")) WHERE "email" IS NOT NULL AND "email" <> lower(trim("email"));--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "users" WHERE "phone" IS NOT NULL GROUP BY "phone" HAVING count(*) > 1) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_unique" ON "users" USING btree ("phone") WHERE "users"."phone" is not null;
  ELSE
    RAISE WARNING 'users_phone_unique skipped: duplicate phones exist — merge them, then run db:enforce-unique-contacts';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "users" WHERE "email" IS NOT NULL GROUP BY lower("email") HAVING count(*) > 1) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "users_email_lower_unique" ON "users" USING btree (lower("email")) WHERE "users"."email" is not null;
  ELSE
    RAISE WARNING 'users_email_lower_unique skipped: duplicate emails exist';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "members" WHERE "phone" IS NOT NULL GROUP BY "group_id", "phone" HAVING count(*) > 1) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "members_group_phone_unique" ON "members" USING btree ("group_id","phone") WHERE "members"."phone" is not null;
  ELSE
    RAISE WARNING 'members_group_phone_unique skipped: a group has two roster rows with one phone';
  END IF;
END $$;
