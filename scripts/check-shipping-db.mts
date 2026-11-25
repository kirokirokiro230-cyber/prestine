/**
 * Verify the shipping and rate-limit schema is actually applied.
 *
 * Usage: npm run check:shipping-db
 *
 * A missing migration is quiet in this app by design — the rate limiter fails
 * open and the tracking sweep reports an error rather than taking the site down.
 * That is the right behaviour at runtime and a bad way to find out, so this
 * names every table and function the shipping stack depends on and says which
 * are present.
 *
 * Read-only apart from one rate-limit hit against a throwaway key, which it
 * clears again.
 */

import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  process.env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
}

const { createClient } = await import('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  process.exit(1);
}

const sb = createClient(url, key);

let missing = 0;

function report(label: string, ok: boolean, detail = '') {
  if (!ok) missing += 1;
  console.log(`  ${ok ? 'ok     ' : 'MISSING'} ${label.padEnd(30)} ${detail}`);
}

console.log('\nTables');
for (const table of [
  'rate_limit_hits',
  'pickup_locations',
  'shipping_info',
  'shipping_scans',
  'returns',
]) {
  const { error, count } = await sb
    .from(table)
    .select('*', { count: 'exact', head: true });
  report(table, !error, error ? error.message : `${count} row(s)`);
}

/*
 * Columns are probed with a real select rather than `head: true`.
 *
 * A HEAD request does not validate the column list — PostgREST answers it
 * without error even for a column that does not exist, which made an earlier
 * version of this script report a missing migration as present. A false "ok" in
 * a schema checker is worse than having no checker, so these cost one row each.
 */
async function reportColumns(label: string, table: string, columns: string, note: string) {
  const { error } = await sb.from(table).select(columns).limit(1);
  report(label, !error, error ? note : '');
}

console.log('\nColumns');
await reportColumns(
  'orders.shipping_status',
  'orders',
  'shipping_status, expected_delivery_date',
  'migration 8 not applied',
);
await reportColumns(
  'orders.payment_method/cod_fee',
  'orders',
  'payment_method, cod_fee',
  'migration 12 not applied — CHECKOUT WILL FAIL',
);
await reportColumns(
  'settings COD columns',
  'settings',
  'cod_enabled, cod_fee, cod_min_order, cod_max_order',
  'migration 12 not applied',
);

console.log('\nFunctions');
const probes: Array<[string, Record<string, unknown>]> = [
  ['record_rate_limit_hit', { p_key: '_schemacheck', p_window_seconds: 900 }],
  ['rate_limit_hits_in_window', { p_key: '_schemacheck', p_window_seconds: 900 }],
  ['clear_rate_limit_hits', { p_key: '_schemacheck' }],
  ['shipments_awaiting_tracking', { p_limit: 1, p_stale_minutes: 0 }],
];

for (const [name, args] of probes) {
  const { error } = await sb.rpc(name, args);
  report(name, !error, error ? error.message.split('\n')[0] : '');
}

// The expected-delivery parameter only exists after migration 11.
{
  const { error } = await sb.rpc('update_shipment_status', {
    p_waybill: '__schemacheck__',
    p_status: 'probe',
    p_expected_delivery_date: null,
  });
  report(
    'update_shipment_status(+eta)',
    !error,
    error ? 'migration 11 not applied' : '',
  );
}

/*
 * Migration 12. Checkout passes p_payment_method and p_cod_fee on every order,
 * so if this signature is missing, placing an order fails outright — the most
 * consequential of these checks.
 */
{
  const { error } = await sb.rpc('mark_cod_order_collected', {
    p_order_id: '__schemacheck__',
  });
  report('mark_cod_order_collected', !error, error ? 'migration 12 not applied' : '');
}



console.log('\nCOD configuration');
{
  const { data, error } = await sb
    .from('settings')
    .select('currency, cod_enabled, cod_fee, cod_min_order, cod_max_order')
    .eq('id', true)
    .single();

  if (error) {
    console.log('  unavailable until migration 12 is applied');
  } else if (data) {
    const amount = (minor: number) => `${data.currency} ${(minor / 100).toFixed(2)}`;
    console.log(`  enabled:  ${data.cod_enabled ? 'yes' : 'no'}`);
    console.log(`  fee:      ${amount(data.cod_fee)}${data.cod_fee === 0 ? ' (absorbed)' : ''}`);
    console.log(
      `  minimum:  ${data.cod_min_order === 0 ? 'none' : amount(data.cod_min_order)}`,
    );
    console.log(
      `  maximum:  ${data.cod_max_order === 0 ? 'none' : amount(data.cod_max_order)}`,
    );
  }
}

console.log('\nPickup location');
const { data: pickups } = await sb
  .from('pickup_locations')
  .select('name, city, pincode, is_default, is_active');
for (const p of pickups ?? []) {
  console.log(
    `  ${p.name} — ${p.city} ${p.pincode}` +
      `${p.is_default ? ' [default]' : ''}${p.is_active ? '' : ' [INACTIVE]'}`,
  );
}
if (!pickups || pickups.length === 0) console.log('  none configured');

console.log('\nShipments');
const { data: shipments } = await sb
  .from('shipping_info')
  .select('waybill, order_id, status, shipment_type, picked_up_at, delivered_at')
  .order('created_at', { ascending: false })
  .limit(10);
if (!shipments || shipments.length === 0) console.log('  none');
for (const s of shipments ?? []) {
  console.log(
    `  ${s.waybill}  ${s.order_id}  ${s.shipment_type}  ` +
      `${s.status ?? '(no status)'}` +
      `${s.picked_up_at ? '  picked' : ''}${s.delivered_at ? '  delivered' : ''}`,
  );
}

console.log('\nOrders with a shipment');
const { data: orders } = await sb
  .from('orders')
  .select('id, status, shipping_status, tracking_number, carrier')
  .not('tracking_number', 'is', null)
  .order('placed_at', { ascending: false })
  .limit(10);
if (!orders || orders.length === 0) console.log('  none');
for (const o of orders ?? []) {
  console.log(
    `  ${o.id}  order=${o.status}  courier=${o.shipping_status ?? '-'}  ` +
      `${o.carrier ?? 'NO CARRIER'} ${o.tracking_number}`,
  );
}

const { count: scanCount } = await sb
  .from('shipping_scans')
  .select('*', { count: 'exact', head: true });
console.log(`\nScans recorded: ${scanCount ?? 0}`);

if (missing > 0) {
  console.log(
    `\n${missing} object(s) missing. Run the migrations in supabase/migrations/ ` +
      'against your project, in filename order.\n',
  );
  process.exit(1);
}

console.log('\nSchema is complete.\n');
