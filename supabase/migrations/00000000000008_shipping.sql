-- PRESTINE — shipping (Delhivery)
--
-- Adds the tables and functions needed to integrate with Delhivery's shipping API:
-- shipment creation, tracking, webhooks, pickup management and returns.
--
-- Design: Every order can have one or more shipments (forward shipments to customer,
-- reverse pickups for returns). Each shipment is tracked independently with its own
-- waybill. Scan history is normalized into a separate table so a single shipment with
-- 20 tracking events doesn't bloat the main shipment row.

-- ---------------------------------------------------------------------------
-- pickup_locations: Warehouses registered with Delhivery
-- ---------------------------------------------------------------------------

create table if not exists pickup_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  phone text not null,
  address text not null,
  city text not null,
  state text not null,
  pincode text not null,
  country text not null default 'India',
  is_active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pickup_locations_is_active_idx on pickup_locations (is_active);
create index pickup_locations_is_default_idx on pickup_locations (is_default) where is_default = true;

comment on table pickup_locations is
  'Warehouses from which shipments are picked up. The name must match exactly what is registered with Delhivery (case-sensitive).';
comment on column pickup_locations.name is
  'Warehouse name exactly as registered with Delhivery. Case-sensitive. Used in API calls.';

-- ---------------------------------------------------------------------------
-- shipping_info: One row per shipment (forward or reverse)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'shipment_type') then
    create type shipment_type as enum ('forward', 'reverse');
  end if;
  if not exists (select 1 from pg_type where typname = 'shipping_payment_mode') then
    create type shipping_payment_mode as enum ('prepaid', 'cod', 'pickup');
  end if;
end
$$;

create table if not exists shipping_info (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references orders(id) on delete cascade,
  carrier text not null default 'delhivery',
  waybill text not null,
  status text,
  status_code text,
  tracking_url text,
  label_url text,
  pickup_scheduled_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  expected_delivery_date timestamptz,
  origin text,
  destination text,
  weight_grams integer,
  shipment_type shipment_type not null default 'forward',
  payment_mode shipping_payment_mode not null default 'prepaid',
  cod_amount integer default 0,
  shipping_charges integer,
  -- Full API response from Delhivery, stored for audit and reconciliation
  raw_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index shipping_info_waybill_idx on shipping_info (waybill);
create index shipping_info_order_id_idx on shipping_info (order_id);
create index shipping_info_status_idx on shipping_info (status);
create index shipping_info_type_idx on shipping_info (shipment_type);
create index shipping_info_delivered_at_idx on shipping_info (delivered_at) where delivered_at is not null;

comment on table shipping_info is
  'One row per shipment. An order can have multiple shipments (e.g. forward + return).';
comment on column shipping_info.waybill is
  'Delhivery tracking number (AWB). Unique across all shipments.';
comment on column shipping_info.payment_mode is
  'prepaid/cod for forward shipments, pickup for reverse pickups.';
comment on column shipping_info.raw_response is
  'Complete API response from Delhivery for audit and debugging.';

-- ---------------------------------------------------------------------------
-- shipping_scans: Tracking event history
-- ---------------------------------------------------------------------------

create table if not exists shipping_scans (
  id uuid primary key default gen_random_uuid(),
  shipping_info_id uuid not null references shipping_info(id) on delete cascade,
  scan_datetime timestamptz not null,
  scan_type text,
  scan_status text,
  status_code text,
  location text,
  instructions text,
  -- Full scan detail from Delhivery API
  raw_data jsonb,
  created_at timestamptz not null default now()
);

create index shipping_scans_shipping_info_id_idx on shipping_scans (shipping_info_id);
create index shipping_scans_scan_datetime_idx on shipping_scans (scan_datetime desc);

comment on table shipping_scans is
  'Tracking scan history. Each status update creates a new row.';
comment on column shipping_scans.scan_datetime is
  'When the scan occurred (from Delhivery data), not when we received it.';

-- ---------------------------------------------------------------------------
-- returns: Return request lifecycle
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'return_status') then
    create type return_status as enum (
      'requested',
      'approved',
      'rejected',
      'picked_up',
      'in_transit',
      'received',
      'refunded',
      'cancelled'
    );
  end if;
end
$$;

create table if not exists returns (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references orders(id) on delete cascade,
  shipping_info_id uuid references shipping_info(id) on delete set null,
  reason text,
  status return_status not null default 'requested',
  refund_amount integer,
  refund_status text,
  notes text,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  received_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index returns_order_id_idx on returns (order_id);
create index returns_status_idx on returns (status);
create index returns_requested_at_idx on returns (requested_at desc);

comment on table returns is
  'Return requests. Links to shipping_info once reverse pickup is created.';
comment on column returns.shipping_info_id is
  'Links to the reverse shipment once created. Null until pickup is scheduled.';

-- ---------------------------------------------------------------------------
-- Add shipping columns to orders table
-- ---------------------------------------------------------------------------

alter table orders
  add column if not exists shipping_status text,
  add column if not exists tracking_number text,
  add column if not exists expected_delivery_date timestamptz;

create index if not exists orders_shipping_status_idx on orders (shipping_status);
create index if not exists orders_tracking_number_idx on orders (tracking_number);

comment on column orders.shipping_status is
  'Latest shipment status for quick lookup. Copied from shipping_info on updates.';
comment on column orders.tracking_number is
  'Primary waybill for this order. Copied from shipping_info on creation.';

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- create_shipment: Insert a new shipment and link it to the order
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
    order_id,
    waybill,
    shipment_type,
    payment_mode,
    weight_grams,
    cod_amount,
    shipping_charges,
    status,
    raw_response
  ) values (
    p_order_id,
    p_waybill,
    p_shipment_type,
    p_payment_mode,
    p_weight_grams,
    p_cod_amount,
    p_shipping_charges,
    'pending',
    p_raw_response
  )
  returning id into v_shipping_id;

  -- Update order with tracking number (first shipment only)
  update orders
  set
    tracking_number = p_waybill,
    shipping_status = 'pending'
  where id = p_order_id and tracking_number is null;

  return v_shipping_id;
end;
$$;

-- update_shipment_status: Update shipment status (called by webhook)
create or replace function update_shipment_status(
  p_waybill text,
  p_status text,
  p_status_code text default null,
  p_location text default null,
  p_picked_up_at timestamptz default null,
  p_delivered_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shipping_id uuid;
  v_order_id text;
begin
  update shipping_info
  set
    status = p_status,
    status_code = coalesce(p_status_code, status_code),
    destination = coalesce(p_location, destination),
    picked_up_at = coalesce(p_picked_up_at, picked_up_at),
    delivered_at = coalesce(p_delivered_at, delivered_at),
    updated_at = now()
  where waybill = p_waybill
  returning id, order_id into v_shipping_id, v_order_id;

  -- Update order shipping status
  if v_order_id is not null then
    update orders
    set shipping_status = p_status
    where id = v_order_id;
  end if;

  return v_shipping_id;
end;
$$;

-- add_shipping_scan: Record a tracking scan event
create or replace function add_shipping_scan(
  p_waybill text,
  p_scan_datetime timestamptz,
  p_scan_type text,
  p_scan_status text,
  p_status_code text,
  p_location text,
  p_instructions text,
  p_raw_data jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scan_id uuid;
  v_shipping_id uuid;
begin
  -- Find shipping_info by waybill
  select id into v_shipping_id
  from shipping_info
  where waybill = p_waybill;

  if v_shipping_id is null then
    raise exception 'Shipment not found: %', p_waybill;
  end if;

  -- Insert scan (on conflict do nothing to handle duplicate webhook deliveries)
  insert into shipping_scans (
    shipping_info_id,
    scan_datetime,
    scan_type,
    scan_status,
    status_code,
    location,
    instructions,
    raw_data
  ) values (
    v_shipping_id,
    p_scan_datetime,
    p_scan_type,
    p_scan_status,
    p_status_code,
    p_location,
    p_instructions,
    p_raw_data
  )
  on conflict do nothing
  returning id into v_scan_id;

  return v_scan_id;
end;
$$;

-- Permissions: only service_role can call these
revoke execute on function create_shipment(text, text, shipment_type, shipping_payment_mode, integer, integer, integer, jsonb) from public;
revoke execute on function update_shipment_status(text, text, text, text, timestamptz, timestamptz) from public;
revoke execute on function add_shipping_scan(text, timestamptz, text, text, text, text, text, jsonb) from public;

grant execute on function create_shipment(text, text, shipment_type, shipping_payment_mode, integer, integer, integer, jsonb) to service_role;
grant execute on function update_shipment_status(text, text, text, text, timestamptz, timestamptz) to service_role;
grant execute on function add_shipping_scan(text, timestamptz, text, text, text, text, text, jsonb) to service_role;
