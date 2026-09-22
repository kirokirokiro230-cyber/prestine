import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  Address,
  AdminRole,
  AuditAction,
  Department,
  EmailTemplateKey,
  OrderNote,
  OrderSummary,
  OtpPurpose,
  ProductStatus,
  SilhouetteKey,
  SizeSystem,
} from "@/lib/types";

/**
 * Database schema.
 *
 * This replaces `data/store.json`. The domain types in `src/lib/types.ts` remain the
 * contract for everything above the server layer — these tables are how that contract
 * is persisted, and the repositories map between the two. Nothing outside
 * `src/server/` should import this file.
 *
 * ## Conventions, and why
 *
 * **Money is `integer`, in minor units.** The whole app already works this way, so
 * `numeric` would only invite floating-point drift back in at the boundary. A signed
 * 32-bit integer tops out around 21 million in major units, which is a safe ceiling
 * for a line total and for an order total alike.
 *
 * **Timestamps are `timestamptz`, not text.** The JSON store held ISO strings because
 * that is all JSON has. Postgres can order, filter and range-scan real timestamps, and
 * the reporting queries need that. The repositories convert at the edge so the domain
 * types keep their ISO strings.
 *
 * **Business keys are the primary keys where one already exists.** Categories,
 * collections, promo codes and shipping methods are identified by slug or code
 * throughout the app and in URLs; giving them surrogate ids would mean every lookup
 * carries a join for no benefit. Products and orders keep their generated string ids
 * because those are already stable and referenced externally.
 *
 * **Short arrays of scalars stay arrays.** `details`, `care`, `announcements` and the
 * per-colourway image list are ordered lists of strings that are only ever read and
 * written whole. A child table would add a join and an ordering column to model
 * something Postgres represents natively.
 *
 * **Snapshots stay `jsonb`.** An order's totals and address are a record of what was
 * agreed at the time. They must not change when a tax rate or an address format does,
 * and nothing queries inside them, so they are stored as written.
 */

/* ------------------------------------------------------------------ */
/* Taxonomy                                                            */
/* ------------------------------------------------------------------ */

export const categories = pgTable("categories", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  blurb: text("blurb").notNull().default(""),
  /** Category tile photography. Null falls back to generated artwork. */
  imageUrl: text("image_url"),
  /** Landscape recrop for the two double-width tiles. Null falls back to `image_url`. */
  imageUrlWide: text("image_url_wide"),
  /** Which silhouette the generated placeholder art draws for this category. */
  silhouette: text("silhouette").$type<SilhouetteKey>().notNull(),
  position: integer("position").notNull().default(0),
});

export const collections = pgTable("collections", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  blurb: text("blurb").notNull().default(""),
  description: text("description").notNull().default(""),
  position: integer("position").notNull().default(0),
  /** Hidden collections stay reachable by URL but leave the navigation. */
  hidden: boolean("hidden").notNull().default(false),
});

/* ------------------------------------------------------------------ */
/* Catalogue                                                           */
/* ------------------------------------------------------------------ */

export const products = pgTable(
  "products",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    tagline: text("tagline").notNull().default(""),
    department: text("department").$type<Department>().notNull(),

    /**
     * Deliberately *not* a foreign key to `categories`.
     *
     * Renaming a category slug rewrites the products that reference it — that is
     * existing behaviour in the taxonomy repository, and deleting a category in use is
     * already blocked there. A cascading constraint would either silently rewrite rows
     * or refuse the rename outright, both of which take that decision away from the
     * code that currently owns it and tests it.
     */
    category: text("category").notNull(),

    price: integer("price").notNull(),
    compareAtPrice: integer("compare_at_price"),
    sizeSystem: text("size_system").$type<SizeSystem>().notNull(),

    description: text("description").notNull().default(""),
    details: text("details").array().notNull().default(sql`'{}'::text[]`),
    composition: text("composition").notNull().default(""),
    care: text("care").array().notNull().default(sql`'{}'::text[]`),
    fitNote: text("fit_note").notNull().default(""),
    origin: text("origin").notNull().default(""),

    /**
     * Aggregates derived from reviews, stored rather than computed.
     *
     * Review prose is static content in the repo, not store data, so these cannot be
     * recomputed from the database — and a listing page sorting by rating must not
     * join or recalculate thirty products' worth of reviews to order a grid.
     */
    rating: real("rating").notNull().default(0),
    reviewCount: integer("review_count").notNull().default(0),

    releasedAt: timestamp("released_at", { withTimezone: true }).notNull(),
    popularity: integer("popularity").notNull().default(0),
    sustainable: boolean("sustainable").notNull().default(false),
    /** Hand-picks the product into the home page "New arrivals" section. */
    showOnHome: boolean("show_on_home").notNull().default(false),
    /** Slugs shown in "Pairs well with". Slugs, not ids: they are what the URLs use. */
    pairsWith: text("pairs_with").array().notNull().default(sql`'{}'::text[]`),

    /* ---- Owned by the admin panel ---------------------------------- */

    status: text("status").$type<ProductStatus>().notNull().default("active"),
    sku: text("sku"),
    /** Never exposed to the storefront; powers the margin column in reporting. */
    costPrice: integer("cost_price"),
    weightGrams: integer("weight_grams"),
    taxable: boolean("taxable").notNull().default(true),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The storefront resolves every product page by slug, so this is the hot lookup —
    // and a duplicate slug would make one of the two unreachable.
    uniqueIndex("products_slug_key").on(table.slug),
    // Listing pages filter on these two before anything else.
    index("products_status_category_idx").on(table.status, table.category),
    // "Newest" is the default sort on more than one listing page.
    index("products_released_at_idx").on(table.releasedAt),
  ],
);

