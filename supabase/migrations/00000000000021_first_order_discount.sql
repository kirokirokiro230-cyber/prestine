-- PRESTINE — a one-time discount on a customer's first order
--
-- A percentage off the first order, applied automatically at checkout to a signed-in
-- customer, once per person. After it is used, orders are priced normally.
--
-- The hard part is "once per person": the discount is worth money, so the rule has to hold
-- when someone tries to get it twice, from two tabs at the same moment, from a second
-- account, or by cancelling and reordering. This migration is where it is enforced; the
-- application only asks.
--
-- ## Who counts as the same person
--
-- Each customer is described by a few identity keys, built by the application
-- (src/lib/first-order.ts) and matched here:
--
--   c:<customer id>        the account
--   e:<canonical email>    the email, with Gmail dots and "+tags" removed, so
--                          a.b+shop@gmail.com and ab@gmail.com are one address
--   p:<last 10 digits>     the account's phone and the delivery phone
--
-- A discount claim covers all of a customer's keys. Anyone sharing ANY key with an earlier
-- claim, or with an earlier paid or cash-on-delivery order, is treated as the same person.
-- That will occasionally refuse a genuine new customer who shares an email or number with
-- someone who already ordered (a household, a gift sent to a friend's phone). That is the
-- cheaper mistake: it costs one discount's goodwill, where the opposite costs the discount
-- every time.
--
-- ## What "first order" means
--
-- No earlier order of that person is PAID, or cash on delivery and not cancelled. An order
-- that was started and abandoned at the payment page does not count, or a customer whose
-- card failed once could never get the discount.
--
-- ## When a claim is live
--
-- A claim is made when the order is placed, before it can be paid, so that two orders
-- cannot both be priced with the discount. It then stays "live", and blocks another use,
-- while its order is a real one:
--
--   - an order that was cancelled releases it;
--   - an order whose payment failed releases it;
--   - a prepaid order never paid within 24 hours releases it (Cashfree stops accepting
--     payment for it after 24 hours);
--   - a claim whose order was never recorded (the checkout failed after claiming)
--     releases itself after 10 minutes, and the application releases it at once.
--
-- Everything else, including a delivered order and a returned one, keeps it used.
-- Liveness is worked out from the order each time, rather than stored, so a cancellation
-- from anywhere (the customer, an admin, a webhook) frees the discount without anything
-- having to remember to.
--
-- ## Concurrency
--
-- claim_first_order_discount takes a transaction-scoped advisory lock on every key before
-- it checks, so two checkouts by one person run one after the other and the second sees
-- the first's claim. The keys are locked in sorted order, so two people sharing keys
-- cannot deadlock each other.
--
-- ## Access
--
-- Service role only, as for every table holding order data: RLS on, table privileges
-- removed from anon and authenticated, and the functions revoked from them explicitly.

alter table settings
  add column if not exists first_order_discount_percent integer not null default 10
    check (first_order_discount_percent between 0 and 100);

comment on column settings.first_order_discount_percent is
  'Percentage off a customer''s first order, applied automatically and once per person. Zero turns it off. See migration 21.';

-- ---------------------------------------------------------------------------
-- canonical_email
-- ---------------------------------------------------------------------------
--
-- Must agree with canonicalEmail() in src/lib/first-order.ts (there is a test of the
-- cases). "+tag" is dropped for every domain; dots are dropped only for Gmail, where they
-- are ignored by the provider and so are not a different address.

create or replace function canonical_email(p_email text)
returns text
language sql
immutable
as $$
  select case
    when p_email is null or position('@' in p_email) = 0 then lower(coalesce(trim(p_email), ''))
    when lower(split_part(trim(p_email), '@', 2)) in ('gmail.com', 'googlemail.com') then
      replace(split_part(split_part(lower(trim(p_email)), '@', 1), '+', 1), '.', '') || '@gmail.com'
    else
      split_part(split_part(lower(trim(p_email)), '@', 1), '+', 1) || '@' || lower(split_part(trim(p_email), '@', 2))
  end
$$;

-- ---------------------------------------------------------------------------
-- first_order_claims
-- ---------------------------------------------------------------------------

create table if not exists first_order_claims (
  id uuid primary key default gen_random_uuid(),

  -- The order the discount was claimed for. Deliberately not a foreign key: the claim is
  -- made before the order row exists, which is the whole point (see "Concurrency").
  order_id text not null unique,

  -- The identity keys at the time of the claim.
  keys text[] not null check (cardinality(keys) > 0),

  -- Minor units taken off. A record of what was given, not used to compute anything.
  discount integer not null check (discount > 0),

  created_at timestamptz not null default now()
);

create index if not exists first_order_claims_keys_idx on first_order_claims using gin (keys);

alter table first_order_claims enable row level security;

revoke all on table first_order_claims from anon, authenticated;

comment on table first_order_claims is
  'One row per order that was priced with the first-order discount, with the identity keys of whoever claimed it. A claim is live while its order is a real one; see migration 21. Service-role only.';

-- ---------------------------------------------------------------------------
-- first_order_discount_status
-- ---------------------------------------------------------------------------
--
-- Answers, for a set of identity keys: 'available', 'used' (already claimed),
-- 'returning' (has an earlier order, so this is not a first order) or 'held:<order id>'
-- (the discount is on an order that has not been paid yet).
--
-- Writes nothing. Not declared `stable`, on purpose: claim_first_order_discount calls it
-- right after waiting for a lock, and it must read what the other transaction committed in
-- the meantime, which a function pinned to its caller's snapshot might not.
--
-- `p_order_id` is the order being priced, excluded so it never blocks itself.

create or replace function first_order_discount_status(
  p_keys text[],
  p_order_id text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim record;
begin
  if p_keys is null or cardinality(p_keys) = 0 then
    return 'used';
  end if;

  select c.order_id, o.id as order_exists, o.payment_method, o.payment_status
  into v_claim
  from first_order_claims c
  left join orders o on o.id = c.order_id
  where c.keys && p_keys
    and c.order_id is distinct from p_order_id
    and (
      -- Claimed, and the order was never recorded: live for ten minutes while the
      -- checkout that made it finishes.
      (o.id is null and c.created_at > now() - interval '10 minutes')
      or (
        o.id is not null
        and o.status <> 'cancelled'
        and o.payment_status <> 'failed'
        and not (
          o.payment_method = 'prepaid'
          and o.payment_status = 'pending'
          and o.placed_at < now() - interval '24 hours'
        )
      )
    )
  order by c.created_at
  limit 1;

  if found then
    -- Unpaid prepaid: the customer can still finish paying it, or cancel it. Say which
    -- order, so the page can tell them.
    if v_claim.order_exists is not null
       and v_claim.payment_method = 'prepaid'
       and v_claim.payment_status = 'pending' then
      return 'held:' || v_claim.order_id;
    end if;

    return 'used';
  end if;

  if exists (
    select 1
    from orders o
    where o.id is distinct from p_order_id
      and o.status <> 'cancelled'
      and (o.payment_status = 'paid' or o.payment_method = 'cod')
      and (
        ('c:' || o.customer_id) = any (p_keys)
        or ('e:' || canonical_email(o.email)) = any (p_keys)
        or ('p:' || right(regexp_replace(coalesce(o.ship_phone, ''), '\D', '', 'g'), 10)) = any (p_keys)
      )
  ) then
    return 'returning';
  end if;

  return 'available';
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_first_order_discount
-- ---------------------------------------------------------------------------
--
-- Returns 'claimed' on success, otherwise the status that stopped it ('used',
-- 'returning', 'held:<order id>'), or 'invalid' / 'duplicate'.

create or replace function claim_first_order_discount(
  p_keys text[],
  p_order_id text,
  p_discount integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_status text;
begin
  if p_keys is null or cardinality(p_keys) = 0 or p_order_id is null or p_discount is null or p_discount <= 0 then
    return 'invalid';
  end if;

  -- Sorted, so two people sharing keys take the locks in the same order.
  for v_key in select distinct k from unnest(p_keys) as k order by k
  loop
    perform pg_advisory_xact_lock(hashtext('first-order:' || v_key));
  end loop;

  v_status := first_order_discount_status(p_keys, p_order_id);

  if v_status <> 'available' then
    return v_status;
  end if;

  insert into first_order_claims (order_id, keys, discount)
  values (p_order_id, p_keys, p_discount);

  return 'claimed';
exception
  when unique_violation then
    -- This order id was already claimed for.
    return 'duplicate';
end;
$$;

-- ---------------------------------------------------------------------------
-- release_first_order_claim
-- ---------------------------------------------------------------------------
--
-- For a checkout that claimed and then failed before recording the order. Does nothing
-- once the order exists, so it can never free the discount of a real order.

create or replace function release_first_order_claim(p_order_id text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from first_order_claims c
  where c.order_id = p_order_id
    and not exists (select 1 from orders o where o.id = c.order_id);
$$;

revoke execute on function canonical_email(text) from public, anon, authenticated;
revoke execute on function first_order_discount_status(text[], text) from public, anon, authenticated;
revoke execute on function claim_first_order_discount(text[], text, integer) from public, anon, authenticated;
revoke execute on function release_first_order_claim(text) from public, anon, authenticated;

grant execute on function canonical_email(text) to service_role;
grant execute on function first_order_discount_status(text[], text) to service_role;
grant execute on function claim_first_order_discount(text[], text, integer) to service_role;
grant execute on function release_first_order_claim(text) to service_role;
