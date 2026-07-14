CREATE TYPE "public"."group_type" AS ENUM('chama', 'welfare', 'hybrid', 'selfhelp');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('admin', 'treasurer', 'secretary', 'member');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('pending', 'active', 'rejected', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."platform_role" AS ENUM('owner', 'support');--> statement-breakpoint
CREATE TABLE "group_memberships" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"group_id" integer NOT NULL,
	"role" "membership_role" DEFAULT 'member' NOT NULL,
	"status" "membership_status" DEFAULT 'pending' NOT NULL,
	"join_message" text,
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_memberships_user_group_unique" UNIQUE("user_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "group_type" NOT NULL,
	"registration_no" text,
	"description" text,
	"logo_url" text,
	"founded_date" date,
	"currency" text DEFAULT 'KES' NOT NULL,
	"meeting_day" text,
	"meeting_time" text DEFAULT '15:00',
	"meeting_venue" text,
	"is_public" boolean DEFAULT true NOT NULL,
	"require_approval" boolean DEFAULT true NOT NULL,
	"max_members" integer,
	"share_price" numeric(14, 2) DEFAULT '2000' NOT NULL,
	"shares_per_member" integer DEFAULT 1 NOT NULL,
	"contribution_day" integer DEFAULT 1 NOT NULL,
	"loan_interest_rate" numeric(5, 2) DEFAULT '20.00' NOT NULL,
	"loan_max_multiplier" numeric(5, 2) DEFAULT '3.00' NOT NULL,
	"loan_repayment_months" integer DEFAULT 6 NOT NULL,
	"loan_late_penalty" numeric(14, 2) DEFAULT '500' NOT NULL,
	"mgr_pool_amount" numeric(14, 2) DEFAULT '0',
	"mgr_member_count" integer DEFAULT 2,
	"mgr_frequency" text DEFAULT 'monthly',
	"mgr_cycle_day" integer DEFAULT 1,
	"mgr_recipients_per_cycle" integer DEFAULT 1,
	"mgr_start_date" date,
	"mgr_contribution_amount" numeric(12, 2),
	"mgr_fee_pct" numeric(5, 2) DEFAULT '5.00' NOT NULL,
	"mgr_terms" text,
	"fine_lateness" numeric(14, 2) DEFAULT '100' NOT NULL,
	"fine_absence" numeric(14, 2) DEFAULT '200' NOT NULL,
	"fine_rule_violation" numeric(14, 2) DEFAULT '500' NOT NULL,
	"platform_terms" text,
	"phone" text,
	"email" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"user_id" integer,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"id_number" text,
	"capital" numeric(14, 2) DEFAULT '0' NOT NULL,
	"security" numeric(14, 2) DEFAULT '0' NOT NULL,
	"personal_savings" numeric(14, 2) DEFAULT '0' NOT NULL,
	"welfare_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_fines" numeric(14, 2) DEFAULT '0' NOT NULL,
	"limit_reduced" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"joined_date" date DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"active_group_id" integer,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"id_number" text,
	"password_hash" text NOT NULL,
	"platform_role" "platform_role",
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_group_id_groups_id_fk" FOREIGN KEY ("active_group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;