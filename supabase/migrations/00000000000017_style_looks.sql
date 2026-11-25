-- PRESTINE — style hints ("looks")
--
-- A look is a styling photograph with the products worn in it. On a product page the
-- shopper sees the looks that include that product, and opening one lists every piece in
-- it. The merchant uploads the photo in Admin → Style hints and ticks the products.
--
-- ## Two tables
--
-- `style_looks` is the photograph: a title, the image, whether it is published and where
-- it sits in the order. `style_look_products` links a look to its products. The link is a
-- table rather than an array column on the look so that the database enforces what an
-- array cannot — that each product exists, that a product appears once per look, and that
-- deleting a product removes it from every look instead of leaving a dangling id that the
-- storefront has to defend against.
--
-- ## Cascades, and why both directions
--
-- Deleting a look removes its links. Deleting a PRODUCT removes its links too, and the
-- look survives with its remaining products. A look left with no products is simply never
-- shown (the storefront only lists looks that contain the product being viewed), so there
-- is nothing to clean up by hand.
--
-- ## Access
--
-- Service role only. The photographs are public once published, but the storefront reads
-- them through the server like every other catalogue page, which lets it filter out
-- unpublished looks and draft products in one place. Granting `anon` a SELECT policy would
-- put that filtering in a second place that can drift. RLS is enabled AND the table
-- privileges are removed, because RLS alone is one control and migration 14 existed
-- because it is easy to forget on a new table.

create table if not exists style_looks (
  id text primary key,

  -- Shown under the photo and used as its description for screen readers.
  title text not null check (char_length(title) between 1 and 80),

  -- An uploaded image (Supabase Storage URL) or an absolute https URL. The application
  -- validates the shape; the column only insists that there is one.
  image_url text not null check (char_length(image_url) between 1 and 2000),

  active boolean not null default true,

  -- Display order. Not required to be contiguous: moving a look swaps two values, and
  -- deleting one simply leaves a gap, which sorting does not mind.
  position integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists style_looks_position_idx on style_looks (position, created_at);

create table if not exists style_look_products (
  look_id text not null references style_looks (id) on delete cascade,
  product_id text not null references products (id) on delete cascade,

  -- Order the pieces are listed in inside the look.
  position integer not null default 0,

  primary key (look_id, product_id)
);

-- "Which looks include this product?" is the storefront's question, asked on every
-- product page. The primary key leads with look_id, so it does not serve that lookup.
create index if not exists style_look_products_product_idx
  on style_look_products (product_id);

alter table style_looks enable row level security;
alter table style_look_products enable row level security;

revoke all on table style_looks, style_look_products from anon, authenticated;

comment on table style_looks is
  'Styling photographs shown on product pages. Service-role only; the storefront filters to published looks server-side. See migration 17.';
comment on table style_look_products is
  'Products worn in a look. Cascades from both the look and the product.';
