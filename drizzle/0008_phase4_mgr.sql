CREATE TYPE "public"."mgr_cycle_status" AS ENUM('planned', 'active', 'completed', 'closed');--> statement-breakpoint
CREATE TYPE "public"."mgr_frequency" AS ENUM('weekly', 'biweekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."mgr_slot_status" AS ENUM('open', 'claimed', 'auto_assigned', 'paid', 'skipped');--> statement-breakpoint
CREATE TABLE "mgr_agreements" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"cycle_id" integer NOT NULL,
	"platform_terms" boolean DEFAULT false NOT NULL,
	"group_terms" boolean DEFAULT false NOT NULL,
	"financial_acknowledged" boolean DEFAULT false NOT NULL,
	"digital_signature" text NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mgr_agreements_user_cycle_unique" UNIQUE("user_id","cycle_id")
);
--> statement-breakpoint
CREATE TABLE "mgr_cycles" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"cycle_number" integer NOT NULL,
	"status" "mgr_cycle_status" DEFAULT 'planned' NOT NULL,
	"scheduled_date" date,
	"slot_count" integer DEFAULT 1 NOT NULL,
	"payout_per_slot" numeric(12, 2),
	"total_contributions" numeric(12, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mgr_cycles_group_cycle_unique" UNIQUE("group_id","cycle_number")
);
--> statement-breakpoint
CREATE TABLE "mgr_member_turns" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	"turns_total" integer DEFAULT 1 NOT NULL,
	"contribution_multiplier" numeric(5, 2) DEFAULT '1.0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mgr_member_turns_group_member_unique" UNIQUE("group_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "mgr_slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"cycle_id" integer,
	"cycle_number" integer NOT NULL,
	"slot_number" integer NOT NULL,
	"member_id" integer,
	"status" "mgr_slot_status" DEFAULT 'open' NOT NULL,
	"payout_amount" numeric(12, 2),
	"scheduled_date" date,
	"claimed_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mgr_slots_group_cycle_slot_unique" UNIQUE("group_id","cycle_number","slot_number")
);
--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "mgr_frequency" SET DEFAULT 'monthly'::"public"."mgr_frequency";--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "mgr_frequency" SET DATA TYPE "public"."mgr_frequency" USING "mgr_frequency"::"public"."mgr_frequency";--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "mgr_frequency" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "mgr_agreements" ADD CONSTRAINT "mgr_agreements_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mgr_agreements" ADD CONSTRAINT "mgr_agreements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mgr_agreements" ADD CONSTRAINT "mgr_agreements_cycle_id_mgr_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."mgr_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mgr_cycles" ADD CONSTRAINT "mgr_cycles_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mgr_member_turns" ADD CONSTRAINT "mgr_member_turns_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mgr_member_turns" ADD CONSTRAINT "mgr_member_turns_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mgr_slots" ADD CONSTRAINT "mgr_slots_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mgr_slots" ADD CONSTRAINT "mgr_slots_cycle_id_mgr_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."mgr_cycles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mgr_slots" ADD CONSTRAINT "mgr_slots_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;