CREATE TYPE "public"."contribution_due_status" AS ENUM('pending', 'paid', 'overdue', 'waived');--> statement-breakpoint
CREATE TABLE "contribution_dues" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	"due_date" date NOT NULL,
	"amount_due" numeric(14, 2) NOT NULL,
	"amount_paid" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" "contribution_due_status" DEFAULT 'pending' NOT NULL,
	"fine_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contribution_dues_group_member_date_unique" UNIQUE("group_id","member_id","due_date")
);
--> statement-breakpoint
ALTER TABLE "contribution_dues" ADD CONSTRAINT "contribution_dues_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution_dues" ADD CONSTRAINT "contribution_dues_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution_dues" ADD CONSTRAINT "contribution_dues_fine_id_fines_id_fk" FOREIGN KEY ("fine_id") REFERENCES "public"."fines"("id") ON DELETE set null ON UPDATE no action;