ALTER TABLE "contributions" ADD COLUMN "mgr_rotation_id" integer;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "mgr_require_up_to_date" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_mgr_rotation_id_mgr_rotations_id_fk" FOREIGN KEY ("mgr_rotation_id") REFERENCES "public"."mgr_rotations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contributions_mgr_rotation_idx" ON "contributions" USING btree ("mgr_rotation_id","member_id");--> statement-breakpoint
-- Existing MGR contributions made since the live rotation began (allowing
-- one period before its first payout, when members pay in) count towards it.
UPDATE "contributions" c SET "mgr_rotation_id" = r.id
FROM "mgr_rotations" r
WHERE c.type = 'mgr' AND c.mgr_rotation_id IS NULL AND r.group_id = c.group_id AND r.status = 'active'
  AND c.created_at::date >= r.start_date - CASE r.frequency WHEN 'weekly' THEN 7 WHEN 'biweekly' THEN 14 ELSE 31 END;
