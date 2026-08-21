CREATE TYPE "onboarding_stage" AS ENUM (
  'lead', 'contacted', 'demo', 'registration', 'verification',
  'training', 'active', 'at_risk', 'churned'
);

CREATE TYPE "account_tier" AS ENUM ('standard', 'key', 'strategic');

ALTER TABLE "groups"
  ADD COLUMN "contact_person_name" text,
  ADD COLUMN "contact_person_role" text,
  ADD COLUMN "contact_person_phone" text,
  ADD COLUMN "contact_person_email" text,
  ADD COLUMN "onboarding_stage" "onboarding_stage" NOT NULL DEFAULT 'lead',
  ADD COLUMN "account_tier" "account_tier" NOT NULL DEFAULT 'standard',
  ADD COLUMN "account_owner_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN "next_follow_up_at" timestamptz,
  ADD COLUMN "internal_notes" text;

UPDATE "groups"
SET "onboarding_stage" = 'active'
WHERE "registration_complete" = true;

CREATE TABLE "group_account_activities" (
  "id" serial PRIMARY KEY,
  "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
  "actor_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "activity_type" text NOT NULL,
  "note" text NOT NULL,
  "next_follow_up_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "group_account_activities_group_id_idx"
  ON "group_account_activities"("group_id");
CREATE INDEX "group_account_activities_created_at_idx"
  ON "group_account_activities"("created_at");

ALTER TABLE "group_account_activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "group_account_activities" FORCE ROW LEVEL SECURITY;

CREATE POLICY "group_account_activities_platform_read"
  ON "group_account_activities"
  FOR SELECT
  USING (current_setting('app.is_platform_admin', true) = 'true');

CREATE POLICY "group_account_activities_platform_insert"
  ON "group_account_activities"
  FOR INSERT
  WITH CHECK (current_setting('app.is_platform_admin', true) = 'true');