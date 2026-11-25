# Supabase — PRESTINE database

This is a from-scratch schema. No data from any previous store or database is
carried over — every table starts empty except the small amount of starter
content (taxonomy, promo codes, email copy, hero banners, settings) a fresh
install needs so the admin panel and storefront are not blank on first run.

## What's here

```
supabase/
├── config.toml
└── migrations/
    ├── 00000000000001_schema.sql        tables, enums, indexes, constraints
    ├── 00000000000002_rls.sql           row level security policies
    ├── 00000000000003_functions.sql     transactional RPCs (order creation,
    │                                    status transitions, slug renames,
    │                                    race-safe review submission)
    ├── 00000000000004_seed.sql          starter taxonomy/promo/email/banner data
    └── 00000000000005_demo_products.sql four demo products with real photography,
                                          so the storefront isn't empty on first run
```

Run them in that order — the CLI does this automatically by filename.

## Running the migrations

Nothing here has been run against your project. You run it:

```bash
# One-time: log in and link this folder to your Supabase project.
npx supabase login
npx supabase link --project-ref <your-project-ref>

# Push every migration in supabase/migrations/ to the linked project.
npx supabase db push
```

Or, if you'd rather not install the CLI: open your project's SQL Editor in the
Supabase dashboard and paste each file's contents in, in filename order.

`<your-project-ref>` is the subdomain in `SUPABASE_URL` —
`https://<project-ref>.supabase.co`.

## After running the migrations

1. Create the storage bucket the app uploads product/banner images to. It
   must be named exactly what `SUPABASE_STORAGE_BUCKET` in `.env.local` says
   (`product-images` by default) and must be **public** — product photos are
   public, and making the bucket private would mean signing every URL, which
   breaks CDN caching and `next/image` for no security benefit.

   Dashboard → Storage → New bucket → name it, tick "Public bucket".

2. Start the app (`npm run dev`) and open `/admin/setup` to create the first
   owner account, exactly as before. Nothing about that flow changes — it now
   writes to the `admins` table instead of `data/store.json`.

3. `00000000000005_demo_products.sql` seeds four sample products (an overcoat,
   a cashmere crew, a pair of jeans, a belt) with real photography hosted on
   Unsplash, so the storefront and admin panel are not empty the first time
   you open them. This is demo content, not a fixture anything depends on —
   edit or delete any of it from Admin → Products whenever real products are
   ready to replace it.

## Design notes worth knowing before you touch this

- **RLS is a backstop, not the access control.** The app's server code always
  uses the service role key, which bypasses RLS. The actual authorization
  boundary is unchanged from before this migration: `requireAdmin` /
  `requirePermission` in `src/server/session.ts`, checked on every admin page
  and every mutation. The policies in `00000000000002_rls.sql` exist so that
  if the anon key is ever used for a direct browser read, it can only ever see
  what a storefront visitor should see (active products, live banners,
  non-hidden reviews, settings, promo codes, categories, non-hidden
  collections) and nothing else.

- **Login rate limiting stays in-process, deliberately.** It is not a table
  in this schema. `src/server/login-attempts.ts` keeps its `globalThis` Map
  as-is. The README's own "still missing" section already documents that this
  is weak on serverless (each instance keeps its own counter) — moving it to
  Postgres would add a write on every failed login attempt for a feature that
  is explicitly a soft speed bump, not the security boundary. If you want a
  real distributed limiter later, Upstash/Redis is the better fit than a
  Postgres table that gets a row inserted and swept for every keystroke on the
  login form.

- **No inventory columns exist anywhere**, on purpose — matching
  `ProductSize`'s own comment in the original `types.ts`: this shop does not
  track stock, every size is always purchasable, and fulfilment is manual.
  Don't add a stock/quantity column to `product_sizes` without re-reading why
  `place-order.test.ts` asserted the opposite of what you'd expect (five
  concurrent orders for one piece must all succeed).

- **Money is `integer` (minor units) everywhere**, never `numeric` or
  `float8`. `tax_rate` is the one fractional column in the whole schema
  (`numeric(6,4)`, e.g. `0.0800` for 8%) because it's a rate, not an amount.

- **`orders.ship_*` columns are flattened, not `jsonb`.** The admin order
  search (`queryOrders`) filters and searches on the shipping address today,
  which is far more natural as indexed columns than as jsonb path queries. The
  five legacy `Address` fields (`ship_first_name`, `ship_last_name`,
  `ship_line2`, `ship_postal_code`, `ship_country`) stay nullable exactly like
  they were optional in `types.ts` — nothing writes them anymore, but historical
  orders may still read them once real order data exists.
