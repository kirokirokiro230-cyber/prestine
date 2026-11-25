/**
 * Verify the Delhivery shipping pipeline for a real order without manifesting.
 *
 * Usage: npm run check:shipping -- PR-261014-224G
 *
 * Manifesting a shipment allocates an AWB and debits the Delhivery wallet, so
 * it cannot be used as a repeatable test. This runs every step either side of
 * that one call, against the live account, using only free read endpoints:
 *
 *   1. loads the order from the database
 *   2. resolves the default pickup location
 *   3. maps the order through the same buildShipmentInput() production uses
 *   4. runs the same validation the manifest call runs
 *   5. asks Delhivery whether the destination pincode is serviceable
 *   6. asks Delhivery what the shipment will cost
 *   7. prints the exact payload that would be POSTed
 *
 * If this passes, everything on our side is correct and the only untested step
 * is Delhivery accepting the payload.
 */

import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  process.env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
}

const orderId = process.argv[2];
if (!orderId) {
  console.error('Usage: npm run check:shipping -- <orderId>');
  process.exit(1);
}

const { getOrder } = await import('../src/server/repositories/orders');
const { getDefaultPickupLocation } = await import('../src/server/repositories/shipping');
const { buildShipmentInput } = await import('../src/lib/delhivery/build-shipment');
const { createOrderPayload } = await import('../src/lib/delhivery/utils/transformer');
const { validateShipmentInput } = await import('../src/lib/delhivery/endpoints/order');
const { getServiceabilityInfo } = await import('../src/lib/delhivery/endpoints/serviceability');
const { calculateShippingRate } = await import('../src/lib/delhivery/endpoints/pricing');
const { getDelhiveryClient } = await import('../src/lib/delhivery/client');
const { chargeableWeightGrams } = await import('../src/lib/delhivery/packaging');

const rupees = (paise: number) => `₹${(paise / 100).toFixed(2)}`;
const fail = (step: string, detail: string) => {
  console.log(`  FAIL  ${step}\n        ${detail}`);
  process.exit(1);
};
const pass = (step: string, detail = '') =>
  console.log(`  ok    ${step}${detail ? `\n        ${detail}` : ''}`);

console.log(`\nChecking shipping pipeline for ${orderId}`);
console.log(`environment: ${process.env.DELHIVERY_ENVIRONMENT}\n`);

// 1. Order
const order = await getOrder(orderId);
if (!order) fail('load order', `No order found with id ${orderId}`);
pass(
  'load order',
  `${order!.shippingAddress.name}, ${order!.shippingAddress.city} — payment ${order!.paymentStatus}, total ${rupees(order!.totals.total)}`
);

// 2. Pickup location
const pickupLocation = await getDefaultPickupLocation();
if (!pickupLocation) fail('resolve pickup location', 'No default pickup location configured');
pass('resolve pickup location', `${pickupLocation!.name} (${pickupLocation!.pincode})`);

// 3. Map to Delhivery's shape
const input = buildShipmentInput(order!, pickupLocation!);
const packed = { weightGrams: input.weightGrams, dimensions: input.dimensions! };
pass(
  'build shipment input',
  `${input.quantity} piece(s), ${input.weightGrams} g dead, ` +
    `${input.dimensions!.length}x${input.dimensions!.width}x${input.dimensions!.height} cm, ` +
    `~${chargeableWeightGrams(packed)} g chargeable, ${input.paymentMode}`
);

// 4. Validation — the same check the manifest call performs
try {
  validateShipmentInput(input);
  pass('validate payload');
} catch (error) {
  fail('validate payload', error instanceof Error ? error.message : String(error));
}

const client = getDelhiveryClient();

// 5. Serviceability
try {
  const info = await getServiceabilityInfo(client, input.customerPincode);
  if (!info.serviceable) {
    fail(
      'serviceability',
      `Delhivery reports ${input.customerPincode} as not serviceable (prepaid ${info.prepaid}, cod ${info.cod})`
    );
  }
  pass(
    'serviceability',
    `${info.pincode}: prepaid ${info.prepaid ? 'Y' : 'N'}, cod ${info.cod ? 'Y' : 'N'}, reverse pickup ${info.reversePickup ? 'Y' : 'N'}${info.isOda ? ', ODA (surcharge)' : ''}`
  );
} catch (error) {
  fail('serviceability', error instanceof Error ? error.message : String(error));
}

// 6. Cost
try {
  const rate = await calculateShippingRate(client, {
    originPincode: pickupLocation!.pincode,
    destinationPincode: input.customerPincode,
    weightGrams: input.weightGrams,
    dimensions: input.dimensions,
    paymentMode: input.paymentMode,
    codAmount: input.codAmount,
    shippingMode: input.shippingMode,
  });
  pass(
    'rate quote',
    `${rupees(rate.totalAmount)} total (${rupees(rate.freightCharges)} freight) — this is what manifesting will debit`
  );
} catch (error) {
  fail('rate quote', error instanceof Error ? error.message : String(error));
}

// 7. The payload itself
const payload = createOrderPayload(
  input,
  pickupLocation!.name,
  process.env.DELHIVERY_CLIENT_NAME
);

console.log('\nPayload that would be sent to /api/cmu/create.json:\n');
console.log(JSON.stringify(payload, null, 2));
console.log('\nAll checks passed. Not manifested — no AWB pulled, no wallet debit.\n');
