CREATE TABLE "email_log" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"to" text NOT NULL,
	"subject" text NOT NULL,
	"template_key" text,
	"order_id" text,
	"status" text NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"subject" text NOT NULL,
	"heading" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "review_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "review_request_delay_days" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
CREATE INDEX "email_log_at_idx" ON "email_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "email_log_order_idx" ON "email_log" USING btree ("order_id");