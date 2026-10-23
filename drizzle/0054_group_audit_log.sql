CREATE TABLE "group_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"command" text NOT NULL,
	"actor_user_id" integer,
	"via" text NOT NULL,
	"on_behalf_of_user_id" integer,
	"reason" text,
	"input" jsonb NOT NULL,
	"ok" boolean NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "group_audit_log" ADD CONSTRAINT "group_audit_log_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_audit_log" ADD CONSTRAINT "group_audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_audit_log" ADD CONSTRAINT "group_audit_log_on_behalf_of_user_id_users_id_fk" FOREIGN KEY ("on_behalf_of_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_audit_log_group_created_idx" ON "group_audit_log" USING btree ("group_id","created_at");--> statement-breakpoint
-- Append-only (see 0021_phase7_mgr_slot_events_rls.sql for why): read and
-- insert policies only — no UPDATE or DELETE policy exists.
ALTER TABLE "group_audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "group_audit_log" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "group_audit_log_tenant_read" ON "group_audit_log"
  FOR SELECT
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );--> statement-breakpoint
CREATE POLICY "group_audit_log_tenant_insert" ON "group_audit_log"
  FOR INSERT
  WITH CHECK (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );
