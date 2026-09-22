import { mkdirSync, writeFileSync } from "node:fs";
import "./env.ts";
import postgres from "postgres";

/**
 * One-off pre-migration backup.
 *
 * Not `pg_dump` (not installed on this machine) — a full row-level JSON export of
 * every table via the existing `postgres` driver, taken before the Supabase Auth/RLS
 * migration touches schema or data. Good enough to restore by hand or diff against
 * post-migration; delete once the migration is verified and no longer needed.
 */

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing");

const sql = postgres(url, { ssl: "require", prepare: false, max: 1, connect_timeout: 15 });

const TABLES = [
  "admins",
  "audit_log",
  "banners",
  "categories",
  "collections",
  "customers",
  "email_log",
  "email_templates",
  "hidden_reviews",
  "login_attempts",
  "order_lines",
  "orders",
  "phone_verifications",
  "product_collections",
  "product_colors",
  "product_sizes",
  "products",
  "promo_codes",
  "settings",
  "submitted_reviews",
];

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dir = `backups/${stamp}`;
mkdirSync(dir, { recursive: true });

let totalRows = 0;
for (const table of TABLES) {
  const rows = await sql.unsafe(`select * from ${table}`);
  writeFileSync(`${dir}/${table}.json`, JSON.stringify(rows, null, 2));
  console.log(`${table}: ${rows.length} rows`);
  totalRows += rows.length;
}

console.log(`\nBackup complete: ${dir} (${totalRows} rows across ${TABLES.length} tables)`);
await sql.end({ timeout: 5 });
