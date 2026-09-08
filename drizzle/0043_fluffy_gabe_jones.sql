CREATE TYPE "public"."compliance_obligation_status" AS ENUM('upcoming', 'due', 'overdue', 'completed');--> statement-breakpoint
CREATE TYPE "public"."compliance_obligation_type" AS ENUM('agm', 'annual_returns', 'custom');--> statement-breakpoint
CREATE TYPE "public"."group_document_category" AS ENUM('constitution', 'bank_details', 'registration_certificate', 'minutes', 'other');--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'welfare.request.submitted';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'welfare.request.approved';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'welfare.request.rejected';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'welfare.request.disbursed';--> statement-breakpoint
ALTER TYPE "public"."welfare_claim_type" ADD VALUE 'benevolence' BEFORE 'other';--> statement-breakpoint
ALTER TYPE "public"."welfare_claim_type" ADD VALUE 'wedding' BEFORE 'other';--> statement-breakpoint
ALTER TYPE "public"."welfare_claim_type" ADD VALUE 'calamity' BEFORE 'other';--> statement-breakpoint
CREATE TABLE "compliance_obligations" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"type" "compliance_obligation_type" DEFAULT 'custom' NOT NULL,
	"title" text NOT NULL,
	"due_date" date NOT NULL,
	"status" "compliance_obligation_status" DEFAULT 'upcoming' NOT NULL,
	"recurrence_months" integer,
	"completed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"title" text NOT NULL,
	"category" "group_document_category" DEFAULT 'other' NOT NULL,
	"file_url" text NOT NULL,
	"uploaded_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "compliance_obligations" ADD CONSTRAINT "compliance_obligations_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_documents" ADD CONSTRAINT "group_documents_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_documents" ADD CONSTRAINT "group_documents_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compliance_obligations_group_id_idx" ON "compliance_obligations" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "compliance_obligations_status_due_date_idx" ON "compliance_obligations" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "group_documents_group_id_idx" ON "group_documents" USING btree ("group_id");