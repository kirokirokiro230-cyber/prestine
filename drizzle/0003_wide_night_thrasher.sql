ALTER TABLE "settings" ADD COLUMN "delivery_days_min" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "delivery_days_max" integer DEFAULT 5 NOT NULL;