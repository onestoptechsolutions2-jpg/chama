CREATE TYPE "public"."invite_status" AS ENUM('pending', 'accepted', 'cancelled');--> statement-breakpoint
CREATE TABLE "group_invites" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"role" "membership_role" DEFAULT 'member' NOT NULL,
	"member_id" integer,
	"token" text NOT NULL,
	"status" "invite_status" DEFAULT 'pending' NOT NULL,
	"invited_by" integer,
	"accepted_by" integer,
	"accepted_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_invites_group_id_idx" ON "group_invites" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "group_invites_phone_idx" ON "group_invites" USING btree ("phone");--> statement-breakpoint
-- Standard tenant isolation (see 0001_rls_policies.sql). The invitee isn't a
-- member yet, so accepting looks the invite up by its secret token under
-- withPlatformAdmin, scoped to that one token (app/invite/actions.ts).
ALTER TABLE "group_invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "group_invites" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "group_invites_tenant_isolation" ON "group_invites"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );
