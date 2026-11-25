-- PRESTINE — automatic tracking sync
--
-- Delhivery offers two ways to learn about a scan: a pull API (poll the
-- tracking endpoint) and a push API (they POST each scan to a URL you give
-- them). This migration supports the pull path, which needs nothing configured
-- on their side and so works today.
--
-- Polling re-reads a shipment's *entire* scan history every time, which exposed
-- a gap: `add_shipping_scan` was written with `on conflict do nothing` to absorb
-- duplicate webhook deliveries, but `shipping_scans` had no unique constraint
-- for that clause to fire against. Every poll would therefore have re-inserted
-- every scan.

-- ---------------------------------------------------------------------------
-- Make scan inserts idempotent
-- ---------------------------------------------------------------------------
--
-- A scan is identified by its shipment, the moment it happened, and its status
-- code. `coalesce` on the code because Postgres treats NULLs as distinct in a
-- unique index, so without it a scan with no status code would still duplicate.
--
-- Existing duplicates are collapsed first, otherwise creating the index fails
-- on any database that has already been polled.
--
-- `row_number()` rather than `min(id)`: the primary key is a uuid, and Postgres
-- has no `min(uuid)` aggregate — uuids compare and sort, but they do not
-- aggregate. A window function sidesteps the type question entirely and also
-- lets the survivor be chosen deliberately (the earliest recorded row) rather
-- than whichever id happens to sort lowest.
delete from shipping_scans
where id in (
  select id
  from (
    select
      id,
      row_number() over (
        partition by shipping_info_id, scan_datetime, coalesce(status_code, '')
        order by created_at asc, id asc
      ) as duplicate_rank
    from shipping_scans
  ) ranked
  where duplicate_rank > 1
);

-- The coalesce is parenthesised: an index expression may be written bare only
-- when it is a plain function call, and COALESCE is a SQL construct rather than
-- one.
create unique index if not exists shipping_scans_unique_event_idx
  on shipping_scans (shipping_info_id, scan_datetime, (coalesce(status_code, '')));

-- ---------------------------------------------------------------------------
-- Carry the courier's delivery estimate through to the order
-- ---------------------------------------------------------------------------
--
-- `orders.expected_delivery_date` and `shipping_info.expected_delivery_date`
-- both existed but nothing ever wrote them. The tracking sweep has the value,
-- so it is threaded through here as an optional parameter — existing callers
-- that omit it behave exactly as before.
--
-- The old six-argument signature has to be dropped explicitly first.
-- `create or replace function` only replaces a function whose argument list
-- matches exactly, so adding a seventh parameter would leave *both* in place as
-- overloads — and the webhook calls this with six named arguments, which would
-- then match the six-argument form exactly and the seven-argument form via its
-- default. Postgres rejects that as "function is not unique" rather than
-- choosing. The same hazard is documented at length in
-- `00000000000006_payments.sql` for `create_order_with_lines`.
drop function if exists update_shipment_status(
  text, text, text, text, timestamptz, timestamptz
);

