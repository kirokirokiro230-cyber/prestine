-- PRESTINE — where a return's refund should be sent
--
-- Returns had a reason, a status and a refund amount, but nowhere to record WHERE the
-- money goes. A cash-on-delivery order has no original payment to refund to, so its return
-- form asks for a UPI ID and this is where it is kept. A prepaid order is refunded through
-- Cashfree back to what it was paid with (migration 20), and is never asked for one.
--
-- ## Two columns, not one
--
-- `refund_upi_id` is the full ID, kept only while staff need it to send the money. Once a
-- return reaches a final state (refunded, rejected or cancelled) the application sets it
-- to null: a financial identifier has no business sitting in the database after the job it
-- was collected for is done.
--
-- `refund_upi_hint` is a masked copy, e.g. `ab••••@ybl`. It is what a customer is shown
-- ("we'll refund to ab••••@ybl") and what stays on the record afterwards, so there is
-- still a trace of where a refund went without keeping the whole handle.
--
-- ## Access
--
-- The `returns` table is service-role only (migrations 14 and 15), so the full ID is never
-- readable with the public key. Nothing else should copy it: not notifications, not the
-- audit log, not logs. The application keeps it out of all three.
--
-- ## One return per order
--
-- The application checked "is there already an open return?" and then inserted, which two
-- quick clicks can both pass. A partial unique index makes it a database guarantee: an
-- order can have at most one return that has not been cancelled. A cancelled return frees
-- the order to be returned again. This fails to create if two live returns already exist
-- for one order; the table was empty when this was written.

alter table returns
  add column if not exists refund_upi_id text
    check (refund_upi_id is null or char_length(refund_upi_id) <= 100),
  add column if not exists refund_upi_hint text
    check (refund_upi_hint is null or char_length(refund_upi_hint) <= 100);

comment on column returns.refund_upi_id is
  'Customer UPI ID to send the refund to. Cleared when the return is refunded, rejected or cancelled. Service-role only; never logged or put in notifications. See migration 19.';
comment on column returns.refund_upi_hint is
  'Masked UPI ID (e.g. ab••••@ybl) shown to the customer and kept after refund as a trace.';

create unique index if not exists returns_one_live_per_order_idx
  on returns (order_id)
  where status <> 'cancelled';
