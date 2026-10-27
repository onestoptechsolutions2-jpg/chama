CREATE TABLE "group_backup_receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"backup_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"downloaded_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"emailed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "group_backups" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"backup_date" date NOT NULL,
	"file_name" text NOT NULL,
	"content" "bytea" NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "group_backup_receipts" ADD CONSTRAINT "group_backup_receipts_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_backup_receipts" ADD CONSTRAINT "group_backup_receipts_backup_id_group_backups_id_fk" FOREIGN KEY ("backup_id") REFERENCES "public"."group_backups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_backup_receipts" ADD CONSTRAINT "group_backup_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_backups" ADD CONSTRAINT "group_backups_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "group_backup_receipts_backup_user_unique" ON "group_backup_receipts" USING btree ("backup_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "group_backups_group_date_unique" ON "group_backups" USING btree ("group_id","backup_date");--> statement-breakpoint
ALTER TABLE "group_backups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "group_backups" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "group_backups_tenant_isolation" ON "group_backups"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );--> statement-breakpoint
ALTER TABLE "group_backup_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "group_backup_receipts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "group_backup_receipts_tenant_isolation" ON "group_backup_receipts"
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );
