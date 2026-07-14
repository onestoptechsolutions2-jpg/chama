CREATE TYPE "public"."platform_payment_status" AS ENUM('pending', 'paid', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."platform_payment_type" AS ENUM('mgr_fee', 'subscription', 'other');--> statement-breakpoint
CREATE TABLE "cron_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_name" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"rows_affected" integer,
	"status" text DEFAULT 'running' NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "payment_webhook_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'intasend' NOT NULL,
	"invoice_id" text,
	"payload" jsonb NOT NULL,
	"challenge_valid" boolean NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"mgr_slot_id" integer,
	"amount" numeric(14, 2) NOT NULL,
	"fee_pct" numeric(5, 2) DEFAULT '5.00' NOT NULL,
	"phone" text,
	"invoice_id" text,
	"mpesa_reference" text,
	"status" "platform_payment_status" DEFAULT 'pending' NOT NULL,
	"type" "platform_payment_type" DEFAULT 'mgr_fee' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_payments" ADD CONSTRAINT "platform_payments_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_payments" ADD CONSTRAINT "platform_payments_mgr_slot_id_mgr_slots_id_fk" FOREIGN KEY ("mgr_slot_id") REFERENCES "public"."mgr_slots"("id") ON DELETE set null ON UPDATE no action;