/**
 * Colourways.
 *
 * A child table rather than `jsonb` because the swatch filter queries across
 * colourways — "show me everything available in bone" — and that has to be an index
 * lookup, not a scan through a JSON document per product.
 */
export const productColors = pgTable(
  "product_colors",
  {
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** Slug used in URLs and cart line ids. Unique per product, not globally. */
    colorId: text("color_id").notNull(),
    name: text("name").notNull(),
    /** Swatch fill. Also seeds the generated art direction. */
    hex: text("hex").notNull(),
    /**
     * Uploaded photography, in order: front, detail, back, on-figure. Empty means the
     * storefront falls back to generated art, so a product is never a broken image.
     */
    images: text("images").array().notNull().default(sql`'{}'::text[]`),
    position: integer("position").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.productId, table.colorId] }),
    index("product_colors_color_id_idx").on(table.colorId),
  ],
);

/**
 * The size run a product is offered in.
 *
 * Sizes are labels a customer chooses, nothing more — **there is no inventory in this
 * schema by design.** No stock column, no reservation, no sold-out state.
 *
 * That is a deliberate product decision, and it has a consequence worth stating where
 * someone will read it: every size is always purchasable, and the same piece can be
 * ordered any number of times. Fulfilment is manual. If inventory is ever wanted, it
 * belongs here as a `stock` column plus a conditional
 * `UPDATE … WHERE stock >= quantity` inside the checkout transaction — that is the only
 * shape that cannot oversell under concurrency.
 *
 * `position` exists because a size run is ordered — S, M, L, not alphabetical.
 */
export const productSizes = pgTable(
  "product_sizes",
  {
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** Display label, e.g. "M" or "32". */
    label: text("label").notNull(),
    position: integer("position").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.productId, table.label] })],
);

/**
 * Which collections a product belongs to.
 *
 * A real join table: collection landing pages read it in one direction and the product
 * page in the other, and both need an index.
 */
export const productCollections = pgTable(
  "product_collections",
  {
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /**
     * Cascades on delete, unlike `products.category`. A collection is a grouping, so
     * removing one should drop the memberships and leave the products alone — whereas
     * a product must always have exactly one category, which is why that side is
     * handled in code instead.
     */
    collectionSlug: text("collection_slug")
      .notNull()
      .references(() => collections.slug, { onDelete: "cascade", onUpdate: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.productId, table.collectionSlug] }),
    index("product_collections_collection_idx").on(table.collectionSlug),
  ],
);

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

