ALTER TABLE "members" DROP CONSTRAINT "members_user_id_unique";--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_group_unique" UNIQUE("user_id","group_id");