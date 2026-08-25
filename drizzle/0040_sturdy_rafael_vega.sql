-- Hand-trimmed: drizzle-kit's generated diff also re-proposed
-- group_account_activities/platform_user_audit_logs and groups' contact/
-- onboarding columns as new — those already exist in the live database
-- (migrations 0037/0038), the local snapshot chain just hadn't recorded
-- them. This migration's own snapshot (0040_snapshot.json) is a correct,
-- complete picture of the current schema going forward; only the SQL file
-- needed trimming down to what's actually new. Same precedent as the
-- drizzle-kit rename-disambiguation workaround noted in Phase 5
-- (docs/architecture.md) — hand-adjust the tool's output rather than let
-- an inaccurate diff re-run DDL that would collide with existing objects.
ALTER TABLE "groups" ADD COLUMN "min_personal_savings_increment" numeric(14, 2) DEFAULT '500' NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "loan_max_concurrent_guarantees" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "min_loan_amount" numeric(14, 2) DEFAULT '1000' NOT NULL;
