-- PRESTINE — stop the public anon key executing database functions
--
-- ## What was wrong
--
-- Every function in this schema is `security definer`, which means it runs with its
-- owner's rights and ignores row-level security. That is deliberate: the app calls
-- them with the service role key, from server code that has already checked who is
-- asking. Each migration therefore wrote
--
--     revoke execute on function ... from public;
--     grant  execute on function ... to service_role;
--
-- and that revoke does not do what it appears to. On Supabase, `anon` and
-- `authenticated` are granted EXECUTE on new functions directly, by the default
-- privileges the platform sets up for the `public` schema — a grant to the role
-- itself, which a revoke from the pseudo-role `public` leaves untouched.
--
-- Verified against the live project during a pre-production audit, calling each
-- function through PostgREST with only the public anon key and ids that cannot exist:
--
--   mark_order_paid                    callable   <- marks any order paid, no payment
--   mark_order_payment_failed          callable
--   mark_cod_order_collected           callable
--   update_order_status                callable   <- ships or delivers any order
--   cancel_order_as_customer           callable   <- cancels any order, no email check
--   increment_verification_attempts    callable   <- burns anyone's signup code
--   update_shipment_status             callable
--   shipments_awaiting_tracking        callable   <- returned a real order id and waybill
--   rate_limit_hits_in_window          callable
--   clear_rate_limit_hits              callable   <- resets the admin brute-force limiter
--
-- The anon key is not secret by design. It is the one named NEXT_PUBLIC_SUPABASE_ANON_KEY
-- in .env.local, and it ships in any page that ever uses the Supabase browser client.
-- Holding it was enough to bypass Cashfree entirely and mark an order paid.
--
-- ## The fix
--
-- Revoke from `anon`, `authenticated` and `public` on every function in the schema,
-- by looping `pg_proc` rather than naming them, so a function added by a migration
-- nobody remembered is covered, and so every overload is covered. `service_role` is
-- left alone: it is what the application uses.
--
-- Then change the default privileges so functions created from now on do not repeat
-- this. Without that, the next migration to add a function reopens the hole, which is
-- precisely how this one arose.
--
-- Trigger functions (`guard_last_owner`) are included. Postgres checks EXECUTE on a
-- trigger function when the trigger is created, not when it fires, so revoking it
-- cannot stop the trigger working.

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      -- Functions installed by extensions are not ours to alter.
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      fn.signature
    );
    execute format(
      'grant execute on function %s to service_role',
      fn.signature
    );
  end loop;
end
$$;

-- Future functions. `for role postgres` because that is the role the migrations run
-- as in the SQL editor; Supabase's own platform role is covered by the second form.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tables: do not rely on RLS alone
-- ---------------------------------------------------------------------------
--
-- RLS with no policy already returns zero rows to anon, but it is a single control,
-- and migration 8 showed it is easy to forget on a new table. Removing the table
-- privileges from anon on everything that is not meant to be public makes the
-- default "no access" rather than "no access, provided RLS was remembered".
--
-- The catalogue tables keep their anon SELECT: `00000000000002_rls.sql` publishes
-- active products, live banners, settings and so on on purpose, behind policies.

revoke all on table
  admins,
  customers,
  phone_verifications,
  orders,
  order_lines,
  order_notes,
  audit_log,
  email_templates,
  email_log,
  hidden_reviews,
  pickup_locations,
  shipping_info,
  shipping_scans,
  returns,
  rate_limit_hits
from anon, authenticated;
