CREATE TABLE "group_withdrawals" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"destination" jsonb NOT NULL,
	"narrative" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"requested_by" integer,
	"approved_by" integer,
	"tracking_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "intasend_wallet_id" text;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "payout_destination" jsonb;--> statement-breakpoint
ALTER TABLE "group_withdrawals" ADD CONSTRAINT "group_withdrawals_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_withdrawals" ADD CONSTRAINT "group_withdrawals_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_withdrawals" ADD CONSTRAINT "group_withdrawals_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_withdrawals_group_idx" ON "group_withdrawals" USING btree ("group_id","created_at");--> statement-breakpoint
ALTER TABLE "group_withdrawals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "group_withdrawals" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "group_withdrawals_tenant_isolation" ON "group_withdrawals"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );
