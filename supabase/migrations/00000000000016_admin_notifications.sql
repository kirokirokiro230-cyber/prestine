-- PRESTINE — admin notifications
--
-- Staff need to know when something happens to an order without having the orders page
-- open: a new order, a customer cancelling, a return, a payment that needs a refund, a
-- shipment that failed to book. This adds the two tables behind the bell in the admin
-- header.
--
-- ## admin_notifications
--
-- One row per event, shared by every admin. It is deliberately NOT one row per admin per
-- event: with a handful of staff that would multiply writes for no benefit, and the only
-- per-person state anyone needs is "what have I looked at", which is one timestamp.
--
-- `dedupe_key` is unique so an event that is delivered more than once produces one row.
-- Cashfree retries webhooks, the confirmation page polls the same settlement logic, and
-- the tracking sweep re-reads whole histories, so "this order was paid" arrives many
-- times. The writer says `on conflict do nothing` and the table keeps the first.
--
-- ## admin_notification_state
--
-- Each admin's "seen up to" watermark. Unread is simply `created_at > seen_at`, which
-- needs no per-notification read flag and so cannot drift out of step with one.
--
-- ## Access
--
-- Service role only, like every other table that holds order data. Nothing here is read
-- with the anon key, and the notifications carry customer names and order totals, so RLS
-- is enabled AND the table privileges are removed from anon/authenticated. RLS alone is
-- one control, and migration 14 existed because it is easy to forget on a new table.

create table if not exists admin_notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- What happened, as a stable machine-readable name, e.g. 'order.paid'.
  kind text not null,
  severity text not null check (severity in ('info', 'success', 'warning', 'critical')),

  title text not null check (char_length(title) <= 160),
  body text not null default '' check (char_length(body) <= 600),

  -- The order this is about, when there is one. Cascades so deleting a test order does
  -- not leave a notification pointing at nothing.
  order_id text references orders (id) on delete cascade,

  -- Where clicking it should go.
  href text,

  dedupe_key text unique
);

create index if not exists admin_notifications_created_at_idx
  on admin_notifications (created_at desc);

create table if not exists admin_notification_state (
  admin_id text primary key references admins (id) on delete cascade,
  seen_at timestamptz not null default now()
);

alter table admin_notifications enable row level security;
alter table admin_notification_state enable row level security;

revoke all on table admin_notifications, admin_notification_state from anon, authenticated;

comment on table admin_notifications is
  'Events staff should hear about (new order, cancellation, return, refund needed, shipment failure). Service-role only. Unique dedupe_key keeps retried deliveries to one row.';
comment on table admin_notification_state is
  'Per-admin read watermark. A notification is unread for an admin while its created_at is later than seen_at.';
