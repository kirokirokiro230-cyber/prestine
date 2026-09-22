import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * The database connection.
 *
 * ## Which connection string to use — this is the part that costs people hours
 *
 * Supabase exposes the same database through two connection modes, and they serve
 * different runtimes:
 *
 * - **6543, the transaction pooler (`DATABASE_URL`).** Used in production. A serverless
 *   function may be created and destroyed per request, so it cannot hold a real Postgres
 *   connection — with a few hundred concurrent invocations the database's connection
 *   limit is gone. The pooler hands out a connection for one transaction and takes it
 *   straight back.
 * - **5432, direct (`DIRECT_URL`).** Used by `drizzle-kit`, seed scripts, and local
 *   development. A local dev server is one long-running process with one socket, so it
 *   does not need transaction pooling and avoids the pooler's extra hop/stale-session
 *   failure mode. See `drizzle.config.ts`.
 *
 * `prepare: false` is mandatory on 6543. Transaction-mode pooling gives a different
 * backend connection each time, so a prepared statement cached against the previous one
 * is not there any more — the symptom is intermittent "prepared statement does not
 * exist" errors under load, which is a miserable thing to debug in production.
 *
 * ## Why one connection object survives a serverless invocation
 *
 * The module is cached on `globalThis`. Netlify reuses a warm function instance for
 * consecutive requests, and without this every request would open a fresh socket and a
 * fresh TLS handshake — the single largest avoidable latency in this app. In
 * development it also stops hot reload leaking a connection per edit until the pooler
 * refuses new ones.
 */

function connectionString(): string {
  /**
   * Local development prefers the direct connection.
   *
   * Supabase's transaction pooler is the right answer for serverless production, but
   * it adds another network hop and can hand a long-running local dev process a stale
   * pooled session. The symptom is especially confusing: a one-row SELECT is cancelled
   * by `statement_timeout`, then every page query queues behind the bad session and the
   * browser appears to load forever. A local dev server is one process with one socket,
   * so it neither needs nor benefits from transaction pooling.
   *
   * Production still uses `DATABASE_URL` exclusively. That keeps the connection budget
   * safe when many serverless instances exist at once, while `DIRECT_URL` remains local
   * and migration-only there.
   */
  const isProduction = process.env.NODE_ENV === "production";
  const url = isProduction
    ? process.env.DATABASE_URL
    : process.env.DIRECT_URL || process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      "No database connection is configured. Set DIRECT_URL for local development and " +
        "DATABASE_URL to the Supabase transaction pooler URL (port 6543) for production — " +
        "see .env.example.",
    );
  }

  /**
   * A misconfiguration that otherwise only shows up as sporadic failures under
   * concurrency, long after deploy. Cheaper to refuse at boot with an explanation.
   */
  if (isProduction && url.includes(":5432")) {
    throw new Error(
      "DATABASE_URL points at port 5432 (direct). Serverless needs the transaction " +
        "pooler on 6543, or the database will run out of connections. Port 5432 is for " +
        "migrations and local development only.",
    );
  }

  return url;
}

/**
 * Held on `globalThis` rather than a module-level `const`.
 *
 * A module-level value is per module registry, and both hot reload and the serverless
 * runtime can produce more than one of those. `globalThis` is the one thing they share.
 */
const globalForDb = globalThis as unknown as {
  prestineSql?: ReturnType<typeof postgres>;
  prestineDb?: ReturnType<typeof drizzle<typeof schema>>;
};

function client(): ReturnType<typeof postgres> {
  if (globalForDb.prestineSql) return globalForDb.prestineSql;

  const sql = postgres(connectionString(), {
    // See above. Non-negotiable on the transaction pooler.
    prepare: false,

    /**
     * One socket per function instance. Netlify runs one request at a time per
     * instance, so a larger pool would sit idle while still counting against the
     * project's connection budget — and the budget, not this process, is the scarce
     * resource.
     */
    max: 1,

    /**
     * Close an idle socket rather than holding it for the life of a warm instance. The
     * pooler can then give it to another function; a shop that is quiet for a minute
     * should not be occupying a connection.
     */
    idle_timeout: 20,

    /**
     * Fail fast. A request that cannot get a connection should return an error the page
     * can handle, not sit until the platform's own timeout kills it with no useful log.
     */
    connect_timeout: 10,

    /**
     * Supabase terminates TLS with a certificate this client cannot chain to a root it
     * ships with. The connection is still encrypted; what is skipped is verifying the
     * server's identity, which is acceptable only because the host is pinned in the
     * configured database URL and the path to it is inside the platform's network.
     */
    ssl: "require",
  });

  globalForDb.prestineSql = sql;
  return sql;
}

/**
 * True when a database is configured.
 *
 * Lets a caller choose a backend without catching an exception to find out. Used by the
 * pieces that have a working non-database path — login throttling falls back to an
 * in-process limiter, and the local development store is still a JSON file.
 */
export function isDatabaseConfigured(): boolean {
  if (process.env.NODE_ENV === "production") {
    return Boolean(process.env.DATABASE_URL);
  }
  return Boolean(process.env.DIRECT_URL || process.env.DATABASE_URL);
}

export type Database = ReturnType<typeof drizzle<typeof schema>>;

/**
 * The Drizzle instance. Call this, do not import a module-level constant.
 *
 * Construction is deferred on purpose. Building the client at import time means the
 * *act of importing* this module throws when `DATABASE_URL` is absent, which takes down
 * every route that transitively reaches it — including the ones that do not need a
 * database at all, and including the test suite. A function makes the connection happen
 * at the point of first use, where the failure is attributable and catchable.
 *
 * `schema` is passed so the relational query API is available: a listing page can load
 * thirty products with their colourways, sizes and collections in one round trip instead
 * of a query per product per table.
 */
export function getDb(): Database {
  globalForDb.prestineDb ??= drizzle(client(), { schema });
  return globalForDb.prestineDb;
}

/** Every table, for the repositories and the seed script. */
export { schema };
