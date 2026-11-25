-- PRESTINE — refunds on prepaid orders, through Cashfree
--
-- Until now a prepaid refund meant someone opening the Cashfree dashboard, finding the
-- payment and typing an amount, and nothing in this system recorded that it had happened.
-- The admin order page can now issue the refund itself, for any amount up to what the
-- customer paid, and this is the ledger behind it.
--
-- ## order_refunds
--
-- One row per refund, whatever its outcome. It exists for three reasons:
--
-- 1. **It is the limit.** How much can still be refunded is `orders.total` minus the sum
--    of the refunds that are not failed or cancelled. Asking Cashfree each time would
--    work, but it would not stop two staff members pressing the button in the same second.
-- 2. **It is the record.** Who refunded how much, when, and why, with the state Cashfree
--    reports. Cashfree settles refunds asynchronously (a refund can take several working
--    days to reach the customer's bank), so "accepted" and "arrived" are different rows
--    of history, not one boolean.
-- 3. **It makes the button safe to press twice.** `refund_id` is unique, and it is the id
--    sent to Cashfree. The form carries one fresh key per page load, so a double click
--    sends the same id twice and the second is refused here rather than refunding twice.
--
-- ## Statuses
--
--   requested   recorded here, Cashfree not yet asked, or asked and the answer was lost
--   pending     Cashfree accepted it and is processing it
--   onhold      Cashfree is holding it (usually not enough balance); still owed
--   success     the money reached the customer's bank
--   failed      Cashfree refused it; the money is free to refund again
--   cancelled   Cashfree gave up after retrying; the money is free to refund again
--
-- `requested`, `pending`, `onhold` and `success` count against the order. `failed` and
-- `cancelled` do not. The same list is in src/lib/refund.ts (`isLiveRefund`).
--
-- ## reserve_order_refund
--
-- Checks the limit and writes the row in one transaction, holding a lock on the order.
-- Without the lock, two requests could both read "1000 left", both pass a check in the
-- application, and both insert. With it, the second waits for the first to finish and then
-- sees the reduced balance. The money is reserved BEFORE Cashfree is called, so a refund
-- that is in flight already counts.
--
-- Its errors are fixed strings that the application matches:
--
--   refund:no_order            no such order
--   refund:not_prepaid         cash on delivery has no payment to refund
--   refund:not_paid            nothing was paid, so nothing can come back
--   refund:bad_amount          not a positive whole number of paise
--   refund:exceeds:<paise>     more than is left; the number is what is left
--   refund:duplicate           this refund id was already used
--
-- ## Access
--
-- Service role only, like every table that holds order data: RLS on, and the table
-- privileges removed from anon and authenticated (the lesson of migrations 14 and 15). The
-- function is revoked from them explicitly rather than relying on default privileges,
-- because migration 15's default-privileges change is only as good as it having been run.

create table if not exists order_refunds (
  id uuid primary key default gen_random_uuid(),

  -- The id sent to Cashfree as `refund_id`. Unique, and derived from the form's one-time
  -- key, which is what makes a repeated submission a no-op.
  refund_id text not null unique,

  -- A financial record outlives the order's convenience: deleting an order that has refunds
  -- is refused rather than silently erasing them.
  order_id text not null references orders (id),

  -- The return this settles, when it was issued from a return. Cleared (not deleted) if the
  -- return row is ever removed.
  return_id uuid references returns (id) on delete set null,

  -- The Cashfree order that was actually paid. A payment retried through a fresh session
  -- is registered under a suffixed id, so this is not always the same as the order id.
  cashfree_order_id text not null,

  -- Cashfree's own id for the refund, once it has answered.
  cf_refund_id text,

  -- Paise. Positive; the upper bound is enforced by reserve_order_refund.
  amount integer not null check (amount > 0),

  status text not null default 'requested'
    check (status in ('requested', 'pending', 'onhold', 'success', 'failed', 'cancelled')),

  -- Why, in staff's words. Shown on the order, never to the customer.
  note text not null check (char_length(note) <= 200),

  -- Who pressed the button. The address rather than the id, so the record still reads
  -- correctly if the account is later removed.
  actor_email text not null,

  -- What Cashfree (or this system) said when it did not work.
  failure_reason text check (failure_reason is null or char_length(failure_reason) <= 300),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists order_refunds_order_id_idx on order_refunds (order_id);

-- The refunds still waiting on an answer, for "check status" and any future sweep.
create index if not exists order_refunds_open_idx
  on order_refunds (created_at)
  where status in ('requested', 'pending', 'onhold');

alter table order_refunds enable row level security;

revoke all on table order_refunds from anon, authenticated;

comment on table order_refunds is
  'Every refund issued on a prepaid order through Cashfree, with its outcome. Service-role only. The sum of requested/pending/onhold/success rows is what has been spent against orders.total.';
comment on column order_refunds.refund_id is
  'The refund_id sent to Cashfree. Unique, so the same form submitted twice cannot refund twice.';
comment on column order_refunds.cashfree_order_id is
  'The Cashfree order that was actually paid, which differs from the order id when payment was retried through a new session.';

create or replace function reserve_order_refund(
  p_order_id text,
  p_refund_id text,
  p_amount integer,
  p_note text,
  p_actor_email text,
  p_cashfree_order_id text,
  p_return_id uuid default null
)
returns order_refunds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders;
  v_spent integer;
  v_row order_refunds;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'refund:bad_amount';
  end if;

  -- Serialises every refund on this order. Held until the transaction ends.
  select * into v_order from orders where id = p_order_id for update;

  if not found then
    raise exception 'refund:no_order';
  end if;

  if v_order.payment_method = 'cod' then
    raise exception 'refund:not_prepaid';
  end if;

  if v_order.payment_status <> 'paid' then
    raise exception 'refund:not_paid';
  end if;

  -- Before the limit check, so a double click on "refund everything" answers "already
  -- submitted" rather than "nothing left", which would read as an error. The unique
  -- constraint below stays as the guarantee; this only chooses the better message.
  if exists (select 1 from order_refunds where refund_id = p_refund_id) then
    raise exception 'refund:duplicate';
  end if;

  select coalesce(sum(amount), 0) into v_spent
  from order_refunds
  where order_id = p_order_id
    and status in ('requested', 'pending', 'onhold', 'success');

  if v_spent + p_amount > v_order.total then
    raise exception 'refund:exceeds:%', greatest(v_order.total - v_spent, 0);
  end if;

  begin
    insert into order_refunds (
      refund_id, order_id, return_id, cashfree_order_id, amount, note, actor_email
    ) values (
      p_refund_id, p_order_id, p_return_id, p_cashfree_order_id, p_amount, p_note, p_actor_email
    )
    returning * into v_row;
  exception when unique_violation then
    raise exception 'refund:duplicate';
  end;

  return v_row;
end;
$$;

revoke execute on function reserve_order_refund(
  text, text, integer, text, text, text, uuid
) from public, anon, authenticated;

grant execute on function reserve_order_refund(
  text, text, integer, text, text, text, uuid
) to service_role;
