CREATE TABLE "support_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_user_id" integer NOT NULL,
	"group_id" integer NOT NULL,
	"as_user_id" integer,
	"mode" text NOT NULL,
	"reason" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "support_session_id" integer;--> statement-breakpoint
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_staff_user_id_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_as_user_id_users_id_fk" FOREIGN KEY ("as_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_sessions_group_idx" ON "support_sessions" USING btree ("group_id","created_at");--> statement-breakpoint
-- Platform-only: read and written under withPlatformAdmin (lib/auth/support.ts).
-- A group's own officials see support activity through group_audit_log.
ALTER TABLE "support_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "support_sessions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "support_sessions_platform_only" ON "support_sessions"
  USING (current_setting('app.is_platform_admin', true) = 'true');
