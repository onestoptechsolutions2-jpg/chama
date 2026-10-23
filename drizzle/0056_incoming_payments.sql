CREATE TABLE "incoming_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"payer_phone" text,
	"payer_name" text,
	"account_ref" text,
	"received_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'unmatched' NOT NULL,
	"member_id" integer,
	"applied_as" text,
	"contribution_id" integer,
	"loan_id" integer,
	"matched_by" integer,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incoming_payments_source_external_unique" UNIQUE("group_id","source","external_id")
);
--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "paybill_number" text;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "c2b_token" text;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "payment_default_type" text DEFAULT 'capital' NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "member_number" text;--> statement-breakpoint
ALTER TABLE "incoming_payments" ADD CONSTRAINT "incoming_payments_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incoming_payments" ADD CONSTRAINT "incoming_payments_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incoming_payments" ADD CONSTRAINT "incoming_payments_contribution_id_contributions_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "public"."contributions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incoming_payments" ADD CONSTRAINT "incoming_payments_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incoming_payments" ADD CONSTRAINT "incoming_payments_matched_by_users_id_fk" FOREIGN KEY ("matched_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incoming_payments_group_status_idx" ON "incoming_payments" USING btree ("group_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "members_group_number_unique" ON "members" USING btree ("group_id","member_number") WHERE "members"."member_number" is not null;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_c2b_token_unique" UNIQUE("c2b_token");--> statement-breakpoint
ALTER TABLE "incoming_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "incoming_payments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "incoming_payments_tenant_isolation" ON "incoming_payments"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );--> statement-breakpoint

-- Give every existing member a short account number (1, 2, 3… per group).
UPDATE "members" m SET "member_number" = n.rn::text
FROM (SELECT "id", row_number() OVER (PARTITION BY "group_id" ORDER BY "id") AS rn FROM "members") n
WHERE m."id" = n."id" AND m."member_number" IS NULL;--> statement-breakpoint

-- New members get the next number automatically, whichever code path adds
-- them. SECURITY DEFINER so the max() sees the whole group regardless of the
-- caller's RLS context; a per-group advisory lock stops two concurrent
-- inserts picking the same number. Earlier rows of a multi-row INSERT are
-- visible here, so a CSV import numbers sequentially.
CREATE OR REPLACE FUNCTION assign_member_number() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.member_number IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('members.member_number'), NEW.group_id);
    SELECT (coalesce(max(member_number::int), 0) + 1)::text INTO NEW.member_number
    FROM members WHERE group_id = NEW.group_id AND member_number ~ '^[0-9]{1,9}$';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER members_assign_number BEFORE INSERT ON "members"
  FOR EACH ROW EXECUTE FUNCTION assign_member_number();
