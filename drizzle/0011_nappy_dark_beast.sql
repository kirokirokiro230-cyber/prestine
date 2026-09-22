CREATE TABLE "submitted_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"product_slug" text NOT NULL,
	"customer_id" text NOT NULL,
	"order_id" text NOT NULL,
	"author" text NOT NULL,
	"rating" integer NOT NULL,
	"fit" text NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_id" text;--> statement-breakpoint
CREATE INDEX "submitted_reviews_product_slug_idx" ON "submitted_reviews" USING btree ("product_slug");--> statement-breakpoint
CREATE INDEX "submitted_reviews_customer_id_idx" ON "submitted_reviews" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "orders_customer_id_idx" ON "orders" USING btree ("customer_id");
--> statement-breakpoint
-- Backfill: link existing orders to an account by matching the captured email. Guarded
-- so it only touches rows that have no customer yet and whose email resolves to exactly
-- one account. The seed uses onConflictDoNothing and will not top up an existing row, so
-- this UPDATE is how already-placed orders become eligible for the review prompt.
UPDATE "orders" AS o
SET "customer_id" = c."id"
FROM "customers" AS c
WHERE o."customer_id" IS NULL
  AND o."email" IS NOT NULL
  AND lower(o."email") = lower(c."email");
