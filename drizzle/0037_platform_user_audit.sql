CREATE TABLE "platform_user_audit_logs" (
  "id" serial PRIMARY KEY,
  "actor_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "target_user_id" integer NOT NULL REFERENCES "users"("id"),
  "event_type" text NOT NULL DEFAULT 'platform_user_event',
  "from_platform_role" "platform_role",
  "to_platform_role" "platform_role",
  "note" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "platform_user_audit_logs_target_user_idx"
  ON "platform_user_audit_logs"("target_user_id");

CREATE INDEX "platform_user_audit_logs_actor_user_idx"
  ON "platform_user_audit_logs"("actor_user_id");

CREATE INDEX "platform_user_audit_logs_created_at_idx"
  ON "platform_user_audit_logs"("created_at");

ALTER TABLE "platform_user_audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_user_audit_logs" FORCE ROW LEVEL SECURITY;

CREATE POLICY "platform_user_audit_logs_platform_read"
  ON "platform_user_audit_logs"
  FOR SELECT
  USING (current_setting('app.is_platform_admin', true) = 'true');

CREATE POLICY "platform_user_audit_logs_platform_insert"
  ON "platform_user_audit_logs"
  FOR INSERT
  WITH CHECK (current_setting('app.is_platform_admin', true) = 'true');