export const orders = pgTable(
  "orders",
  {
    /** Merchant-facing reference, generated at checkout. */
    id: text("id").primaryKey(),
    placedAt: timestamp("placed_at", { withTimezone: true }).notNull().defaultNow(),
    status: text("status")
      .$type<"processing" | "shipped" | "delivered" | "cancelled">()
      .notNull()
      .default("processing"),

    /**
     * Snapshots. What was agreed, not what the current settings would produce — a
     * later change to the tax rate must not silently rewrite an old receipt.
     */
    totals: jsonb("totals").$type<OrderSummary>().notNull(),
    shippingAddress: jsonb("shipping_address").$type<Address>().notNull(),

    /**
     * The account that placed it, when checkout was authenticated. Nullable — guest and
     * legacy orders have none — and deliberately not a foreign key, so deleting a
     * customer never orphans or erases their order history.
     */
    customerId: text("customer_id"),
    email: text("email"),
    promoCode: text("promo_code"),
    /** Last four digits only. The full number never reaches this application. */
    cardLast4: text("card_last4"),

    trackingNumber: text("tracking_number"),
    carrier: text("carrier"),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    /** Customer-visible, unlike `notes`. See the field comment on `Order`. */
    cancellationReason: text("cancellation_reason"),
    /**
     * When the review-request email went out. Null means it is still owed.
     *
     * Doubles as the queue: the pending set is every delivered order where this is null
     * and `delivered_at` is older than the configured delay.
     */
    reviewRequestedAt: timestamp("review_requested_at", { withTimezone: true }),

    /** Internal, admin-only. Stripped before an order is returned to a customer. */
    notes: jsonb("notes").$type<OrderNote[]>().notNull().default(sql`'[]'::jsonb`),
  },
  (table) => [
    /**
     * A guest has no account: possession of the reference *and* the email is what
     * entitles them to read an order back. That lookup is `where id = ? and email = ?`,
     * and the email index is also what the customers list groups on.
     */
    index("orders_email_idx").on(table.email),
    // "This shopper's orders" — the review prompt and account history both range on it.
    index("orders_customer_id_idx").on(table.customerId),
    // The admin list is newest-first, and the dashboard ranges over this column.
    index("orders_placed_at_idx").on(table.placedAt),
    index("orders_status_idx").on(table.status),
  ],
);

/**
 * Order lines.
 *
 * Every display field is copied, not joined. A receipt has to render identically in a
 * year's time whether or not the product still exists, has been renamed, or has been
 * repriced. `productId` is kept alongside so reporting can attribute units sold to a
 * product, and it is nullable because a deleted product must not make the order
 * unreadable.
 */
export const orderLines = pgTable(
  "order_lines",
  {
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),

    productId: text("product_id"),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    colorId: text("color_id"),
    colorName: text("color_name").notNull(),
    colorHex: text("color_hex").notNull(),
    size: text("size").notNull(),
    quantity: integer("quantity").notNull(),
    unitPrice: integer("unit_price").notNull(),
    category: text("category").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.orderId, table.position] }),
    // Revenue by category, and units sold per product, both aggregate on these.
    index("order_lines_product_idx").on(table.productId),
    index("order_lines_category_idx").on(table.category),
  ],
);

/* ------------------------------------------------------------------ */
/* Merchandising                                                       */
/* ------------------------------------------------------------------ */

