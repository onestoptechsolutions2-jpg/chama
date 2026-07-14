CREATE TYPE "public"."kyc_id_type" AS ENUM('national_id', 'passport');--> statement-breakpoint
ALTER TABLE "group_memberships" ADD COLUMN "role_assigned_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD COLUMN "rules_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "registration_complete" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "id_type" "kyc_id_type";--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "id_document_url" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "photo_url" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "signature_url" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "kyc_completed_at" timestamp with time zone;