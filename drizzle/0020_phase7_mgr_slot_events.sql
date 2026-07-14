CREATE TABLE "mgr_slot_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"slot_id" integer NOT NULL,
	"actor_user_id" integer,
	"actor_role" "membership_role",
	"action" text NOT NULL,
	"from_status" "mgr_slot_status",
	"to_status" "mgr_slot_status",
	"from_member_id" integer,
	"to_member_id" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mgr_slots" ADD COLUMN "payout_reference" text;--> statement-breakpoint
ALTER TABLE "mgr_slot_events" ADD CONSTRAINT "mgr_slot_events_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mgr_slot_events" ADD CONSTRAINT "mgr_slot_events_slot_id_mgr_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."mgr_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mgr_slot_events" ADD CONSTRAINT "mgr_slot_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mgr_slot_events" ADD CONSTRAINT "mgr_slot_events_from_member_id_members_id_fk" FOREIGN KEY ("from_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mgr_slot_events" ADD CONSTRAINT "mgr_slot_events_to_member_id_members_id_fk" FOREIGN KEY ("to_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;