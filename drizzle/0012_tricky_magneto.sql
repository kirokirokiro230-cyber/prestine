CREATE TABLE "whatsapp_log" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"to" text NOT NULL,
	"body" text NOT NULL,
	"event_key" text,
	"order_id" text,
	"status" text NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "whatsapp_review_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"order_id" text NOT NULL,
	"product_slug" text NOT NULL,
	"product_name" text NOT NULL,
	"stage" text NOT NULL,
	"rating" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "whatsapp_log_at_idx" ON "whatsapp_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "whatsapp_log_order_idx" ON "whatsapp_log" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "whatsapp_review_conversations_phone_idx" ON "whatsapp_review_conversations" USING btree ("phone");