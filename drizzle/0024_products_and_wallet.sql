CREATE TYPE "public"."wallet_transaction_type" AS ENUM('topup', 'fee_deduction', 'refund');--> statement-breakpoint
ALTER TYPE "public"."platform_payment_type" ADD VALUE 'wallet_topup' BEFORE 'other';--> statement-breakpoint
CREATE TABLE "group_wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_wallets_group_id_unique" UNIQUE("group_id")
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"type" "wallet_transaction_type" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"balance_after" numeric(14, 2) NOT NULL,
	"related_payment_id" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "loans_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "mgr_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "welfare_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "projects_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "group_wallets" ADD CONSTRAINT "group_wallets_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_related_payment_id_platform_payments_id_fk" FOREIGN KEY ("related_payment_id") REFERENCES "public"."platform_payments"("id") ON DELETE set null ON UPDATE no action;