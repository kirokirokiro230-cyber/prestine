-- Row-level security for the customer-owned tables — defense in depth.
--
-- The application connects as `postgres`, which both owns these tables and has
-- `rolbypassrls`, so every query the server actions make is unaffected by anything
-- here: the app's authorization still lives where it always has, in the server
-- actions that filter by `customerId`. What this migration guards is the *other* way
-- in — the public anon key. That key is safe to ship to a browser only because RLS
-- decides what it can read, not because it is secret. Today nothing queries these
-- tables directly from the browser; this makes sure that if anything ever does, the
-- database refuses anonymous and cross-account access by default rather than trusting
-- a future caller to remember to filter.
--
-- Deliberately ENABLE, not FORCE. `FORCE ROW LEVEL SECURITY` would apply these policies
-- to the table owner too, i.e. to the app's own `postgres` connection, which would break
-- every server-action query. ENABLE leaves the owner and other bypass roles exempt and
-- applies the policies only to unprivileged roles — `anon` and `authenticated`, the roles
-- a Supabase client using the anon key acts as. That is exactly the boundary we want.
--
-- The link is `customers.auth_user_id` = the Supabase Auth identity, matched against
-- `auth.uid()` (the `sub` claim of the caller's JWT). `auth_user_id` lives only on
-- `customers`; orders, order lines and reviews reach it by joining back to the owning
-- customer row. `anon` is given no policy at all, so it is denied by default.

--> statement-breakpoint

-- customers -----------------------------------------------------------------
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- A signed-in identity may read and update only its own account row.
CREATE POLICY "customers_select_own" ON "customers"
  FOR SELECT TO authenticated
  USING ("auth_user_id" = (select auth.uid()));--> statement-breakpoint

CREATE POLICY "customers_update_own" ON "customers"
  FOR UPDATE TO authenticated
  USING ("auth_user_id" = (select auth.uid()))
  WITH CHECK ("auth_user_id" = (select auth.uid()));--> statement-breakpoint

-- orders --------------------------------------------------------------------
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- An order is visible to the identity that owns the customer it was placed under.
-- `customer_id` is nullable (guest/lapsed-session orders keep only an email), and a
-- null owner matches no identity — those rows stay invisible to every authenticated
-- caller, which is correct: an anonymous order is not any signed-in user's to read.
CREATE POLICY "orders_select_own" ON "orders"
  FOR SELECT TO authenticated
  USING (
    "customer_id" IN (
      SELECT "id" FROM "customers"
      WHERE "customers"."auth_user_id" = (select auth.uid())
    )
  );--> statement-breakpoint

-- order_lines ---------------------------------------------------------------
ALTER TABLE "order_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- A line is visible when its parent order is. Same join, one hop further out.
CREATE POLICY "order_lines_select_own" ON "order_lines"
  FOR SELECT TO authenticated
  USING (
    "order_id" IN (
      SELECT "orders"."id" FROM "orders"
      JOIN "customers" ON "customers"."id" = "orders"."customer_id"
      WHERE "customers"."auth_user_id" = (select auth.uid())
    )
  );--> statement-breakpoint

-- submitted_reviews ---------------------------------------------------------
ALTER TABLE "submitted_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- A review belongs to the customer who wrote it. `customer_id` is NOT NULL here, so
-- every row has a definite owner.
CREATE POLICY "submitted_reviews_select_own" ON "submitted_reviews"
  FOR SELECT TO authenticated
  USING (
    "customer_id" IN (
      SELECT "id" FROM "customers"
      WHERE "customers"."auth_user_id" = (select auth.uid())
    )
  );
