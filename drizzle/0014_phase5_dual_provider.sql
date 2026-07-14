CREATE TYPE "public"."payment_provider" AS ENUM('intasend', 'umspay');--> statement-breakpoint
ALTER TABLE "platform_payments" ADD COLUMN "provider" "payment_provider" DEFAULT 'intasend' NOT NULL;