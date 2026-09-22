/**
 * Flip `maintenanceMode` in the store file.
 *
 * A convenience for verifying the closed-shop path without clicking through the
 * settings screen, and an escape hatch if the panel itself is ever unreachable.
 * The running server caches the store in memory, so restart it after this.
 *
 * Usage: node scripts/toggle-maintenance.mjs [on|off]
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const path = join(process.cwd(), process.env.PRESTINE_STORE_PATH ?? "data/store.json");
const argument = (process.argv[2] ?? "").toLowerCase();

let store;
try {
  store = JSON.parse(await readFile(path, "utf8"));
} catch {
  console.error(`No store at ${path}. Start the app once to seed it.`);
  process.exit(1);
}

const next =
  argument === "on" ? true : argument === "off" ? false : !store.settings.maintenanceMode;

store.settings.maintenanceMode = next;
await writeFile(path, JSON.stringify(store, null, 2), "utf8");

console.log(`maintenanceMode = ${next}`);
console.log("Restart the server for it to take effect.");
