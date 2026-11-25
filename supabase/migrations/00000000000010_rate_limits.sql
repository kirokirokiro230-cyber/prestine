-- PRESTINE — durable rate limiting
--
-- `src/server/login-attempts.ts` originally kept failed attempts in an
-- in-memory Map, which is correct on a single long-running process. On a
-- serverless host (Netlify, Vercel) it is not: every cold start begins with an
-- empty Map and concurrent instances never see each other's counts, so a
-- brute-force limiter becomes decoration precisely where it matters most.
--
-- This table is the shared backend. The sliding-window policy itself stays in
-- `src/lib/login-throttle.ts` and is unchanged — only where the timestamps
-- live moves.
--
-- Keys are opaque, namespaced strings chosen by the caller: `email:…`, `ip:…`,
-- `otp:…`, `contact:ip:…` and so on. The table holds one row per attempt
-- rather than a running counter, because the policy is a sliding window and
-- needs the individual timestamps to decide when the lock lifts.

create table if not exists rate_limit_hits (
  id bigserial primary key,
  -- Lower-cased by the caller, so a mixed-case address cannot buy a fresh
  -- allowance.
  key text not null,
  at timestamptz not null default now()
);

-- Every read is "the hits for this key inside the window", so the index leads
-- on key and orders by time.
create index if not exists rate_limit_hits_key_at_idx
  on rate_limit_hits (key, at desc);

-- Service-role only. No policy, so RLS denies everything else by default —
-- the same backstop every other non-public table gets in
-- `00000000000002_rls.sql`.
alter table rate_limit_hits enable row level security;

-- ---------------------------------------------------------------------------
-- Record one hit, and prune
-- ---------------------------------------------------------------------------
--
-- Pruning happens on write rather than on a schedule, for the reason the OTP
-- table does the same: a cleanup job someone has to remember exists is a
-- cleanup job that eventually is not running.
--
-- `p_window_seconds` comes from the caller so the retention horizon can never
-- drift from `WINDOW_MS` in the TypeScript policy.
create or replace function record_rate_limit_hit(
  p_key text,
  p_window_seconds integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into rate_limit_hits (key, at) values (lower(p_key), now());

  -- Sweep this key's expired rows, plus a bounded sweep of anything else that
  -- has aged out. Bounded so a busy key never pays for a full-table delete.
  delete from rate_limit_hits
  where key = lower(p_key)
    and at < now() - make_interval(secs => p_window_seconds);

  delete from rate_limit_hits
  where id in (
    select id from rate_limit_hits
    where at < now() - make_interval(secs => p_window_seconds)
    limit 500
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Read the hits inside the window
-- ---------------------------------------------------------------------------
create or replace function rate_limit_hits_in_window(
  p_key text,
  p_window_seconds integer
)
returns setof timestamptz
language sql
security definer
set search_path = public
as $$
  select at
  from rate_limit_hits
  where key = lower(p_key)
    and at >= now() - make_interval(secs => p_window_seconds)
  order by at;
$$;

-- ---------------------------------------------------------------------------
-- Clear a key, after a success
-- ---------------------------------------------------------------------------
create or replace function clear_rate_limit_hits(p_key text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from rate_limit_hits where key = lower(p_key);
$$;