export const banners = pgTable(
  "banners",
  {
    id: text("id").primaryKey(),
    eyebrow: text("eyebrow"),
    heading: text("heading").notNull(),
    body: text("body"),
    ctaLabel: text("cta_label"),
    ctaHref: text("cta_href"),
    imageUrl: text("image_url"),
    /** Art-directed crops. Null falls back up the chain to `image_url`. */
    imageUrlMobile: text("image_url_mobile"),
    imageUrlTablet: text("image_url_tablet"),
    imageAlt: text("image_alt"),
    accentHex: text("accent_hex"),
    textTone: text("text_tone").$type<"light" | "dark">().notNull().default("light"),
    align: text("align").$type<"left" | "center">().notNull().default("left"),
    active: boolean("active").notNull().default(true),
    position: integer("position").notNull().default(0),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // The home page asks for live slides in order on every render.
  (table) => [index("banners_active_position_idx").on(table.active, table.position)],
);

export const promoCodes = pgTable("promo_codes", {
  /**
   * Stored upper-cased by the repository so lookups are exact.
   *
   * Case-insensitive matching via `lower(code)` would need a functional index and
   * would still let two codes differing only in case be created. Normalising on write
   * makes the primary key itself the uniqueness guarantee.
   */
  code: text("code").primaryKey(),
  percentOff: integer("percent_off"),
  amountOff: integer("amount_off"),
  minSubtotal: integer("min_subtotal"),
  description: text("description").notNull().default(""),
  /**
   * How many orders have used this code. Recorded when an order is written, and only
   * when the code actually reduced the total.
   */
  usageCount: integer("usage_count").notNull().default(0),
});

/*
 * There was a `shipping_methods` table here — three selectable options with their own
 * price and ETA. Dropped in migration 0003: the shop has one shipping arrangement, so
 * the shopper is told how long delivery takes rather than asked to choose. Cost comes
 * from `settings.free_shipping_threshold` / `standard_shipping_rate`, and the promise
 * from `settings.delivery_days_min` / `delivery_days_max`.
 */

/* ------------------------------------------------------------------ */
/* Settings, staff, moderation, audit                                  */
/* ------------------------------------------------------------------ */

/**
 * Store settings — exactly one row.
 *
 * The `id` column is pinned to `1` by a check constraint so a second row cannot exist.
 * A key/value table would be more flexible and much worse: every setting would lose
 * its type, and reading the settings would become a dozen lookups reassembled in code.
 */
export const settings = pgTable(
  "settings",
  {
    id: integer("id").primaryKey().default(1),

    name: text("name").notNull(),
    legalName: text("legal_name").notNull(),
    tagline: text("tagline").notNull().default(""),
    description: text("description").notNull().default(""),
    url: text("url").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull().default(""),
    address: text("address").notNull().default(""),

    currency: text("currency").notNull(),
    locale: text("locale").notNull(),

    freeShippingThreshold: integer("free_shipping_threshold").notNull(),
    standardShippingRate: integer("standard_shipping_rate").notNull(),
    /** Fractional, e.g. 0.08 for 8%. `real` because it is a rate, never money. */
    taxRate: real("tax_rate").notNull(),
    returnWindowDays: integer("return_window_days").notNull(),
    /** One shipping option, so this is the site-wide delivery promise in business days. */
    deliveryDaysMin: integer("delivery_days_min").notNull().default(3),
    deliveryDaysMax: integer("delivery_days_max").notNull().default(5),
    /** Days to wait after delivery before the review-request email becomes due. */
    reviewRequestDelayDays: integer("review_request_delay_days").notNull().default(5),

    social: jsonb("social")
      .$type<{ instagram: string; pinterest: string; youtube: string }>()
      .notNull(),
    announcements: text("announcements").array().notNull().default(sql`'{}'::text[]`),
    marqueeItems: text("marquee_items").array().notNull().default(sql`'{}'::text[]`),
    homeNewArrivalsCount: integer("home_new_arrivals_count").notNull().default(4),
    /**
     * jsonb rather than two parallel text[] columns. The pairing of a title with its
     * body is the whole point; two arrays could fall out of step by one and render a
     * promise against the wrong sentence.
     */
    servicePromises: jsonb("service_promises")
      .$type<{ title: string; body: string }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    shippingReturnsCopy: text("shipping_returns_copy")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),

    maintenanceMode: boolean("maintenance_mode").notNull().default(false),
  },
  (table) => [
    /**
     * Enforces the single row in the database, not just by convention. Without it a
     * second settings row is a valid insert, and every read would then depend on which
     * one Postgres returned first.
     */
    check("settings_single_row", sql`${table.id} = 1`),
  ],
);

export const admins = pgTable(
  "admins",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role").$type<AdminRole>().notNull(),

    /**
     * A scrypt-derived key and its per-user salt, both hex. The password itself is
     * never stored, never logged and never leaves the browser in a recoverable form.
     */
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    disabled: boolean("disabled").notNull().default(false),
  },
  (table) => [
    /**
     * Email is the login identifier, so a duplicate is not a cosmetic problem — it
     * makes authentication ambiguous. Lower-cased on write by the repository, which is
     * what makes a plain unique index sufficient.
     */
    uniqueIndex("admins_email_key").on(table.email),
  ],
);

/* ------------------------------------------------------------------ */
/* Customer accounts                                                   */
/* ------------------------------------------------------------------ */

/**
 * Shopper accounts.
 *
 * A separate table from `admins`, not a shared one with a nullable role. The two are
 * authenticated by different identifiers, live behind different cookies and answer
 * different questions, and the only thing a merged table would save is a migration —
 * at the price of a schema in which a customer row is one UPDATE away from holding
 * staff permissions.
 *
 * `phone` is the login identifier, held in E.164. `email` is not: it is nullable, not
 * unique, and exists so a receipt has somewhere to go. Two family members sharing an
 * address is ordinary; two accounts on one mobile number is not.
 */
