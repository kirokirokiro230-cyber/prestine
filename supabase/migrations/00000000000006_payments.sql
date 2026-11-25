-- PRESTINE — payments (Cashfree)
--
-- Adds the columns and transactional functions needed to take real payment through
-- Cashfree without weakening the trust boundary `placeOrder` already enforces: an
-- order is now created in a `pending` payment state *before* the shopper is sent to
-- Cashfree's hosted checkout, and is only ever moved to `paid` by the webhook (or, as
-- a fallback, by re-querying Cashfree's Orders API) — never by anything the browser
-- asserts on its own. See src/server/cashfree.ts and
-- src/app/api/payments/cashfree/webhook/route.ts for the code that calls these.
--
-- `orders.status` (processing/shipped/delivered/cancelled) already describes
-- fulfilment. Payment is a separate lifecycle running alongside it — an order can sit
-- in fulfilment status 'processing' while its payment status moves pending → paid, or
-- pending → failed — so it gets its own enum and its own column rather than being
-- folded into `order_status`.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type payment_status as enum ('pending', 'paid', 'failed');
  end if;
end
$$;

alter table orders
  add column if not exists payment_status payment_status not null default 'pending',
  -- Always 'cashfree' today. Kept as a column rather than assumed so a second
  -- provider (or a manual/offline order) never needs a schema change to record.
  add column if not exists payment_provider text,
  -- Cashfree's own order id (`order_id` in their API — this app's order id is passed
  -- as-is, so today these are equal, but the column exists independently in case a
  -- retried payment session ever needs a distinct Cashfree-side id from the same
  -- Prestine order).
  add column if not exists cashfree_order_id text,
  -- The `payment_session_id` returned by Create Order, used to (re)launch the hosted
  -- checkout. Not sensitive — it is handed to the browser deliberately — but nothing
  -- outside checkout needs it, so it is not exposed by `assembleOrder()`.
  add column if not exists cashfree_payment_session_id text,
  -- Cashfree's payment id (`cf_payment_id`) for the transaction that actually paid
  -- the order, once one exists. Absent for a pending or failed order.
  add column if not exists cashfree_payment_id text,
  add column if not exists paid_at timestamptz;

-- Powers the reconciliation sweep: orders left `pending` past their checkout session
-- window (Cashfree sessions expire; see order_meta in cashfree.ts) with no webhook
-- yet received.
create index if not exists orders_payment_status_idx on orders (payment_status);
create unique index if not exists orders_cashfree_order_id_idx on orders (cashfree_order_id)
  where cashfree_order_id is not null;

comment on column orders.payment_status is
  'Cashfree payment lifecycle, independent of fulfilment status. Moved to paid only by the webhook or a server-side reconciliation fetch, never by the browser.';
comment on column orders.cashfree_payment_session_id is
  'payment_session_id from Cashfree''s Create Order response. Used to (re)launch hosted checkout; not sensitive but not customer-facing either.';

-- ---------------------------------------------------------------------------
-- create_order_with_lines: extended to record the pending payment session
-- ---------------------------------------------------------------------------
--
-- Replaces the version in 00000000000003_functions.sql with one that also writes
-- the Cashfree order id and payment session id in the same insert, so an order is
-- never briefly recorded with a total but no way to resume payment. `payment_status`
-- is always 'pending' here — nothing calls this function after payment succeeds; see
-- mark_order_paid below for that transition.
--
-- `create or replace function` only replaces a function whose argument list matches
-- exactly. The three new parameters below give this a different signature from the
-- original in 00000000000003_functions.sql, so without the explicit `drop` first,
-- Postgres would keep both as overloads — and every call site in the app calls this
-- by name with named/positional arguments that match both, which is exactly the
-- "function name is not unique" ambiguity error this drop avoids.
drop function if exists create_order_with_lines(
  text, timestamptz, text, text, text, text,
  integer, integer, integer, integer, integer,
  text, text, text, text, text, jsonb
);

