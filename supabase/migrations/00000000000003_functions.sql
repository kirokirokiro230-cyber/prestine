-- PRESTINE — transactional business logic
--
-- The JSON store's `mutateStore()` gave every mutation an implicit transaction
-- for free: read the whole document, mutate a clone, write the whole document
-- back. Splitting into tables removes that free transaction, so anything that
-- used to rely on "the whole document changes atomically" is rewritten here as
-- a Postgres function (`plpgsql`, `security definer` where it needs to act
-- across tables an RLS policy would otherwise block) so it still happens in
-- one statement the client cannot interrupt halfway.
--
-- Simple single-table CRUD (create/update one product, one banner, etc.) does
-- NOT need a function here — a normal insert/update from the repository layer
-- is already atomic. Only the genuinely multi-row, multi-table, or
-- race-sensitive operations get one.

-- ---------------------------------------------------------------------------
-- Orders: create an order with its lines in one transaction
-- ---------------------------------------------------------------------------
--
-- Mirrors createOrder() in repositories/orders.ts, which previously received
-- one fully-formed Order (lines included) and pushed it as a single document
-- write. Here the header and every line are separate tables, so both inserts
-- must commit together or not at all — an order with a total but no lines, or
-- lines with no parent order, is a bug the checkout trust boundary must never
-- be able to produce.
--
-- `p_lines` is a jsonb array; each element matches OrderLine's shape one for
-- one (productId/slug/name/colorId/colorName/colorHex/size/quantity/unitPrice/category).
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
  p_lines jsonb
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
    ship_name, ship_line1, ship_city, ship_region, ship_phone
  ) values (
    p_id, p_placed_at, 'processing', p_customer_id, p_email, p_promo_code, p_card_last4,
    p_subtotal, p_discount, p_shipping, p_tax, p_total,
    p_ship_name, p_ship_line1, p_ship_city, p_ship_region, p_ship_phone
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
-- Orders: forward-only status transition
-- ---------------------------------------------------------------------------
--
-- Mirrors canTransition()/updateOrderStatus() in repositories/orders.ts exactly
-- — same table of allowed moves, same field stamping, same rule that
-- cancellation_reason is written once and never cleared by a later call that
-- omits it. Enforced here (not only in TypeScript) so a direct update can
-- never skip a state, which matters once more than one code path can reach
-- this table.
create or replace function update_order_status(
  p_order_id text,
  p_next_status order_status,
  p_tracking_number text default null,
  p_carrier text default null,
  p_reason text default null
)
returns orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders;
  v_allowed boolean;
begin
  select * into v_order from orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Order % not found', p_order_id;
  end if;

  v_allowed := case v_order.status
    when 'processing' then p_next_status in ('shipped', 'cancelled')
    when 'shipped' then p_next_status in ('delivered', 'cancelled')
    else false
  end;

  if not v_allowed then
    raise exception 'Cannot move an order from % to %.', v_order.status, p_next_status;
  end if;

  update orders set
    status = p_next_status,
    tracking_number = coalesce(p_tracking_number, tracking_number),
    carrier = coalesce(p_carrier, carrier),
    shipped_at = case when p_next_status = 'shipped' then now() else shipped_at end,
    delivered_at = case when p_next_status = 'delivered' then now() else delivered_at end,
    cancelled_at = case when p_next_status = 'cancelled' then now() else cancelled_at end,
    cancellation_reason = case
      when p_next_status = 'cancelled' and p_reason is not null and length(trim(p_reason)) > 0
        then trim(p_reason)
      else cancellation_reason
    end
  where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

-- Customer-initiated cancellation. Same authority split as
-- cancelOrderAsCustomer() in the current repository: only reachable from
-- 'processing', because once a courier has it, stopping it is a conversation
-- rather than a button.
create or replace function cancel_order_as_customer(
  p_order_id text,
  p_reason text
)
returns orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders;
begin
  select * into v_order from orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Order % not found', p_order_id;
  end if;

  if v_order.status <> 'processing' then
    if v_order.status = 'cancelled' then
      raise exception 'This order has already been cancelled.';
    end if;
    raise exception 'This order is already % and can no longer be cancelled online.', v_order.status;
  end if;

  return update_order_status(p_order_id, 'cancelled', null, null, p_reason);
end;
$$;

-- ---------------------------------------------------------------------------
-- Taxonomy: renaming a category/collection slug must carry every product
-- ---------------------------------------------------------------------------
--
-- Mirrors updateCategory()'s slug-rename branch: if a merchant renames a
-- category slug, every product referencing the old slug must move to the new
-- one in the same transaction the rename happens in, or products would vanish
-- from their own category page for the moment between the two writes.
--
-- Note the products.category foreign key already has `on update cascade`
-- (see 00000000000001_schema.sql), which handles this automatically for a
-- plain `update categories set slug = ...` — this function exists mainly to
-- give the repository layer one atomic call that also validates uniqueness
-- first and returns a clear error, matching updateCategory()'s own guard.
create or replace function rename_category_slug(
  p_old_slug text,
  p_new_slug text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_old_slug = p_new_slug then
    return;
  end if;

  if exists (select 1 from categories where slug = p_new_slug) then
    raise exception 'Category % already exists.', p_new_slug;
  end if;

  -- on update cascade on products.category propagates this automatically.
  update categories set slug = p_new_slug where slug = p_old_slug;
end;
$$;

-- Collection rename: same idea, but a collection is a many-to-many tag rather
-- than a required single value, matching updateCollection()'s slug-rename
-- branch which rewrites every product's collections array.
create or replace function rename_collection_slug(
  p_old_slug text,
  p_new_slug text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_old_slug = p_new_slug then
    return;
  end if;

  if exists (select 1 from collections where slug = p_new_slug) then
    raise exception 'Collection % already exists.', p_new_slug;
  end if;

  -- on update cascade on product_collections.collection_slug propagates this.
  update collections set slug = p_new_slug where slug = p_old_slug;
end;
$$;

-- Category delete must refuse while any product still references it — mirrors
-- deleteCategory()'s guard. A plain `delete` would otherwise be blocked by the
-- `on delete restrict` foreign key with a raw constraint-violation error; this
-- gives the same friendly message the current admin UI shows.
create or replace function delete_category_if_unused(p_slug text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_in_use integer;
begin
  select count(*) into v_in_use from products where category = p_slug;
  if v_in_use > 0 then
    raise exception '% product% still use this category. Move them first.',
      v_in_use, (case when v_in_use = 1 then '' else 's' end);
  end if;

  delete from categories where slug = p_slug;
end;
$$;

-- Banner delete must close the position gap so the remaining slides stay
-- contiguous (0, 1, 2, ...) and the up/down reorder buttons keep working —
-- mirrors deleteBanner()'s renumbering pass.
create or replace function delete_banner_and_close_gap(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from banners where id = p_id;

  with renumbered as (
    select id, row_number() over (order by position) - 1 as new_position
    from banners
  )
  update banners
  set position = renumbered.new_position
  from renumbered
  where banners.id = renumbered.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reviews: race-safe one-review-per-customer-per-product
-- ---------------------------------------------------------------------------
--
-- The `unique (customer_id, product_slug)` constraint on submitted_reviews
-- (see 00000000000001_schema.sql) is what actually closes the race two
-- concurrent submissions used to be guarded against inside mutateStore()'s
-- serialised queue. This wrapper turns the constraint violation into the same
-- silent "already reviewed, do nothing" behaviour submitReview() has today,
-- rather than surfacing a raw unique-violation error to the caller.
create or replace function submit_review_once(
  p_id text,
  p_product_slug text,
  p_customer_id text,
  p_order_id text,
  p_author text,
  p_rating smallint,
  p_fit fit_feedback,
  p_reasons text[],
  p_body text
)
returns submitted_reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  v_review submitted_reviews;
begin
  insert into submitted_reviews (
    id, product_slug, customer_id, order_id, author, rating, fit, reasons, body
  ) values (
    p_id, p_product_slug, p_customer_id, p_order_id, p_author, p_rating, p_fit, p_reasons, p_body
  )
  on conflict (customer_id, product_slug) do nothing
  returning * into v_review;

  if v_review.id is null then
    select * into v_review from submitted_reviews
    where customer_id = p_customer_id and product_slug = p_product_slug;
  end if;

  return v_review;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lock down who can call these
-- ---------------------------------------------------------------------------
--
-- Postgres grants EXECUTE on every newly created function to PUBLIC by
-- default. These functions are `security definer`, so left at the default
-- grant, the anon key could call e.g. cancel_order_as_customer() or
-- submit_review_once() directly and bypass every check the application
-- layer wraps around them (session ownership, entitlement, etc.). Revoke
-- PUBLIC and grant explicitly only to the service role, which is the only
-- credential this application ever uses server-side.
revoke execute on function create_order_with_lines from public;
revoke execute on function update_order_status from public;
revoke execute on function cancel_order_as_customer from public;
revoke execute on function rename_category_slug from public;
revoke execute on function rename_collection_slug from public;
revoke execute on function delete_category_if_unused from public;
revoke execute on function delete_banner_and_close_gap from public;
revoke execute on function submit_review_once from public;

grant execute on function create_order_with_lines to service_role;
grant execute on function update_order_status to service_role;
grant execute on function cancel_order_as_customer to service_role;
grant execute on function rename_category_slug to service_role;
grant execute on function rename_collection_slug to service_role;
grant execute on function delete_category_if_unused to service_role;
grant execute on function delete_banner_and_close_gap to service_role;
grant execute on function submit_review_once to service_role;

-- ---------------------------------------------------------------------------
-- Admins: never allow the last active owner to be removed
-- ---------------------------------------------------------------------------
--
-- Mirrors the guard in updateAdmin()/deleteAdmin() (src/server/auth.ts):
-- an admin table with zero active owners means nobody can reach Settings or
-- Staff ever again. The JSON store's serialised mutateStore() queue made
-- "count active owners, then write" safe from a race between two concurrent
-- requests; a plain application-side check-then-write here would not be —
-- two simultaneous "demote the owner" and "disable the owner" requests could
-- each read "2 owners, safe to proceed" before either commits. A trigger
-- makes the invariant hold regardless of how many processes are writing at
-- once, which is what this schema now needs in place of that queue.
create or replace function guard_last_owner()
returns trigger
language plpgsql
as $$
declare
  v_remaining_owners integer;
begin
  -- Only fires on a change that could reduce the active-owner count: a
  -- delete, a role change away from 'owner', or setting disabled = true.
  if tg_op = 'DELETE' then
    if old.role <> 'owner' or old.disabled then
      return old;
    end if;
  else
    if old.role <> 'owner' or old.disabled then
      -- This row was never an active owner, so it cannot be the one being
      -- protected — let any other change through untouched.
      return new;
    end if;
    if new.role = 'owner' and not new.disabled then
      -- Still an active owner after the update; nothing is being removed.
      return new;
    end if;
  end if;

  select count(*) into v_remaining_owners
  from admins
  where role = 'owner' and disabled = false and id <> old.id;

  if v_remaining_owners = 0 then
    raise exception 'There must always be at least one active owner.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger admins_guard_last_owner
  before update or delete on admins
  for each row execute function guard_last_owner();

-- ---------------------------------------------------------------------------
-- Phone verifications: atomic wrong-guess counter
-- ---------------------------------------------------------------------------
--
-- Mirrors countAttempt() in src/server/otp.ts: an OTP code is burned after
-- MAX_ATTEMPTS (5, enforced in application code, not here) wrong guesses.
-- `attempts = attempts + 1` as a single UPDATE ... RETURNING is what makes
-- the cap hold under two simultaneous guesses against the same code — a
-- read-attempts-then-write-attempts round trip from the application would
-- let both guesses read `4` and both write `5`, silently granting one extra
-- attempt beyond the cap.
create or replace function increment_verification_attempts(p_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts integer;
begin
  update phone_verifications
  set attempts = attempts + 1
  where id = p_id
  returning attempts into v_attempts;

  return v_attempts;
end;
$$;

revoke execute on function increment_verification_attempts from public;
grant execute on function increment_verification_attempts to service_role;