export const customers = pgTable(
  "customers",
  {
    id: text("id").primaryKey(),
    /** E.164, normalised by the repository before it ever reaches here. */
    phone: text("phone").notNull(),
    name: text("name").notNull(),
    email: text("email"),

    /**
     * A scrypt-derived key and its per-account salt, both hex — the same parameters
     * the admin table uses, from the same functions. The password itself is never
     * stored, never logged and never leaves the browser in a recoverable form.
     */
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),

    /**
     * When the signup code was confirmed. `notNull` because the row is not written
     * until it is — an account here has always proven it holds its number.
     */
    phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    disabled: boolean("disabled").notNull().default(false),
  },
  (table) => [
    /**
     * The number is the credential, so a duplicate does not merely look untidy — it
     * makes authentication ambiguous, and the loser of that ambiguity is a real person
     * whose orders are attached to the row that does not win the lookup. Normalised to
     * one E.164 spelling on write, which is what makes a plain unique index enough.
     */
    uniqueIndex("customers_phone_key").on(table.phone),
    // Receipts and support both start from an address rather than a number.
    index("customers_email_idx").on(table.email),
  ],
);

/**
 * Outstanding one-time codes.
 *
 * Not a foreign key to `customers`, deliberately and in both directions. A signup code
 * is issued before the account exists, and a reset code has to be issuable for a number
 * that turns out not to be registered at all — because a request that only succeeds for
 * real customers is a free membership oracle for anyone with a list of numbers.
 *
 * `codeHash` rather than the code. See the note on `PhoneVerification`: a six-digit
 * secret survives being written down only if it is hashed as slowly as a password.
 *
 * The `pending*` columns carry a signup's details until its code is confirmed, so an
 * unverified registration never occupies the phone number it is claiming.
 */
export const phoneVerifications = pgTable(
  "phone_verifications",
  {
    id: text("id").primaryKey(),
    phone: text("phone").notNull(),
    purpose: text("purpose").$type<OtpPurpose>().notNull(),
    /** Which system the code and its policy live on. See `PhoneVerification`. */
    provider: text("provider").$type<"local" | "twilio-verify">().notNull().default("local"),

    /** Null when `provider` is `twilio-verify` — there is no local hash to check. */
    codeHash: text("code_hash"),
    codeSalt: text("code_salt"),

    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Wrong guesses. The code is burned when this reaches the cap. */
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    pendingName: text("pending_name"),
    pendingPasswordHash: text("pending_password_hash"),
    pendingPasswordSalt: text("pending_password_salt"),
    pendingEmail: text("pending_email"),
  },
  (table) => [
    /**
     * Every read is "the live code for this number and this purpose", and there is only
     * ever one — issuing a code replaces its predecessor, so a shopper who taps resend
     * cannot be left holding two valid codes and wondering which one the SMS meant.
     */
    index("phone_verifications_phone_purpose_idx").on(table.phone, table.purpose),
    // Pruning expired codes is a range scan on this column.
    index("phone_verifications_expires_at_idx").on(table.expiresAt),
  ],
);

