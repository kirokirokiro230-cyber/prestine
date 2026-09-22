import "./env.ts";
import postgres from "postgres";

const url = process.env.DIRECT_URL;
if (!url) throw new Error("DIRECT_URL missing");
const sql = postgres(url, { ssl: "require", prepare: false, max: 1, connect_timeout: 15 });

async function timed(label: string, query: Promise<unknown>) {
  const start = Date.now();
  try {
    const result = await query;
    console.log(`${label}: OK ${Date.now() - start}ms`);
    console.dir(result, { depth: 3 });
  } catch (error) {
    console.log(`${label}: FAILED ${Date.now() - start}ms`);
    console.dir(error, { depth: 3 });
  }
}

await timed("settings", sql`select * from public.settings`);
await timed("timeouts", sql`show statement_timeout`);
await timed("lock_timeout", sql`show lock_timeout`);
await timed("sessions", sql`
  select pid, usename, state, wait_event_type, wait_event,
         now() - query_start as query_age,
         left(query, 120) as query
  from pg_stat_activity
  where datname = current_database()
  order by query_start
`);
await timed("blocked", sql`
  select blocked.pid as blocked_pid,
         blocker.pid as blocker_pid,
         blocked.wait_event_type,
         blocked.wait_event,
         left(blocked.query, 100) as blocked_query,
         left(blocker.query, 100) as blocker_query
  from pg_stat_activity blocked
  join pg_locks blocked_locks on blocked_locks.pid = blocked.pid and not blocked_locks.granted
  join pg_locks blocker_locks on blocker_locks.locktype = blocked_locks.locktype
    and blocker_locks.database is not distinct from blocked_locks.database
    and blocker_locks.relation is not distinct from blocked_locks.relation
    and blocker_locks.page is not distinct from blocked_locks.page
    and blocker_locks.tuple is not distinct from blocked_locks.tuple
    and blocker_locks.virtualxid is not distinct from blocked_locks.virtualxid
    and blocker_locks.transactionid is not distinct from blocked_locks.transactionid
    and blocker_locks.classid is not distinct from blocked_locks.classid
    and blocker_locks.objid is not distinct from blocked_locks.objid
    and blocker_locks.objsubid is not distinct from blocked_locks.objsubid
    and blocker_locks.pid != blocked_locks.pid
    and blocker_locks.granted
  join pg_stat_activity blocker on blocker.pid = blocker_locks.pid
`);

await sql.end({ timeout: 5 });
