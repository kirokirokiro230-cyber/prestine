-- PRESTINE — initial schema
--
-- Replaces the single-document JSON store (formerly data/store.json,
-- src/server/store.ts) with normalised Postgres tables. One migration file per
-- concern, run in filename order by `supabase db push` / `supabase migration up`.
--
-- Conventions used throughout:
--   - All money is an integer number of minor units (cents). Never numeric/float.
--   - All timestamps are `timestamptz`, defaulting to `now()` where the app
--     previously wrote `new Date().toISOString()`.
--   - Primary keys mirror the readable ids the app already generates
--     (e.g. "p-001", "ord_a1b2c3d4") rather than switching to uuid, so the
--     repository layer's id generation logic barely changes.
--   - `updated_at` columns are maintained by the `set_updated_at()` trigger
--     below rather than by application code, so no code path can update a row
--     and forget to bump it.

-- No pgcrypto/uuid extension needed: every primary key here is the readable,
-- app-generated text id the repository layer already produces (e.g. "p-001",
-- "ord_a1b2c3d4"), not a database-generated uuid.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Shared trigger function: stamps updated_at = now() on every UPDATE.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type department as enum ('women', 'men', 'unisex');
create type size_system as enum ('alpha', 'waist', 'one-size', 'shoe');
create type product_status as enum ('active', 'draft', 'archived');
create type silhouette_key as enum (
  'coat', 'sweater', 'shirt', 'tee', 'trouser', 'jean', 'dress',
  'accessory', 'belt', 'scarf', 'wallet', 'beanie', 'bag'
);
create type order_status as enum ('processing', 'shipped', 'delivered', 'cancelled');
create type admin_role as enum ('owner', 'manager', 'staff');
create type audit_action as enum (
  'create', 'update', 'delete', 'login', 'login:failed', 'logout', 'status'
);
create type email_template_key as enum (
  'order-confirmation', 'out-for-delivery', 'delivered', 'review-request', 'order-cancelled'
);
create type email_status as enum ('sent', 'failed', 'logged');
create type otp_purpose as enum ('signup', 'password-reset');
create type otp_provider as enum ('local', 'twilio-verify');
create type text_tone as enum ('light', 'dark');
create type banner_align as enum ('left', 'center');
create type fit_feedback as enum ('runs-small', 'true-to-size', 'runs-large');

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------