/** Reviews a moderator has hidden. Seeded editorial review prose is static in the repo. */
export const hiddenReviews = pgTable("hidden_reviews", {
  reviewId: text("review_id").primaryKey(),
  hiddenAt: timestamp("hidden_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Reviews real customers have written.
 *
 * Distinct from the seeded editorial reviews, which are generated from a product's slug
 * and never stored. A row here is always a verified purchase: it is only created from a
 * delivered order the reviewing account placed, and the storefront merges these with the
 * generated ones for display. Hiding one uses the same `hidden_reviews` set as the rest.
 *
 * `product_slug`, `customer_id` and `order_id` are plain text, not foreign keys: a review
 * has to outlive a discontinued product, a closed account or a purged order — losing the
 * prose because the thing it referenced went away is worse than a dangling reference.
 *
 * `reasons` is the set of preset phrases the shopper tapped, kept as jsonb because it is a
 * short list read and written whole and never queried by element.
 */
export const submittedReviews = pgTable(
  "submitted_reviews",
  {
    id: text("id").primaryKey(),
    productSlug: text("product_slug").notNull(),
    customerId: text("customer_id").notNull(),
    orderId: text("order_id").notNull(),
    author: text("author").notNull(),
    rating: integer("rating").$type<1 | 2 | 3 | 4 | 5>().notNull(),
    fit: text("fit").$type<"runs-small" | "true-to-size" | "runs-large">().notNull(),
    reasons: jsonb("reasons").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    body: text("body").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The product page reads "every review for this slug".
    index("submitted_reviews_product_slug_idx").on(table.productSlug),
    // The prompt reads "has this account already reviewed this order's item".
    index("submitted_reviews_customer_id_idx").on(table.customerId),
  ],
);

/* ------------------------------------------------------------------ */
/* Email                                                               */
/* ------------------------------------------------------------------ */

/**
 * Transactional email copy, one row per lifecycle event.
 *
 * The key is the primary key rather than a surrogate id: there is exactly one
 * confirmation email, and a table that permits two of them invites the question of which
 * one sends. Rows are seeded by the application, not by a migration, so adding an event
 * needs no data migration.
 *
 * Subject, heading and body are separate columns and hold plain text with `{{tokens}}`.
 * Storing rendered HTML instead would mean a merchant's edit could break the layout in
 * every mail client at once, and there would be no way to generate the plain-text
 * alternative that spam filters look for.
 */
export const emailTemplates = pgTable("email_templates", {
  key: text("key").$type<EmailTemplateKey>().primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  subject: text("subject").notNull(),
  heading: text("heading").notNull().default(""),
  body: text("body").notNull().default(""),
});

/**
 * Send attempts.
 *
 * Email fails quietly — a wrong address, a rejected domain, a provider outage all look
 * identical to a merchant watching nothing happen. This table is what makes those
 * distinguishable, so it records failures as deliberately as successes.
 *
 * `orderId` is nullable and *not* a foreign key: a one-off message has no order, and
 * deleting an order must not delete the evidence that a customer was emailed about it.
 * `templateKey` is likewise nullable for ad-hoc messages, and not a foreign key so that
 * retiring a template does not rewrite history.
 */
export const emailLog = pgTable(
  "email_log",
  {
    id: text("id").primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    to: text("to").notNull(),
    subject: text("subject").notNull(),
    templateKey: text("template_key").$type<EmailTemplateKey>(),
    orderId: text("order_id"),
    /** `logged` means recorded but not delivered — no provider was configured. */
    status: text("status").$type<"sent" | "failed" | "logged">().notNull(),
    error: text("error"),
  },
  (table) => [
    // The admin log is newest-first; the order detail page filters to one order.
    index("email_log_at_idx").on(table.at),
    index("email_log_order_idx").on(table.orderId),
  ],
);

/**
 * Audit log.
 *
 * On a store with more than one member of staff this is the difference between "the
 * price is wrong" and "the price was changed at 14:12 by this account".
 *
 * `actorId` is nullable and intentionally *not* a foreign key: a failed login has no
 * authenticated actor, and deleting a staff account must never erase what they did.
 * `actorEmail` is stored alongside so the record stays readable regardless.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorId: text("actor_id"),
    actorEmail: text("actor_email").notNull(),
    action: text("action").$type<AuditAction>().notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    summary: text("summary").notNull(),
  },
  (table) => [
    // The activity feed is newest-first; entity detail pages filter to one record.
    index("audit_log_at_idx").on(table.at),
    index("audit_log_entity_idx").on(table.entity, table.entityId),
  ],
);

/**
 * Failed sign-in attempts, for rate limiting.
 *
 * The JSON store counted these in memory, which works on one long-running process and
 * not at all on serverless: every invocation may be a fresh instance, so an attacker
 * gets five fresh attempts as often as the platform decides to scale. Persisting them
 * is what makes the limit real.
 */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: text("id").primaryKey(),
    /** Lower-cased email. Not a foreign key: attempts against unknown accounts count. */
    email: text("email").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("login_attempts_email_at_idx").on(table.email, table.at)],
);

/* ------------------------------------------------------------------ */
/* Relations                                                           */
/* ------------------------------------------------------------------ */

/**
 * Declared so a product and its colourways, sizes and collections can be fetched in
 * one round trip. That matters more here than it did with a JSON document: a listing
 * page assembling thirty products from four tables must not issue 120 queries.
 */
export const productsRelations = relations(products, ({ many }) => ({
  colors: many(productColors),
  sizes: many(productSizes),
  collections: many(productCollections),
}));

export const productColorsRelations = relations(productColors, ({ one }) => ({
  product: one(products, {
    fields: [productColors.productId],
    references: [products.id],
  }),
}));

export const productSizesRelations = relations(productSizes, ({ one }) => ({
  product: one(products, {
    fields: [productSizes.productId],
    references: [products.id],
  }),
}));

export const productCollectionsRelations = relations(productCollections, ({ one }) => ({
  product: one(products, {
    fields: [productCollections.productId],
    references: [products.id],
  }),
  collection: one(collections, {
    fields: [productCollections.collectionSlug],
    references: [collections.slug],
  }),
}));

export const ordersRelations = relations(orders, ({ many }) => ({
  lines: many(orderLines),
}));

export const orderLinesRelations = relations(orderLines, ({ one }) => ({
  order: one(orders, {
    fields: [orderLines.orderId],
    references: [orders.id],
  }),
}));
