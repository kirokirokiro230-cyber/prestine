-- PRESTINE — cash on delivery
--
-- ## Why an explicit payment method
--
-- Until now the Delhivery layer inferred it: `build-shipment.ts` read
-- `order.paymentStatus === 'paid' ? 'Prepaid' : 'COD'`. That was unreachable in
-- practice because manifesting only happened inside the paid webhook branch, but
-- it is a dangerous inference — any order manifested while not yet paid would
-- have shipped as COD for its full total, asking the customer to pay a second
-- time at the door. The method a shopper chose is a fact about the order, so it
-- is stored rather than derived.
--
-- ## Why a COD order stays `pending`
--
-- `payment_status` describes whether money has arrived, and for a COD order it
-- has not until the courier hands it over. So a COD order is written `pending`
-- like any other and moves to `paid` when the tracking sweep sees it delivered.
-- That keeps "paid" meaning the same thing for both methods, which matters for
-- revenue reporting.

-- ---------------------------------------------------------------------------
-- Order-level payment method and COD fee
-- ---------------------------------------------------------------------------

alter table orders
  add column if not exists payment_method text not null default 'prepaid',
  -- Minor units. Charged to the customer, separate from `shipping` so a refund
  -- or a margin report can tell the two apart.
  add column if not exists cod_fee integer not null default 0 check (cod_fee >= 0);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_payment_method_check'
  ) then
    alter table orders
      add constraint orders_payment_method_check
      check (payment_method in ('prepaid', 'cod'));
  end if;
end
$$;

create index if not exists orders_payment_method_idx on orders (payment_method);

comment on column orders.payment_method is
  'How the shopper chose to pay. ''cod'' orders are written payment_status=''pending'' and move to ''paid'' when the courier reports delivery.';
comment on column orders.cod_fee is
  'COD handling fee charged to the customer, in minor units. Zero for prepaid orders and for COD when the merchant absorbs it.';

-- ---------------------------------------------------------------------------
-- COD configuration, on settings
-- ---------------------------------------------------------------------------
--
-- Off by default. Turning COD on is a commercial decision with real costs
-- (Delhivery charges max(Rs 40, 2% of the collected amount) plus GST, and a
-- refused parcel costs forward and return freight with no revenue), so it is
-- never on because nobody looked.

alter table settings
  add column if not exists cod_enabled boolean not null default false,
  -- Minor units. Zero means the merchant absorbs the courier's COD charge.
  add column if not exists cod_fee integer not null default 0 check (cod_fee >= 0),
  -- Minor units. Zero means no floor.
  add column if not exists cod_min_order integer not null default 0 check (cod_min_order >= 0),
  -- Minor units. Zero means no ceiling. A cap limits the loss on a refusal.
  add column if not exists cod_max_order integer not null default 0 check (cod_max_order >= 0);

comment on column settings.cod_enabled is
  'Whether cash on delivery is offered at checkout. Also gated per-pincode against Delhivery serviceability.';
comment on column settings.cod_max_order is
  'Upper limit for a COD order, in minor units. Zero means no limit. The cost of a refused COD parcel scales with its value, so a ceiling bounds the downside.';

-- ---------------------------------------------------------------------------
-- create_order_with_lines: record the method and the fee
-- ---------------------------------------------------------------------------
--
-- Replaces the version from 00000000000009. The two new parameters are
-- defaulted, so the signature stays compatible with any caller that omits them
-- — but note this creates a new overload alongside the 21-argument form from
-- migration 9, which is dropped first for the reason migration 6 documented:
-- callers pass named arguments that would match both, and Postgres rejects the
-- call as ambiguous rather than picking one.
drop function if exists create_order_with_lines(
  text, timestamptz, text, text, text, text,
  integer, integer, integer, integer, integer,
  text, text, text, text, text, text, jsonb, text, text, text
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
  p_ship_postal_code text,
  p_lines jsonb,
  p_payment_provider text default null,
  p_cashfree_order_id text default null,
  p_cashfree_payment_session_id text default null,
  p_payment_method text default 'prepaid',
  p_cod_fee integer default 0
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
    ship_name, ship_line1, ship_city, ship_region, ship_phone, ship_postal_code,
    payment_provider, cashfree_order_id, cashfree_payment_session_id,
    payment_method, cod_fee
  ) values (
    p_id, p_placed_at, 'processing', p_customer_id, p_email, p_promo_code, p_card_last4,
    p_subtotal, p_discount, p_shipping, p_tax, p_total,
    p_ship_name, p_ship_line1, p_ship_city, p_ship_region, p_ship_phone, p_ship_postal_code,
    p_payment_provider, p_cashfree_order_id, p_cashfree_payment_session_id,
    coalesce(p_payment_method, 'prepaid'), coalesce(p_cod_fee, 0)
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
-- mark_cod_order_collected: the COD equivalent of mark_order_paid
-- ---------------------------------------------------------------------------
--
-- A separate function rather than reusing `mark_order_paid`, which writes
-- `cashfree_payment_id` unconditionally and coalesces the provider to
-- 'cashfree'. Putting a sentinel in a Cashfree column to record a cash payment
-- would make both columns lie.
--
-- Idempotent on the same principle: the `payment_status <> 'paid'` guard means a
-- repeated sweep updates nothing and returns an empty row, which is the caller's
-- signal that the transition already happened.
create or replace function mark_cod_order_collected(
  p_order_id text,
  p_collected_at timestamptz default now()
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
    payment_provider = coalesce(payment_provider, 'cod'),
    paid_at = p_collected_at
  where id = p_order_id
    and payment_method = 'cod'
    and payment_status <> 'paid'
  returning * into v_order;

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants, matching the pattern in 00000000000006_payments.sql
-- ---------------------------------------------------------------------------

revoke execute on function create_order_with_lines(
  text, timestamptz, text, text, text, text,
  integer, integer, integer, integer, integer,
  text, text, text, text, text, text, jsonb, text, text, text, text, integer
) from public;
revoke execute on function mark_cod_order_collected(text, timestamptz) from public;

grant execute on function create_order_with_lines(
  text, timestamptz, text, text, text, text,
  integer, integer, integer, integer, integer,
  text, text, text, text, text, text, jsonb, text, text, text, text, integer
) to service_role;
grant execute on function mark_cod_order_collected(text, timestamptz) to service_role;

-- Backfill: every existing order predates COD, so it was prepaid.
update orders set payment_method = 'prepaid' where payment_method is null;
