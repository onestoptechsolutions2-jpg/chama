CREATE TABLE "share_out_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"share_out_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	"savings" numeric(14, 2) NOT NULL,
	"earnings" numeric(14, 2) NOT NULL,
	"loan_deducted" numeric(14, 2) DEFAULT '0' NOT NULL,
	"fines_deducted" numeric(14, 2) DEFAULT '0' NOT NULL,
	"shares_kept" numeric(14, 2) DEFAULT '0' NOT NULL,
	"payout" numeric(14, 2) NOT NULL,
	"still_owes" numeric(14, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_outs" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"method" text NOT NULL,
	"keep_shares" boolean DEFAULT false NOT NULL,
	"interest_earned" numeric(14, 2) NOT NULL,
	"fines_collected" numeric(14, 2) NOT NULL,
	"other_income" numeric(14, 2) DEFAULT '0' NOT NULL,
	"expenses" numeric(14, 2) DEFAULT '0' NOT NULL,
	"profit" numeric(14, 2) NOT NULL,
	"total_payout" numeric(14, 2) NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"prepared_by" integer,
	"confirmed_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "share_out_lines" ADD CONSTRAINT "share_out_lines_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_out_lines" ADD CONSTRAINT "share_out_lines_share_out_id_share_outs_id_fk" FOREIGN KEY ("share_out_id") REFERENCES "public"."share_outs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_out_lines" ADD CONSTRAINT "share_out_lines_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_outs" ADD CONSTRAINT "share_outs_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_outs" ADD CONSTRAINT "share_outs_prepared_by_users_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_outs" ADD CONSTRAINT "share_outs_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "share_out_lines_share_out_idx" ON "share_out_lines" USING btree ("share_out_id");--> statement-breakpoint
CREATE INDEX "share_out_lines_member_idx" ON "share_out_lines" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "share_outs_group_idx" ON "share_outs" USING btree ("group_id","status");--> statement-breakpoint
ALTER TABLE "share_outs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "share_outs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "share_outs_tenant_isolation" ON "share_outs"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );--> statement-breakpoint
ALTER TABLE "share_out_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "share_out_lines" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "share_out_lines_tenant_isolation" ON "share_out_lines"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );
