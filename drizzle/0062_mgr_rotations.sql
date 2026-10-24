CREATE TABLE "mgr_rotations" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"number" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"frequency" "mgr_frequency" NOT NULL,
	"recipients_per_cycle" integer DEFAULT 1 NOT NULL,
	"contribution_amount" numeric(12, 2) NOT NULL,
	"choices_close_date" date,
	"cycle_offset" integer DEFAULT 0 NOT NULL,
	"total_cycles" integer DEFAULT 0 NOT NULL,
	"total_slots" integer DEFAULT 0 NOT NULL,
	"payout_per_slot" numeric(12, 2),
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	CONSTRAINT "mgr_rotations_group_number_unique" UNIQUE("group_id","number")
);
--> statement-breakpoint
ALTER TABLE "mgr_cycles" ADD COLUMN "rotation_id" integer;--> statement-breakpoint
ALTER TABLE "mgr_slots" ADD COLUMN "rotation_id" integer;--> statement-breakpoint
ALTER TABLE "mgr_rotations" ADD CONSTRAINT "mgr_rotations_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mgr_rotations" ADD CONSTRAINT "mgr_rotations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mgr_rotations_one_active_idx" ON "mgr_rotations" USING btree ("group_id") WHERE "mgr_rotations"."status" = 'active';--> statement-breakpoint
ALTER TABLE "mgr_cycles" ADD CONSTRAINT "mgr_cycles_rotation_id_mgr_rotations_id_fk" FOREIGN KEY ("rotation_id") REFERENCES "public"."mgr_rotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mgr_slots" ADD CONSTRAINT "mgr_slots_rotation_id_mgr_rotations_id_fk" FOREIGN KEY ("rotation_id") REFERENCES "public"."mgr_rotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Backfill. Before this migration a rotation was implicit: archived cycles
-- had status 'closed' and the live rotation was every other cycle. Earlier
-- archived rotations can't be told apart, so they become one archived
-- rotation (number 1); the live cycles become the next rotation.
INSERT INTO "mgr_rotations" ("group_id", "number", "status", "start_date", "end_date", "frequency", "recipients_per_cycle",
  "contribution_amount", "cycle_offset", "total_cycles", "total_slots", "completed_at", "archived_at")
SELECT c.group_id, 1, 'archived',
  coalesce(min(c.scheduled_date), min(c.created_at)::date), coalesce(max(c.scheduled_date), max(c.created_at)::date),
  g.mgr_frequency, coalesce(g.mgr_recipients_per_cycle, 1), coalesce(g.mgr_contribution_amount, g.share_price, 0),
  0, count(*), coalesce(sum(c.slot_count), 0), max(c.updated_at), max(c.updated_at)
FROM "mgr_cycles" c JOIN "groups" g ON g.id = c.group_id
WHERE c.status = 'closed'
GROUP BY c.group_id, g.mgr_frequency, g.mgr_recipients_per_cycle, g.mgr_contribution_amount, g.share_price;--> statement-breakpoint
INSERT INTO "mgr_rotations" ("group_id", "number", "status", "start_date", "end_date", "frequency", "recipients_per_cycle",
  "contribution_amount", "choices_close_date", "cycle_offset", "total_cycles", "total_slots", "completed_at", "archived_at")
SELECT c.group_id,
  CASE WHEN EXISTS (SELECT 1 FROM "mgr_cycles" x WHERE x.group_id = c.group_id AND x.status = 'closed') THEN 2 ELSE 1 END,
  CASE WHEN bool_or(c.status IN ('planned', 'active')) THEN 'active' ELSE 'archived' END,
  coalesce(min(c.scheduled_date), g.mgr_start_date, current_date), coalesce(max(c.scheduled_date), g.mgr_start_date, current_date),
  g.mgr_frequency, coalesce(g.mgr_recipients_per_cycle, 1), coalesce(g.mgr_contribution_amount, g.share_price, 0),
  g.mgr_choices_close_date,
  coalesce((SELECT max(x.cycle_number) FROM "mgr_cycles" x WHERE x.group_id = c.group_id AND x.status = 'closed'), 0),
  count(*), coalesce(sum(c.slot_count), 0),
  CASE WHEN bool_or(c.status IN ('planned', 'active')) THEN NULL ELSE max(c.updated_at) END,
  CASE WHEN bool_or(c.status IN ('planned', 'active')) THEN NULL ELSE max(c.updated_at) END
