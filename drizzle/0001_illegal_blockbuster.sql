ALTER TABLE "products" ADD COLUMN "show_on_home" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "marquee_items" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "home_new_arrivals_count" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "service_promises" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "shipping_returns_copy" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
/*
 * Backfill the copy that used to be hardcoded in components.
 *
 * The columns above default to empty, which is correct for a fresh install seeded by
 * `db:seed` — but an existing store already has its single settings row, and
 * `onConflictDoNothing` in the seed means it would never be topped up. Without this the
 * upgrade silently blanks the marquee, the footer service promises and the product-page
 * shipping tab, because those surfaces now read from settings.
 *
 * Guarded on emptiness in every case, so re-running or applying after a manual edit
 * cannot overwrite a merchant's own wording.
 */
UPDATE "settings" SET "marquee_items" = ARRAY[
  'Italian double-faced wool',
  'Grade-A Mongolian cashmere',
  'Okayama selvedge denim',
  'European flax linen',
  'Northampton bridle leather',
  'GOTS organic cotton'
] WHERE cardinality("marquee_items") = 0;--> statement-breakpoint

UPDATE "settings" SET "service_promises" = '[
  {"title":"Complimentary shipping","body":"On all orders over $200, carbon-neutral by default."},
  {"title":"30-day returns","body":"Collected from your door, refunded within three working days."},
  {"title":"Repairs for life","body":"Free repairs on every piece we make, for as long as you own it."}
]'::jsonb WHERE jsonb_array_length("service_promises") = 0;--> statement-breakpoint

UPDATE "settings" SET "shipping_returns_copy" = ARRAY[
  'Standard delivery is complimentary on orders over $200 and arrives in 3-5 business days, tracked and carbon-neutral. Express and nominated-day options are offered at checkout.',
  'Returns are free within 30 days. Book a collection from your door in your account, or use any drop-off point. Refunds are issued within three working days of the parcel reaching us.'
] WHERE cardinality("shipping_returns_copy") = 0;
