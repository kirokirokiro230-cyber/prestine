-- PRESTINE — row level security for the shipping tables
--
-- ## The gap
--
-- `00000000000002_rls.sql` enables RLS on every table that existed when it was
-- written, and explains why: the app always talks to Postgres with the service
-- role key, which bypasses RLS, so these policies are a backstop against the
-- **anon** key — the one named `NEXT_PUBLIC_SUPABASE_ANON_KEY`, which Supabase's
-- model treats as public and which PostgREST accepts from anyone.
--
-- `00000000000008_shipping.sql` then created four tables and never enabled RLS
-- on them. That file revoked EXECUTE on its functions from `public`, so the
-- omission looks like an oversight in an otherwise careful migration rather than
-- a decision. The result, confirmed against the live project with the anon key
-- during a pre-production audit:
--
--   shipping_info      readable  (order ids, waybills, COD amounts, destinations)
--   shipping_scans     readable  (full courier scan history and raw payloads)
--   pickup_locations   readable  (warehouse name, address, phone)
--   returns            readable  (order ids and return reasons)
--
-- and all four were **writable**. An INSERT into `pickup_locations` succeeded
-- with a 201. That is the worst of the four: `getDefaultPickupLocation()` picks
-- the default row, so a row inserted by a stranger can decide where Delhivery is
-- told to collect parcels. An UPDATE to `shipping_info` is nearly as bad now that
-- the returns window is measured from `delivered_at` — writing that column closes
-- or reopens a customer's right to return.
--
-- Nothing in the application reads these tables with the anon key:
-- `src/server/repositories/shipping.ts` and `src/server/tracking-sync.ts` both use
-- the service role. So enabling RLS with no policies costs nothing and changes no
-- behaviour.
--
-- ## Why no policies
--
-- RLS enabled with zero policies means every role except the service role is
-- refused — the same default `00000000000002_rls.sql` relies on for `orders`,
-- `customers`, `admins` and `audit_log`. None of this is catalogue data a
-- storefront visitor needs, and a shopper's own tracking already reaches them
-- through a server action that checks the claim ticket. There is nothing to
-- selectively publish here, so nothing is.
--
-- Note for later: PostgREST answers a policy-less RLS table with `200 []` rather
-- than a 403, because an empty result is what the row filter honestly produces.
-- When verifying this migration, "readable with zero rows" is the pass, not a
-- partial failure — compare against `orders`, which has behaved that way all
-- along.

alter table pickup_locations enable row level security;
alter table shipping_info enable row level security;
alter table shipping_scans enable row level security;
alter table returns enable row level security;

comment on table pickup_locations is
  'Warehouses parcels are collected from. Service-role only: a row here can redirect a pickup, so it is never writable by the anon key. See migration 14.';

comment on table shipping_info is
  'One row per manifested shipment. Service-role only — delivered_at governs the returns window, so it must not be client-writable. See migration 14.';

comment on table shipping_scans is
  'Courier scan history, including raw payloads. Service-role only. See migration 14.';

comment on table returns is
  'Customer return requests. Service-role only; creation goes through createReturnRequest, which enforces the returns window. See migration 14.';
