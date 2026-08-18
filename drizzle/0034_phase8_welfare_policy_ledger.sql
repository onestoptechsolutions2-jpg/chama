CREATE TYPE "public"."notification_category" AS ENUM('info', 'success', 'warning', 'action_required');--> statement-breakpoint
CREATE TYPE "public"."welfare_advance_status" AS ENUM('active', 'paid', 'overdue', 'defaulted', 'written_off');--> statement-breakpoint
CREATE TYPE "public"."welfare_approval_status" AS ENUM('pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."welfare_funding_method" AS ENUM('fixed_amount', 'pct_collections', 'pct_contribution', 'manual');--> statement-breakpoint
CREATE TYPE "public"."welfare_ledger_entry_type" AS ENUM('allocation_in', 'grant_out', 'advance_out', 'repayment_in', 'reversal', 'adjustment_in', 'adjustment_out');--> statement-breakpoint
CREATE TYPE "public"."welfare_request_status" AS ENUM('pending', 'under_review', 'approved', 'rejected', 'disbursed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."welfare_reserve" AS ENUM('emergency', 'long_term', 'advance');--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"category" "notification_category" DEFAULT 'info' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"source_type" text,
	"source_id" integer,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "welfare_advance_repayments" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"advance_id" integer NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"reference" text,
	"notes" text,
	"recorded_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "welfare_advances" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"request_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	"principal" numeric(14, 2) NOT NULL,
	"fee_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"fee_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_repayable" numeric(14, 2) NOT NULL,
	"amount_remaining" numeric(14, 2) NOT NULL,
	"status" "welfare_advance_status" DEFAULT 'active' NOT NULL,
	"issued_date" date DEFAULT now() NOT NULL,
	"due_date" date NOT NULL,
	"cleared_date" date,
	"disbursed_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "welfare_advances_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "welfare_approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"request_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	"role" "membership_role" NOT NULL,
	"status" "welfare_approval_status" DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"comment" text,
	CONSTRAINT "welfare_approvals_request_member_unique" UNIQUE("request_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "welfare_funds" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"emergency_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"long_term_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"advance_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"lifetime_collected" numeric(14, 2) DEFAULT '0' NOT NULL,
	"lifetime_grants_disbursed" numeric(14, 2) DEFAULT '0' NOT NULL,
	"lifetime_advances_disbursed" numeric(14, 2) DEFAULT '0' NOT NULL,
	"lifetime_recovered" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "welfare_funds_group_id_unique" UNIQUE("group_id")
);
--> statement-breakpoint
CREATE TABLE "welfare_grants" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"request_id" integer NOT NULL,
	"emergency_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"long_term_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"disbursed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disbursed_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "welfare_grants_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "welfare_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"reserve" "welfare_reserve" NOT NULL,
	"entry_type" "welfare_ledger_entry_type" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"balance_after" numeric(14, 2) NOT NULL,
	"related_request_id" integer,
	"related_advance_id" integer,
	"related_contribution_id" integer,
	"note" text,
	"recorded_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "welfare_policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"funding_method" "welfare_funding_method" DEFAULT 'manual' NOT NULL,
	"funding_fixed_amount" numeric(14, 2),
	"funding_pct" numeric(5, 2),
	"emergency_allocation_pct" numeric(5, 2) DEFAULT '50' NOT NULL,
	"long_term_allocation_pct" numeric(5, 2) DEFAULT '30' NOT NULL,
	"advance_allocation_pct" numeric(5, 2) DEFAULT '20' NOT NULL,
	"max_emergency_grant" numeric(14, 2) DEFAULT '20000' NOT NULL,
	"max_long_term_grant" numeric(14, 2) DEFAULT '50000' NOT NULL,
	"max_advance" numeric(14, 2) DEFAULT '30000' NOT NULL,
	"max_outstanding_advance_per_member" numeric(14, 2) DEFAULT '30000' NOT NULL,
	"min_emergency_reserve_floor" numeric(14, 2) DEFAULT '0' NOT NULL,
	"max_claims_per_member_per_year" integer DEFAULT 2 NOT NULL,
	"cooldown_days" integer DEFAULT 30 NOT NULL,
	"min_tenure_months" integer DEFAULT 0 NOT NULL,
	"advance_fee_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"advance_max_repayment_months" integer DEFAULT 6 NOT NULL,
	"tier1_max_amount" numeric(14, 2) DEFAULT '10000' NOT NULL,
	"tier2_max_amount" numeric(14, 2) DEFAULT '30000' NOT NULL,
	"allow_overdraft" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "welfare_policies_group_id_unique" UNIQUE("group_id")
);
--> statement-breakpoint
CREATE TABLE "welfare_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	"reason" "welfare_claim_type" DEFAULT 'other' NOT NULL,
	"beneficiary_name" text,
	"beneficiary_rel" text,
	"description" text,
	"requested_emergency_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"requested_long_term_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"requested_advance_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"approved_emergency_amount" numeric(14, 2),
	"approved_long_term_amount" numeric(14, 2),
	"approved_advance_amount" numeric(14, 2),
	"approval_tier" text DEFAULT 'tier1' NOT NULL,
	"status" "welfare_request_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"disbursed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_advance_repayments" ADD CONSTRAINT "welfare_advance_repayments_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_advance_repayments" ADD CONSTRAINT "welfare_advance_repayments_advance_id_welfare_advances_id_fk" FOREIGN KEY ("advance_id") REFERENCES "public"."welfare_advances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_advance_repayments" ADD CONSTRAINT "welfare_advance_repayments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_advances" ADD CONSTRAINT "welfare_advances_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_advances" ADD CONSTRAINT "welfare_advances_request_id_welfare_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."welfare_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_advances" ADD CONSTRAINT "welfare_advances_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_advances" ADD CONSTRAINT "welfare_advances_disbursed_by_users_id_fk" FOREIGN KEY ("disbursed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_approvals" ADD CONSTRAINT "welfare_approvals_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_approvals" ADD CONSTRAINT "welfare_approvals_request_id_welfare_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."welfare_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_approvals" ADD CONSTRAINT "welfare_approvals_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_funds" ADD CONSTRAINT "welfare_funds_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_grants" ADD CONSTRAINT "welfare_grants_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_grants" ADD CONSTRAINT "welfare_grants_request_id_welfare_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."welfare_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_grants" ADD CONSTRAINT "welfare_grants_disbursed_by_users_id_fk" FOREIGN KEY ("disbursed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_ledger" ADD CONSTRAINT "welfare_ledger_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_ledger" ADD CONSTRAINT "welfare_ledger_related_request_id_welfare_requests_id_fk" FOREIGN KEY ("related_request_id") REFERENCES "public"."welfare_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_ledger" ADD CONSTRAINT "welfare_ledger_related_advance_id_welfare_advances_id_fk" FOREIGN KEY ("related_advance_id") REFERENCES "public"."welfare_advances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_ledger" ADD CONSTRAINT "welfare_ledger_related_contribution_id_contributions_id_fk" FOREIGN KEY ("related_contribution_id") REFERENCES "public"."contributions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_ledger" ADD CONSTRAINT "welfare_ledger_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_policies" ADD CONSTRAINT "welfare_policies_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_requests" ADD CONSTRAINT "welfare_requests_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_requests" ADD CONSTRAINT "welfare_requests_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_requests" ADD CONSTRAINT "welfare_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_group_id_idx" ON "notifications" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "welfare_advance_repayments_group_id_idx" ON "welfare_advance_repayments" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "welfare_advance_repayments_advance_id_idx" ON "welfare_advance_repayments" USING btree ("advance_id");--> statement-breakpoint
CREATE INDEX "welfare_advances_group_id_idx" ON "welfare_advances" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "welfare_advances_member_id_idx" ON "welfare_advances" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "welfare_advances_status_due_date_idx" ON "welfare_advances" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "welfare_approvals_group_id_idx" ON "welfare_approvals" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "welfare_approvals_member_id_idx" ON "welfare_approvals" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "welfare_approvals_request_id_idx" ON "welfare_approvals" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "welfare_grants_group_id_idx" ON "welfare_grants" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "welfare_ledger_group_id_idx" ON "welfare_ledger" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "welfare_ledger_reserve_idx" ON "welfare_ledger" USING btree ("reserve");--> statement-breakpoint
CREATE INDEX "welfare_ledger_related_request_id_idx" ON "welfare_ledger" USING btree ("related_request_id");--> statement-breakpoint
CREATE INDEX "welfare_ledger_related_advance_id_idx" ON "welfare_ledger" USING btree ("related_advance_id");--> statement-breakpoint
CREATE INDEX "welfare_requests_group_id_idx" ON "welfare_requests" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "welfare_requests_member_id_idx" ON "welfare_requests" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "welfare_requests_status_idx" ON "welfare_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "welfare_requests_member_open_emergency_unique" ON "welfare_requests" USING btree ("member_id") WHERE "welfare_requests"."requested_emergency_amount" > 0 AND "welfare_requests"."status" IN ('pending', 'under_review');