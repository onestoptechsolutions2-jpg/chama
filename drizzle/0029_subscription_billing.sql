CREATE TYPE "public"."billing_cycle" AS ENUM('monthly', 'annual');--> statement-breakpoint
ALTER TYPE "public"."platform_payment_type" ADD VALUE 'loan_fee' BEFORE 'other';--> statement-breakpoint
CREATE TABLE "subscription_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"billing_cycle" "billing_cycle" DEFAULT 'monthly' NOT NULL,
	"member_count" integer NOT NULL,
	"member_fee" numeric(14, 2) NOT NULL,
	"vehicle_fee" numeric(14, 2) NOT NULL,
	"activity_fee" numeric(14, 2) NOT NULL,
	"activity_flow" numeric(14, 2) NOT NULL,
	"total_amount" numeric(14, 2) NOT NULL,
	"status" "platform_payment_status" DEFAULT 'pending' NOT NULL,
	"payment_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_payments" ADD COLUMN "loan_id" integer;--> statement-breakpoint
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_payment_id_platform_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."platform_payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_payments" ADD CONSTRAINT "platform_payments_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE set null ON UPDATE no action;