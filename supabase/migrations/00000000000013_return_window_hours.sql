-- PRESTINE — return window in hours
--
-- ## Why hours
--
-- The window was `return_window_days`, an integer. A 48-hour policy is not
-- expressible in it with any precision: "2 days" leaves open whether a parcel
-- delivered at 23:00 has until 23:00 two days later or until the end of that
-- day, and the answer decides whether a real customer's return is accepted or
-- refused. Hours removes the ambiguity, and the storefront copy renders them as
-- "48 hours" or "30 days" depending on the value, so a merchant who later wants
-- a month still reads naturally.
--
-- ## Why the old column stays
--
-- `return_window_days` is left in place, no longer read by the application. It
-- is one row of settings, so it costs nothing, and it is what makes the write
-- below safe: the previous policy stays legible afterwards instead of being
-- overwritten in the only place it was recorded. Dropping it is also the one
-- change here that could not be undone. A later migration can remove it once the
-- new window has been confirmed in production.

alter table settings
  add column if not exists return_window_hours integer not null default 48
    check (return_window_hours >= 0);

comment on column settings.return_window_hours is
  'How long after delivery a return may be raised, in hours. Enforced in createReturnRequest, not only shown in copy.';

comment on column settings.return_window_days is
  'DEPRECATED — superseded by return_window_hours in migration 13. No longer read by the application; retained so the pre-migration value is recoverable.';

/*
 * Set the policy to 48 hours.
 *
 * Not `return_window_days * 24`. Converting would land the shop on 720 hours and
 * leave the intended 48 to be typed into Settings afterwards — a step that can be
 * forgotten, and until it happens the window is enforced at the old length, which
 * is the opposite of the change being made here.
 *
 * Nothing is lost by writing it directly: the previous value stays readable in the
 * deprecated `return_window_days` column, so the old policy is recoverable. To
 * choose a different window, change it in Settings → Commerce; this migration sets
 * a starting point, it does not keep overwriting one.
 */
update settings
set return_window_hours = 48;