create or replace function update_shipment_status(
  p_waybill text,
  p_status text,
  p_status_code text default null,
  p_location text default null,
  p_picked_up_at timestamptz default null,
  p_delivered_at timestamptz default null,
  p_expected_delivery_date timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shipping_id uuid;
  v_order_id text;
  v_shipment_type shipment_type;
begin
  update shipping_info
  set
    status = p_status,
    status_code = coalesce(p_status_code, status_code),
    -- `destination` is the delivery city, not the scan location. Overwriting it
    -- with wherever the parcel last passed through made the field meaningless,
    -- so the latest scan location is no longer written here.
    picked_up_at = coalesce(p_picked_up_at, picked_up_at),
    delivered_at = coalesce(p_delivered_at, delivered_at),
    expected_delivery_date = coalesce(p_expected_delivery_date, expected_delivery_date),
    updated_at = now()
  where waybill = p_waybill
  returning id, order_id, shipment_type into v_shipping_id, v_order_id, v_shipment_type;

  /*
   * Only a forward shipment speaks for the order's shipping status. A reverse
   * pickup moving through the network must not make the order read "in transit"
   * again after it was delivered.
   */
  if v_order_id is not null and v_shipment_type = 'forward' then
    update orders
    set
      shipping_status = p_status,
      expected_delivery_date =
        coalesce(p_expected_delivery_date, expected_delivery_date)
    where id = v_order_id;
  end if;

  return v_shipping_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Name the carrier on the order
-- ---------------------------------------------------------------------------
--
-- `create_shipment` already copies the Delhivery waybill into
-- `orders.tracking_number`, but left `orders.carrier` null. That column is what
-- the storefront uses to decide where a "Track parcel" link should point, so a
-- null there meant a Delhivery waybill was being offered under whatever carrier
-- the UI happened to default to.
create or replace function create_shipment(
  p_order_id text,
  p_waybill text,
  p_shipment_type shipment_type,
  p_payment_mode shipping_payment_mode,
  p_weight_grams integer,
  p_cod_amount integer default 0,
  p_shipping_charges integer default null,
  p_raw_response jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shipping_id uuid;
begin
  insert into shipping_info (
    order_id, waybill, shipment_type, payment_mode,
    weight_grams, cod_amount, shipping_charges, raw_response,
    status, tracking_url
  ) values (
    p_order_id, p_waybill, p_shipment_type, p_payment_mode,
    p_weight_grams, p_cod_amount, p_shipping_charges, p_raw_response,
    'pending', 'https://www.delhivery.com/track/package/' || p_waybill
  )
  returning id into v_shipping_id;

  /*
   * Mirror onto the order for the views that read it. Only the forward shipment
   * claims the order's tracking number — a reverse pickup must not overwrite the
   * outbound waybill the customer was given.
   */
  if p_shipment_type = 'forward' then
    update orders
    set
      tracking_number = coalesce(tracking_number, p_waybill),
      carrier = coalesce(carrier, 'Delhivery'),
      shipping_status = 'pending'
    where id = p_order_id;
  end if;

  return v_shipping_id;
end;
$$;

-- Backfill orders already manifested before the carrier was recorded.
update orders o
set carrier = 'Delhivery'
where o.carrier is null
  and exists (
    select 1 from shipping_info s
    where s.order_id = o.id and s.shipment_type = 'forward'
  );



-- ---------------------------------------------------------------------------
-- Which shipments are worth polling
-- ---------------------------------------------------------------------------
--
-- A shipment stops being interesting once it is delivered or returned, so the
-- sweep must not keep spending request budget on it. Delhivery's pull API
-- allows 750 requests per five minutes per IP, which is ample — but only if the
-- set being polled stays bounded as the order book grows.
--
-- `p_stale_minutes` lets a frequent schedule skip rows polled a moment ago, so
-- running the sweep more often than necessary is cheap rather than wasteful.
create or replace function shipments_awaiting_tracking(
  p_limit integer default 100,
  p_stale_minutes integer default 0
)
returns setof shipping_info
language sql
security definer
set search_path = public
as $$
  select *
  from shipping_info
  where delivered_at is null
    -- Terminal states Delhivery will not move again. Matched loosely because
    -- the status text is the courier's, not ours.
    and coalesce(lower(status), '') not like '%rto delivered%'
    and coalesce(lower(status), '') not like '%canceled%'
    and coalesce(lower(status), '') not like '%cancelled%'
    and updated_at < now() - make_interval(mins => p_stale_minutes)
  -- Least recently updated first, so one stuck shipment cannot starve the rest.
  order by updated_at asc
  limit p_limit;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
--
-- Last in the file, because a grant cannot name a function that has not been
-- created yet.
--
-- `00000000000008_shipping.sql` revoked these from `public` and granted them to
-- `service_role`. Dropping the six-argument `update_shipment_status` above threw
-- its grants away with it, and a newly created function is executable by
-- `public` by default — so the pair has to be restated for the new signature,
-- or the replacement ends up more widely callable than the function it replaced.
--
-- `create_shipment` keeps its original signature, so `create or replace` left
-- its existing grants intact and it is not repeated here.
revoke execute on function update_shipment_status(
  text, text, text, text, timestamptz, timestamptz, timestamptz
) from public;
revoke execute on function shipments_awaiting_tracking(integer, integer) from public;

grant execute on function update_shipment_status(
  text, text, text, text, timestamptz, timestamptz, timestamptz
) to service_role;
grant execute on function shipments_awaiting_tracking(integer, integer) to service_role;