create table categories (
  slug text primary key,
  name text not null,
  blurb text not null default '',
  image_url text,
  image_url_wide text,
  silhouette silhouette_key not null default 'accessory',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger categories_set_updated_at
  before update on categories
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Collections
-- ---------------------------------------------------------------------------

create table collections (
  slug text primary key,
  name text not null,
  blurb text not null default '',
  description text not null default '',
  position integer not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger collections_set_updated_at
  before update on collections
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------

create table products (
  id text primary key,
  slug text not null unique,
  name text not null,
  tagline text not null default '',
  department department not null,
  category text not null references categories(slug) on update cascade on delete restrict,
  -- Current price in minor units.
  price integer not null check (price >= 0),
  -- Original price in minor units when marked down. Null when not on sale.
  compare_at_price integer check (compare_at_price is null or compare_at_price >= 0),
  size_system size_system not null default 'alpha',
  description text not null default '',
  -- Bulleted construction/spec notes.
  details text[] not null default '{}',
  composition text not null default '',
  care text[] not null default '{}',
  fit_note text not null default '',
  origin text not null default '',
  rating numeric(3, 2) not null default 0 check (rating >= 0 and rating <= 5),
  review_count integer not null default 0 check (review_count >= 0),
  -- Used for "newest" sorting and the New badge.
  released_at timestamptz not null default now(),
  -- Drives the "trending" sort and best-seller ranking.
  popularity integer not null default 0,
  sustainable boolean not null default false,
  -- Hand-picks this product into the home page "New arrivals" section.
  show_on_home boolean not null default false,
  status product_status not null default 'draft',
  sku text,
  -- Unit cost in minor units. Never exposed to the storefront.
  cost_price integer check (cost_price is null or cost_price >= 0),
  weight_grams integer check (weight_grams is null or weight_grams >= 0),
  taxable boolean not null default true,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_status_idx on products (status);
create index products_category_idx on products (category);
create index products_released_at_idx on products (released_at desc);
create index products_popularity_idx on products (popularity desc);
-- Case-insensitive search across name/tagline/sku, used by admin's queryProducts.
create index products_search_idx on products
  using gin (
    to_tsvector(
      'simple',
      coalesce(name, '') || ' ' || coalesce(tagline, '') || ' ' || coalesce(sku, '')
    )
  );

create trigger products_set_updated_at
  before update on products
  for each row execute function set_updated_at();

-- Product ↔ collection, many-to-many. Replaces Product.collections: string[].
create table product_collections (
  product_id text not null references products(id) on delete cascade,
  collection_slug text not null references collections(slug) on update cascade on delete cascade,
  primary key (product_id, collection_slug)
);

create index product_collections_collection_idx on product_collections (collection_slug);

-- Product ↔ product cross-sell ("Pairs well with"). Replaces Product.pairsWith: string[].
-- Self-referencing on product id; deleting either product removes the pairing rather
-- than leaving a dangling slug, which is what deleteProducts() used to clean up by hand.
create table product_pairings (
  product_id text not null references products(id) on delete cascade,
  paired_with_id text not null references products(id) on delete cascade,
  position integer not null default 0,
  primary key (product_id, paired_with_id),
  check (product_id <> paired_with_id)
);

-- A colourway. Replaces Product.colors: ProductColor[].
create table product_colors (
  id text not null,
  product_id text not null references products(id) on delete cascade,
  name text not null,
  hex text not null,
  -- [front, detail, back, on-figure]. Empty means "use generated art direction".
  images text[] not null default '{}',
  position integer not null default 0,
  primary key (product_id, id)
);

-- A size label. Replaces Product.sizes: ProductSize[]. No stock/inventory column —
-- this shop deliberately does not track inventory; every size is always purchasable.
create table product_sizes (
  product_id text not null references products(id) on delete cascade,
  label text not null,
  position integer not null default 0,
  primary key (product_id, label)
);

-- ---------------------------------------------------------------------------
-- Banners (home-page hero slides)
-- ---------------------------------------------------------------------------

create table banners (
  id text primary key,
  eyebrow text,
  heading text not null check (char_length(heading) <= 120),
  body text,
  cta_label text,
  cta_href text,
  image_url text,
  image_url_mobile text,
  image_url_tablet text,
  image_alt text,
  accent_hex text check (accent_hex is null or accent_hex ~ '^#[0-9a-fA-F]{6}$'),
  text_tone text_tone not null default 'light',
  align banner_align not null default 'left',
  active boolean not null default true,
  position integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Both or neither: a button with no destination is worse than no button.
  check ((cta_label is null) = (cta_href is null)),
  check (starts_at is null or ends_at is null or ends_at > starts_at)
);

create index banners_position_idx on banners (position);

create trigger banners_set_updated_at
  before update on banners
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Promo codes
-- ---------------------------------------------------------------------------

create table promo_codes (
  -- Always stored uppercased; the app's own normalisation, kept as a constraint
  -- so a direct SQL insert cannot silently create a code the app would never look up.
  code text primary key check (code = upper(code)),
  description text not null default '',
  percent_off integer check (percent_off is null or (percent_off between 1 and 100)),
  amount_off integer check (amount_off is null or amount_off > 0),
  min_subtotal integer check (min_subtotal is null or min_subtotal >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Exactly one of percent_off / amount_off, matching assertValid() in settings.ts.
  check (
    (percent_off is not null and amount_off is null) or
    (percent_off is null and amount_off is not null)
  )
);

create trigger promo_codes_set_updated_at
  before update on promo_codes
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Settings — single row
-- ---------------------------------------------------------------------------

-- One store, one settings row. Enforced with a check constraint on a constant
-- rather than trusting application code to never insert a second row.
create table settings (
  id boolean primary key default true check (id = true),
  name text not null default 'PRESTINE',
  legal_name text not null default '',
  tagline text not null default '',
  description text not null default '',
  url text not null default '',
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  currency text not null default 'USD',
  locale text not null default 'en-US',
  free_shipping_threshold integer not null default 20000 check (free_shipping_threshold >= 0),
  standard_shipping_rate integer not null default 900 check (standard_shipping_rate >= 0),
  -- Fractional rate, e.g. 0.08 for 8%.
  tax_rate numeric(6, 4) not null default 0.08 check (tax_rate >= 0 and tax_rate <= 1),
  return_window_days integer not null default 30 check (return_window_days >= 0),
  delivery_days_min integer not null default 3 check (delivery_days_min >= 0),
  delivery_days_max integer not null default 5 check (delivery_days_max >= delivery_days_min),
  review_request_delay_days integer not null default 5 check (review_request_delay_days >= 0),
  social_instagram text not null default '',
  social_pinterest text not null default '',
  social_youtube text not null default '',
  announcements text[] not null default '{}',
  marquee_items text[] not null default '{}',
  home_new_arrivals_count integer not null default 4 check (home_new_arrivals_count >= 0),
  -- Array of {title, body} — stored as jsonb since it's a small, order-preserving
  -- list of uniform records rather than something ever joined or filtered on.
  service_promises jsonb not null default '[]'::jsonb,
  shipping_returns_copy text[] not null default '{}',
  maintenance_mode boolean not null default false,
  updated_at timestamptz not null default now()
);

create trigger settings_set_updated_at
  before update on settings
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Admins (staff accounts)
-- ---------------------------------------------------------------------------

create table admins (
  id text primary key,
  email text not null unique,
  name text not null,
  role admin_role not null default 'staff',
  -- scrypt derived key, hex encoded. Never the password itself.
  password_hash text not null,
  password_salt text not null,
  disabled boolean not null default false,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

create index admins_email_idx on admins (lower(email));

-- ---------------------------------------------------------------------------
-- Customers (shopper accounts)
-- ---------------------------------------------------------------------------

create table customers (
  id text primary key,
  -- E.164. The login identifier.
  phone text not null unique,
  name text not null,
  -- For receipts. Not a credential, not unique, not required.
  email text,
  password_hash text not null,
  password_salt text not null,
  phone_verified_at timestamptz not null default now(),
  disabled boolean not null default false,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Phone verifications (OTP)
-- ---------------------------------------------------------------------------

create table phone_verifications (
  id text primary key,
  -- E.164, normalised. Not a foreign key: signup codes precede the account.
  phone text not null,
  purpose otp_purpose not null,
  provider otp_provider not null default 'local',
  -- scrypt derived key of the six-digit code, hex encoded. Absent for twilio-verify.
  code_hash text,
  code_salt text,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  -- Pending signup payload, held until the code is confirmed. Signup only.
  pending_name text,
  pending_password_hash text,
  pending_password_salt text,
  pending_email text
);

-- otp.ts always looks up "the live code for this phone + purpose", so this is the
-- one index that query actually needs; expired rows are swept on next issue rather
-- than by a scheduled job (see PhoneVerification's own design note in types.ts).
create index phone_verifications_lookup_idx on phone_verifications (phone, purpose, expires_at);

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------

create table orders (
  -- Human-readable reference: PR-YYMMDD-XXXX, generated by the application.
  id text primary key,
  placed_at timestamptz not null default now(),
  status order_status not null default 'processing',
  -- The account that placed it, when checkout was authenticated. Not a hard FK:
  -- deleting a customer must never make their order history unreadable.
  customer_id text references customers(id) on delete set null,
  -- Captured at checkout; absent on legacy orders.
  email text,
  promo_code text references promo_codes(code) on delete set null,
  -- Last four digits only — never the full number.
  card_last4 text check (card_last4 is null or card_last4 ~ '^\d{4}$'),

  -- Totals (OrderSummary), all minor units.
  subtotal integer not null check (subtotal >= 0),
  discount integer not null default 0 check (discount >= 0),
  shipping integer not null default 0 check (shipping >= 0),
  tax integer not null default 0 check (tax >= 0),
  total integer not null check (total >= 0),

  -- Shipping address. Current 5-field form, flattened as columns rather than
  -- jsonb so admin search (queryOrders) can filter/index them directly.
  ship_name text not null,
  ship_line1 text not null,
  ship_city text not null,
  ship_region text not null,
  ship_phone text not null,
  -- Legacy fields, written only by orders placed before the form was reduced.
  -- Kept nullable rather than migrated away — see Address's own comment in types.ts.
  ship_first_name text,
  ship_last_name text,
  ship_line2 text,
  ship_postal_code text,
  ship_country text,

  tracking_number text,
  carrier text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  -- Set on cancellation, never cleared once set — see repositories/orders.ts.
  cancellation_reason text,
  -- Idempotency guard for the review-request sweep.
  review_requested_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_status_idx on orders (status);
create index orders_placed_at_idx on orders (placed_at desc);
create index orders_customer_id_idx on orders (customer_id);
create index orders_email_idx on orders (lower(email));
-- Powers dueReviewRequests(): delivered, not yet requested, has an email.
create index orders_review_due_idx on orders (delivered_at)
  where status = 'delivered' and review_requested_at is null;

create trigger orders_set_updated_at
  before update on orders
  for each row execute function set_updated_at();

-- Order lines. Replaces Order.lines: OrderLine[].
create table order_lines (
  id bigint generated always as identity primary key,
  order_id text not null references orders(id) on delete cascade,
  -- Nullable: a deleted product must not make the order unreadable. Every field
  -- needed to render the line is copied alongside, not looked up live.
  product_id text references products(id) on delete set null,
  slug text not null,
  name text not null,
  color_id text,
  color_name text not null default '',
  color_hex text not null default '',
  size text not null,
  quantity integer not null check (quantity > 0),
  unit_price integer not null check (unit_price >= 0),
  category text not null,
  position integer not null default 0
);

create index order_lines_order_id_idx on order_lines (order_id);
create index order_lines_product_id_idx on order_lines (product_id);

-- Internal notes, admin-only. Replaces Order.notes: OrderNote[].
create table order_notes (
  id bigint generated always as identity primary key,
  order_id text not null references orders(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index order_notes_order_id_idx on order_notes (order_id);

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------

create table submitted_reviews (
  id text primary key,
  -- Not a hard FK: the slug is how the storefront joins, and a review must
  -- survive the product it was written for being deleted or archived.
  product_slug text not null,
  customer_id text not null references customers(id) on delete cascade,
  order_id text not null references orders(id) on delete cascade,
  -- Display name shown on the review, snapshotted so a later rename does not rewrite it.
  author text not null default 'Verified buyer',
  rating smallint not null check (rating between 1 and 5),
  fit fit_feedback not null default 'true-to-size',
  reasons text[] not null default '{}',
  body text not null default '',
  created_at timestamptz not null default now(),
  -- One review per account per product — enforced here, not just in application code.
  unique (customer_id, product_slug)
);

create index submitted_reviews_product_slug_idx on submitted_reviews (product_slug);

-- Moderator-hidden review ids. A set, so `hidden` is presence rather than a flag —
-- mirrors hiddenReviewIds: string[] exactly, which also covers seeded/editorial
-- review ids that have no row of their own in submitted_reviews.
create table hidden_reviews (
  review_id text primary key,
  hidden_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------

create table audit_log (
  id text primary key,
  at timestamptz not null default now(),
  -- Null for failed logins, where there is no authenticated actor.
  actor_id text,
  actor_email text not null,
  action audit_action not null,
  entity text not null,
  entity_id text not null,
  summary text not null default ''
);

create index audit_log_at_idx on audit_log (at desc);
create index audit_log_entity_idx on audit_log (entity, entity_id);

-- ---------------------------------------------------------------------------
-- Email templates + log
-- ---------------------------------------------------------------------------

create table email_templates (
  key email_template_key primary key,
  enabled boolean not null default true,
  subject text not null,
  heading text not null default '',
  body text not null default '',
  updated_at timestamptz not null default now()
);

create trigger email_templates_set_updated_at
  before update on email_templates
  for each row execute function set_updated_at();

create table email_log (
  id text primary key,
  at timestamptz not null default now(),
  "to" text not null,
  subject text not null,
  template_key email_template_key,
  order_id text references orders(id) on delete set null,
  status email_status not null,
  error text
);

create index email_log_at_idx on email_log (at desc);
create index email_log_order_id_idx on email_log (order_id);

-- ---------------------------------------------------------------------------
-- Comment summary for future readers
-- ---------------------------------------------------------------------------

comment on table settings is 'Single-row store settings. Always exactly one row (id = true).';
comment on column products.sku is 'Merchant stock reference. No inventory tracking exists anywhere in this schema by design.';
comment on column orders.cancellation_reason is 'Set once on cancellation, never cleared by application code even if a later write omits it.';
comment on table hidden_reviews is 'Presence in this table means a review is hidden from the storefront, whether or not a matching submitted_reviews row exists.';
