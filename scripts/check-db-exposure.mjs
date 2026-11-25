/**
 * What can the PUBLIC anon key reach in the live database?
 *
 * Usage: npm run check:db-exposure
 *
 * Reads SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY from .env.local/.env, then
 * behaves as a stranger who has copied the anon key out of a page — which Supabase
 * treats as a public value — and tries to read sensitive tables and to execute the
 * database functions that move money and fulfilment.
 *
 * Why this exists: every server path in the app is guarded, but the database sits
 * behind a second door that is open by default. `revoke ... from public` does not remove
 * the EXECUTE grants Supabase gives `anon` directly, so for a long time `mark_order_paid`
 * could be called with only the anon key, bypassing Cashfree. A check that never touches
 * the application cannot be fooled by the application being correct.
 *
 * Safe to run against production:
 * - It never writes. Table checks are SELECTs with limit 1.
 * - Function checks pass ids that cannot exist, so a callable function updates zero
 *   rows or raises "not found".
 *
 * Exit code 1 if anything is exposed, so it can gate a deploy.
 */
import { existsSync, readFileSync } from "node:fs";

const env = {};
for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].trim();
  }
}

const url = process.env.SUPABASE_URL ?? env.SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.error("SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must both be set.");
  process.exit(1);
}

let exposed = 0;
const fail = (label, detail) => {
  exposed += 1;
  console.log(`EXPOSED  ${label}  — ${detail}`);
};
const ok = (label, detail) => console.log(`ok       ${label}  — ${detail}`);

const headers = { apikey: anon, Authorization: `Bearer ${anon}` };

/* ---- Tables that must never be readable with the anon key ---------------- */

const PRIVATE_TABLES = [
  "admins",
  "customers",
  "phone_verifications",
  "orders",
  "order_lines",
  "order_notes",
  "audit_log",
  "email_templates",
  "email_log",
  "hidden_reviews",
  "pickup_locations",
  "shipping_info",
  "shipping_scans",
  "returns",
  "rate_limit_hits",
  // Customer names and order totals, in the notification text.
  "admin_notifications",
  "admin_notification_state",
  // Read through the server only, so unpublished looks and draft products are filtered
  // in one place rather than two.
  "style_looks",
  "style_look_products",
  // Who was refunded how much, and why.
  "order_refunds",
  // Identity keys (email, phone) of everyone who used the first-order discount.
  "first_order_claims",
];

console.log("— tables (anon SELECT) —");
for (const table of PRIVATE_TABLES) {
  const response = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, { headers });
  const text = await response.text();

  if (response.status !== 200) {
    ok(table, `refused (${response.status})`);
    continue;
  }

  let rows = [];
  try {
    rows = JSON.parse(text);
  } catch {
    // Not JSON; treat as refused.
  }

  // A 200 with rows is a leak. A 200 with none is RLS filtering everything, which is
  // safe but is a single control — migration 15 removes the privilege as well.
  if (rows.length > 0) fail(table, `returned ${rows.length} row(s) with ${Object.keys(rows[0]).length} columns`);
  else ok(table, "no rows visible (RLS only — run migration 15 to also remove the privilege)");
}

/* ---- Functions that must never be executable with the anon key ------------ */

const NONE = "DB-EXPOSURE-CHECK-NO-SUCH-ROW";

const FUNCTIONS = [
  ["mark_order_paid", { p_order_id: NONE, p_cashfree_payment_id: "check" }],
  ["mark_order_payment_failed", { p_order_id: NONE }],
  ["mark_cod_order_collected", { p_order_id: NONE }],
  ["update_order_status", { p_order_id: NONE, p_next_status: "shipped" }],
  ["cancel_order_as_customer", { p_order_id: NONE, p_reason: "check" }],
  ["increment_verification_attempts", { p_id: NONE }],
  ["update_shipment_status", { p_waybill: NONE, p_status: "check" }],
  ["shipments_awaiting_tracking", { p_limit: 1, p_stale_minutes: 0 }],
  ["rate_limit_hits_in_window", { p_key: "__db_exposure_check__", p_window_seconds: 60 }],
  ["clear_rate_limit_hits", { p_key: "__db_exposure_check__" }],
  // Reserves refund money against an order. With an order that cannot exist it would
  // raise "no_order", so a callable function still writes nothing.
  [
    "reserve_order_refund",
    {
      p_order_id: NONE,
      p_refund_id: "rf_db_exposure_check",
      p_amount: 1,
      p_note: "check",
      p_actor_email: "check@example.com",
      p_cashfree_order_id: NONE,
    },
  ],
  // The discount functions. The claim call passes no keys, which a callable function
  // answers with 'invalid' and writes nothing; the release names an order that cannot exist.
  ["first_order_discount_status", { p_keys: ["c:db-exposure-check"], p_order_id: NONE }],
  ["claim_first_order_discount", { p_keys: [], p_order_id: NONE, p_discount: 1 }],
  ["release_first_order_claim", { p_order_id: NONE }],
];

console.log("\n— functions (anon EXECUTE, ids that cannot exist) —");
for (const [name, args] of FUNCTIONS) {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await response.text();

  const denied =
    response.status === 401 ||
    response.status === 403 ||
    /42501|permission denied/i.test(text);
  const notExposed = response.status === 404 && /PGRST202|could not find/i.test(text);

  if (denied) ok(name, `refused (${response.status})`);
  else if (notExposed) ok(name, "not exposed over the API");
  else fail(name, `executed with the anon key (status ${response.status})`);
}

console.log(
  `\n${exposed === 0 ? "NOTHING EXPOSED" : `${exposed} THING(S) EXPOSED to the public anon key`}`,
);
process.exit(exposed === 0 ? 0 : 1);