create or replace function create_order_with_lines(
  p_id text,
  p_placed_at timestamptz,
  p_customer_id text,
  p_email text,
  p_promo_code text,
  p_card_last4 text,
  p_subtotal integer,
  p_discount integer,
  p_shipping integer,
  p_tax integer,
  p_total integer,
  p_ship_name text,
  p_ship_line1 text,
  p_ship_city text,
  p_ship_region text,
  p_ship_phone text,
  p_lines jsonb,
  p_payment_provider text default null,
  p_cashfree_order_id text default null,
  p_cashfree_payment_session_id text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line jsonb;
  v_position integer := 0;
begin
  insert into orders (
    id, placed_at, status, customer_id, email, promo_code, card_last4,
    subtotal, discount, shipping, tax, total,
    ship_name, ship_line1, ship_city, ship_region, ship_phone,
    payment_status, payment_provider, cashfree_order_id, cashfree_payment_session_id
  ) values (
    p_id, p_placed_at, 'processing', p_customer_id, p_email, p_promo_code, p_card_last4,
    p_subtotal, p_discount, p_shipping, p_tax, p_total,
    p_ship_name, p_ship_line1, p_ship_city, p_ship_region, p_ship_phone,
    'pending', p_payment_provider, p_cashfree_order_id, p_cashfree_payment_session_id
  );

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    insert into order_lines (
      order_id, product_id, slug, name, color_id, color_name, color_hex,
      size, quantity, unit_price, category, position
    ) values (
      p_id,
      v_line->>'productId',
      v_line->>'slug',
      v_line->>'name',
      v_line->>'colorId',
      coalesce(v_line->>'colorName', ''),
      coalesce(v_line->>'colorHex', ''),
      v_line->>'size',
      (v_line->>'quantity')::integer,
      (v_line->>'unitPrice')::integer,
      v_line->>'category',
      v_position
    );
    v_position := v_position + 1;
  end loop;

  return p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- mark_order_paid: the only path that moves payment_status to 'paid'
-- ---------------------------------------------------------------------------
--
-- Idempotent by design: Cashfree retries a webhook delivery that does not return 2xx,
-- and the same event can also arrive twice in the ordinary course of things. Calling
-- this twice for the same order must not double-fire whatever the caller does with a
-- freshly-true return value (send one confirmation email, not two) — the `returning`
-- clause only produces a row on the update that actually flips pending -> paid; a
-- second call finds `payment_status` already 'paid', updates zero rows, and the
-- caller gets back an empty result, which is its signal to skip the email.
create or replace function mark_order_paid(
  p_order_id text,
  p_cashfree_payment_id text,
  p_paid_at timestamptz default now()
)
returns orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders;
begin
  update orders set
    payment_status = 'paid',
    payment_provider = coalesce(payment_provider, 'cashfree'),
    cashfree_payment_id = p_cashfree_payment_id,
    paid_at = p_paid_at
  where id = p_order_id and payment_status <> 'paid'
  returning * into v_order;

  return v_order;
end;
$$;

-- Mirrors mark_order_paid's shape for the failure side: recorded so a shopper who
-- abandons or fails a payment attempt is visible in admin (and can be retried)
-- rather than sitting in 'pending' with no distinction from "webhook hasn't arrived
-- yet". Does not touch a payment already marked 'paid' — a late-arriving 'failed'
-- webhook for a since-retried, successfully paid order must never revert it.
create or replace function mark_order_payment_failed(
  p_order_id text
)
returns orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders;
begin
  update orders set
    payment_status = 'failed'
  where id = p_order_id and payment_status = 'pending'
  returning * into v_order;

  return v_order;
end;
$$;

-- Explicit argument lists throughout: with the drop above this migration never
-- leaves two overloads in place at once, but naming the signature here is cheap
-- insurance against the same "not unique" ambiguity error if a future migration
-- ever adds a differently-defaulted overload again.
revoke execute on function create_order_with_lines(
  text, timestamptz, text, text, text, text,
  integer, integer, integer, integer, integer,
  text, text, text, text, text, jsonb, text, text, text
) from public;
revoke execute on function mark_order_paid(text, text, timestamptz) from public;
revoke execute on function mark_order_payment_failed(text) from public;

grant execute on function create_order_with_lines(
  text, timestamptz, text, text, text, text,
  integer, integer, integer, integer, integer,
  text, text, text, text, text, jsonb, text, text, text
) to service_role;
grant execute on function mark_order_paid(text, text, timestamptz) to service_role;
grant execute on function mark_order_payment_failed(text) to service_role;
