CREATE TYPE "public"."loan_guarantor_status" AS ENUM('pending', 'accepted', 'declined', 'released');--> statement-breakpoint
CREATE TABLE "loan_guarantors" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"application_id" integer,
	"loan_id" integer,
	"member_id" integer NOT NULL,
	"status" "loan_guarantor_status" DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "loan_guarantors_application_member_unique" UNIQUE("application_id","member_id")
);
--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "loan_min_guarantors" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "loan_guarantors" ADD CONSTRAINT "loan_guarantors_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_guarantors" ADD CONSTRAINT "loan_guarantors_application_id_loan_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."loan_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_guarantors" ADD CONSTRAINT "loan_guarantors_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_guarantors" ADD CONSTRAINT "loan_guarantors_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "loan_guarantors_group_id_idx" ON "loan_guarantors" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "loan_guarantors_member_id_idx" ON "loan_guarantors" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "loan_guarantors_loan_id_idx" ON "loan_guarantors" USING btree ("loan_id");