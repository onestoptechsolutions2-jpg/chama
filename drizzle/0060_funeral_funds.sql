ALTER TYPE "public"."webhook_event_type" ADD VALUE 'fund.gift.paid';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'fund.gift.failed';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'fund.closed';--> statement-breakpoint
CREATE TABLE "fund_gifts" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"external_id" text,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"branch" text,
	"message" text,
	"anonymous" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source" text NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fund_gifts_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "funeral_funds" (
	"group_id" integer PRIMARY KEY NOT NULL,
	"partner" text NOT NULL,
	"ref" text NOT NULL,
	"deceased_name" text NOT NULL,
	"closes_on" date NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"branches" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"give_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "funeral_funds_give_token_unique" UNIQUE("give_token")
);
--> statement-breakpoint
ALTER TABLE "welfare_requests" ADD COLUMN "partner_contact_ok" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "fund_gifts" ADD CONSTRAINT "fund_gifts_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funeral_funds" ADD CONSTRAINT "funeral_funds_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fund_gifts_group_idx" ON "fund_gifts" USING btree ("group_id","status");--> statement-breakpoint
CREATE INDEX "fund_gifts_phone_idx" ON "fund_gifts" USING btree ("group_id","phone","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "funeral_funds_partner_ref_idx" ON "funeral_funds" USING btree ("partner","ref");--> statement-breakpoint
ALTER TABLE "funeral_funds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "funeral_funds" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "funeral_funds_tenant_isolation" ON "funeral_funds"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );--> statement-breakpoint
ALTER TABLE "fund_gifts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fund_gifts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "fund_gifts_tenant_isolation" ON "fund_gifts"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );
