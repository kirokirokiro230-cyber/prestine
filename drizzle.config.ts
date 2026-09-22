import "./scripts/env";
import { defineConfig } from "drizzle-kit";

/**
 * Migration tooling configuration.
 *
 * **This uses the direct connection.** `src/server/db/client.ts` uses that same
 * direct connection during local development, where one process owns one socket; in
 * serverless production it instead uses Supabase's transaction pooler on port 6543.
 * Migrations cannot use that pooler: they issue DDL and session-level statements that
 * only survive on a direct connection, so they always use port 5432 via `DIRECT_URL`.
 *
 * Getting these the wrong way round fails in two different confusing ways — migrations
 * that error on unsupported statements, or an application that exhausts the connection
 * limit under load. Hence two variables with two names.
 *
 * Usage:
 *   npm run db:generate   # write SQL from the schema into drizzle/
 *   npm run db:migrate    # apply it
 *   npm run db:studio     # browse the data
 */
export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    /**
     * `./scripts/env` above is what makes this work from `.env.local`. drizzle-kit reads
     * `.env` and nothing else, so without it every migration command would see an empty
     * string while `next dev` in the neighbouring terminal connected fine.
     *
     * Left as `""` rather than throwing when unset: `db:generate` writes SQL from the
     * schema and needs no connection at all, and refusing to load the config would break
     * that for no reason. `db:migrate` fails with the driver's own message.
     */
    url: process.env.DIRECT_URL ?? "",
  },
  /**
   * Generated SQL is committed and applied as files rather than pushed from the schema.
   * `drizzle-kit push` diffs the live database and rewrites it to match, which is fine
   * on a scratch database and unacceptable on one holding real orders — it will happily
   * drop a column to reconcile a difference. Reviewable SQL in version control is the
   * point.
   */
  strict: true,
  verbose: true,
});
