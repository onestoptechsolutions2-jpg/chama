CREATE TYPE "public"."project_status" AS ENUM('planning', 'active', 'on_hold', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."welfare_claim_status" AS ENUM('pending', 'under_review', 'approved', 'rejected', 'disbursed');--> statement-breakpoint
CREATE TYPE "public"."welfare_claim_type" AS ENUM('medical', 'bereavement', 'emergency', 'education', 'maternity', 'disability', 'other');--> statement-breakpoint
CREATE TABLE "project_contributions" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"reference" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"target_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"collected_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" "project_status" DEFAULT 'planning' NOT NULL,
	"start_date" date,
	"end_date" date,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "welfare_claims" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	"beneficiary_name" text,
	"beneficiary_rel" text,
	"claim_type" "welfare_claim_type" DEFAULT 'other' NOT NULL,
	"amount_requested" numeric(14, 2) NOT NULL,
	"amount_approved" numeric(14, 2),
	"status" "welfare_claim_status" DEFAULT 'pending' NOT NULL,
	"description" text,
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone,
	"disbursed_at" timestamp with time zone,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_contributions" ADD CONSTRAINT "project_contributions_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_contributions" ADD CONSTRAINT "project_contributions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_contributions" ADD CONSTRAINT "project_contributions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_claims" ADD CONSTRAINT "welfare_claims_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_claims" ADD CONSTRAINT "welfare_claims_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_claims" ADD CONSTRAINT "welfare_claims_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;