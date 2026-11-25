-- PRESTINE — row level security
--
-- The app's server code always uses the Supabase **service role** key
-- (src/server/supabase.ts), which bypasses RLS entirely — so RLS here is a
-- defence-in-depth backstop against the anon key, not the primary access
-- control. The primary access control stays exactly where the README says it
-- is today: `requireAdmin` / `requirePermission` in src/server/session.ts,
-- checked on every server action and page. RLS does not replace that.
--
-- The anon key (NEXT_PUBLIC_SUPABASE_ANON_KEY) is not currently used by any
-- client component to talk to Supabase directly — every read the browser makes
-- goes through a Next.js server action or route handler. These policies are
-- written on the assumption that stays true: they permit just enough
-- public/anon read access that a future direct-from-browser catalogue read
-- would be safe, and they permit nothing else.
--
-- Every table gets RLS enabled. Tables with no policy default to "no access",
-- which is the correct default for anything not explicitly listed below.

alter table categories enable row level security;
alter table collections enable row level security;
alter table products enable row level security;
alter table product_collections enable row level security;
alter table product_pairings enable row level security;
alter table product_colors enable row level security;
alter table product_sizes enable row level security;
alter table banners enable row level security;
alter table promo_codes enable row level security;
alter table settings enable row level security;
alter table admins enable row level security;
alter table customers enable row level security;
alter table phone_verifications enable row level security;
alter table orders enable row level security;
alter table order_lines enable row level security;
alter table order_notes enable row level security;
alter table submitted_reviews enable row level security;
alter table hidden_reviews enable row level security;
alter table audit_log enable row level security;
alter table email_templates enable row level security;
alter table email_log enable row level security;

-- ---------------------------------------------------------------------------
-- Public read: catalogue data a storefront visitor is meant to see
-- ---------------------------------------------------------------------------

-- Categories and collections are navigation structure, not secret.
create policy "categories are publicly readable"
  on categories for select
  to anon, authenticated
  using (true);

create policy "non-hidden collections are publicly readable"
  on collections for select
  to anon, authenticated
  using (hidden = false);

-- Only active products, mirroring listActiveProducts() in the current
-- repository layer. Draft and archived rows never satisfy this policy, so
-- even a direct anon-key query cannot see them — the same guarantee
-- lib/catalog.ts gives today by construction rather than by a filter callers
-- must remember.
create policy "active products are publicly readable"
  on products for select
  to anon, authenticated
  using (status = 'active');

create policy "colours of active products are publicly readable"
  on product_colors for select
  to anon, authenticated
  using (
    exists (
      select 1 from products
      where products.id = product_colors.product_id
        and products.status = 'active'
    )
  );

create policy "sizes of active products are publicly readable"
  on product_sizes for select
  to anon, authenticated
  using (
    exists (
      select 1 from products
      where products.id = product_sizes.product_id
        and products.status = 'active'
    )
  );

create policy "collection tags of active products are publicly readable"
  on product_collections for select
  to anon, authenticated
  using (
    exists (
      select 1 from products
      where products.id = product_collections.product_id
        and products.status = 'active'
    )
  );

create policy "pairings of active products are publicly readable"
  on product_pairings for select
  to anon, authenticated
  using (
    exists (
      select 1 from products
      where products.id = product_pairings.product_id
        and products.status = 'active'
    )
    and exists (
      select 1 from products
      where products.id = product_pairings.paired_with_id
        and products.status = 'active'
    )
  );

-- Live banners only — mirrors listLiveBanners()'s active + schedule window
-- check from lib/banners.ts. An inactive or not-yet-started/expired slide
-- must not be readable by anon even though the admin table needs to see it.
create policy "live banners are publicly readable"
  on banners for select
  to anon, authenticated
  using (
    active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  );

-- Settings power currency/tax/shipping display everywhere on the storefront —
-- there is nothing secret in this row (no keys, no credentials).
create policy "settings are publicly readable"
  on settings for select
  to anon, authenticated
  using (true);

-- A promo code's existence is not secret — the checkout form has to be able
-- to validate one. What is not exposed here is promo *usage*, which stays
-- service-role only via promoUsage().
create policy "promo codes are publicly readable"
  on promo_codes for select
  to anon, authenticated
  using (true);

-- Published, non-hidden reviews. Presence in hidden_reviews suppresses a
-- review from anon/authenticated read without deleting the row, exactly like
-- setReviewHidden() does today.
create policy "non-hidden reviews are publicly readable"
  on submitted_reviews for select
  to anon, authenticated
  using (
    not exists (
      select 1 from hidden_reviews
      where hidden_reviews.review_id = submitted_reviews.id
    )
  );

-- ---------------------------------------------------------------------------
-- Everything else: service role only
-- ---------------------------------------------------------------------------
--
-- No policy is created for: admins, customers, phone_verifications, orders,
-- order_lines, order_notes, audit_log, email_templates, email_log,
-- hidden_reviews. RLS-enabled with zero policies means every role except the
-- service role (which bypasses RLS) is refused by default — intentional. Order
-- lookup, account data, credentials, the audit trail and the email log are
-- exactly the tables the README's threat model treats as sensitive; they are
-- read and written exclusively through server actions using the service role
-- key, never directly from the browser.
--
-- If a future feature needs an authenticated customer to read their own
-- orders directly via the anon key (bypassing the current claim-ticket
-- lookup-by-reference-and-email pattern in app/actions/orders.ts), add a
-- scoped policy then — e.g. `using (customer_id = auth.uid())` — once
-- Supabase Auth is actually issuing that customer's session. Today it is not:
-- customer sessions are the app's own HMAC-signed cookie
-- (src/server/customer-session.ts), not a Supabase Auth session, so
-- `auth.uid()` has nothing to compare against yet.