FROM "mgr_cycles" c JOIN "groups" g ON g.id = c.group_id
WHERE c.status <> 'closed'
GROUP BY c.group_id, g.mgr_frequency, g.mgr_recipients_per_cycle, g.mgr_contribution_amount, g.share_price, g.mgr_start_date, g.mgr_choices_close_date;--> statement-breakpoint
UPDATE "mgr_cycles" c SET "rotation_id" = r.id
FROM "mgr_rotations" r
WHERE r.group_id = c.group_id
  AND r.number = CASE WHEN c.status = 'closed' THEN 1
                      WHEN EXISTS (SELECT 1 FROM "mgr_cycles" x WHERE x.group_id = c.group_id AND x.status = 'closed') THEN 2
                      ELSE 1 END;--> statement-breakpoint
UPDATE "mgr_cycles" SET "status" = 'completed' WHERE "status" = 'closed';--> statement-breakpoint
UPDATE "mgr_slots" s SET "rotation_id" = c.rotation_id
FROM "mgr_cycles" c
WHERE c.group_id = s.group_id AND c.cycle_number = s.cycle_number;--> statement-breakpoint
-- A slot whose cycle row is gone (cycle_id was set null) joins the rotation its number falls in.
UPDATE "mgr_slots" s SET "rotation_id" = (
  SELECT r.id FROM "mgr_rotations" r
  WHERE r.group_id = s.group_id AND r.cycle_offset < s.cycle_number
  ORDER BY r.cycle_offset DESC LIMIT 1)
WHERE s.rotation_id IS NULL;--> statement-breakpoint
-- Rotation totals and dates from the slots actually there.
UPDATE "mgr_rotations" r SET "total_slots" = (SELECT count(*) FROM "mgr_slots" s WHERE s.rotation_id = r.id),
  "payout_per_slot" = (SELECT max(c.payout_per_slot) FROM "mgr_cycles" c WHERE c.rotation_id = r.id);--> statement-breakpoint
-- Anything still unplaced (a slot in a group with no cycle rows at all) goes
-- into its own archived rotation, so no slot or its history is ever lost.
INSERT INTO "mgr_rotations" ("group_id", "number", "status", "start_date", "end_date", "frequency", "recipients_per_cycle",
  "contribution_amount", "total_slots", "archived_at")
SELECT s.group_id, coalesce((SELECT max(r.number) FROM "mgr_rotations" r WHERE r.group_id = s.group_id), 0) + 1, 'archived',
  coalesce(min(s.scheduled_date), min(s.created_at)::date), coalesce(max(s.scheduled_date), max(s.created_at)::date),
  g.mgr_frequency, coalesce(g.mgr_recipients_per_cycle, 1), coalesce(g.mgr_contribution_amount, g.share_price, 0), count(*), now()
FROM "mgr_slots" s JOIN "groups" g ON g.id = s.group_id
WHERE s.rotation_id IS NULL
GROUP BY s.group_id, g.mgr_frequency, g.mgr_recipients_per_cycle, g.mgr_contribution_amount, g.share_price;--> statement-breakpoint
UPDATE "mgr_slots" s SET "rotation_id" = (
  SELECT r.id FROM "mgr_rotations" r WHERE r.group_id = s.group_id ORDER BY r.number DESC LIMIT 1)
WHERE s.rotation_id IS NULL;--> statement-breakpoint
ALTER TABLE "mgr_cycles" ALTER COLUMN "rotation_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "mgr_slots" ALTER COLUMN "rotation_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "mgr_cycles_rotation_idx" ON "mgr_cycles" USING btree ("rotation_id");--> statement-breakpoint
CREATE INDEX "mgr_slots_rotation_idx" ON "mgr_slots" USING btree ("rotation_id");--> statement-breakpoint
ALTER TABLE "mgr_rotations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mgr_rotations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "mgr_rotations_tenant_isolation" ON "mgr_rotations"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );
