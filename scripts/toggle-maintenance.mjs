/**
 * Flip `maintenance_mode` on the store's settings row in Supabase.
 *
 * A convenience for verifying the closed-shop path without clicking through the
 * settings screen, and an escape hatch if the panel itself is ever unreachable.
 * `isStoreOffline()` (src/server/repositories/settings.ts) caches the flag for up to
 * ten seconds, so allow a few seconds for a running server to pick this up — no
 * restart needed, unlike the old JSON-store version of this script.
 *
 * Usage: node scripts/toggle-maintenance.mjs [on|off]
 *
 * Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local/.env. This is a
 * plain `.mjs` script (not run through the Next build), so it loads them itself
 * rather than importing `scripts/env.ts` — an ESM script cannot `import` a `.ts`
 * file without a loader, and adding one for a single script is not worth it. Talks
 * to PostgREST directly with plain `fetch` rather than `@supabase/supabase-js`, so
 * this script has no dependency on the app's TypeScript build either.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

for (const file of [".env.local", ".env"]) {
  const path = join(process.cwd(), file);
  if (!existsSync(path)) continue;

  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue; // first file wins, matches scripts/env.ts

    process.env[key] = trimmed.slice(eq + 1).trim();
  }
}

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.local).",
  );
  process.exit(1);
}

const argument = (process.argv[2] ?? "").toLowerCase();

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  "Content-Type": "application/json",
};

const current = await fetch(`${url}/rest/v1/settings?id=eq.true&select=maintenance_mode`, {
  headers,
});
if (!current.ok) {
  console.error(`Could not read the settings row: ${current.status} ${await current.text()}`);
  process.exit(1);
}

const [row] = await current.json();
if (!row) {
  console.error(
    "No settings row found. Run the migrations in supabase/migrations/ first — " +
      "00000000000004_seed.sql creates it.",
  );
  process.exit(1);
}

const next =
  argument === "on" ? true : argument === "off" ? false : !row.maintenance_mode;

const update = await fetch(`${url}/rest/v1/settings?id=eq.true`, {
  method: "PATCH",
  headers: { ...headers, Prefer: "return=minimal" },
  body: JSON.stringify({ maintenance_mode: next }),
});

if (!update.ok) {
  console.error(`Could not update the settings row: ${update.status} ${await update.text()}`);
  process.exit(1);
}

console.log(`maintenance_mode = ${next}`);
console.log("Takes effect within 10 seconds (the maintenance-flag cache TTL).");
