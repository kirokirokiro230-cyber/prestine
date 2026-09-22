import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { beforeAll, describe, it, vi } from "vitest";

// `revalidatePath` only exists inside a Next request. The action calls it after a
// successful write, so it is stubbed rather than the test being shaped around it.
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

/*
 * `cookies()` is the same story: it only exists inside a request. `placeOrder` reads the
 * customer session to stamp the order's `customerId`, and with no request scope that read
 * throws before any pricing runs. An empty cookie store makes `currentCustomer()` return
 * null, which is exactly the "session lapsed between the gate and the submit" path the
 * action guards for with `?.` — the order then falls back to email-only linkage, which is
 * correct for these tests, whose subject is the money and the record, not who was signed in.
 */
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

const { placeOrder } = await import("@/app/actions/checkout");
const { getOrder } = await import("@/server/repositories/orders");
const { createProduct, getProduct, setProductStatus } = await import(
  "@/server/repositories/products"
);
const { createPromoCode, updateSettings } = await import(
  "@/server/repositories/settings"
);
const { updateEmailTemplate } = await import("@/server/repositories/email");

/**
 * Order placement is the trust boundary: the browser says what it wants, the server
 * decides what it costs. These tests exist to prove the client cannot influence the
 * money, and that an invalid request is refused whole rather than in part.
 */

beforeAll(async () => {
  const path = ".test-store/place-order.json";
  process.env.PRESTINE_STORE_PATH = path;

  // Start from a fresh store, or promo usage counters carry over
  // from the previous run and the assertions drift. See repositories.test.ts.
  rmSync(path, { force: true });

  /*
   * Silence the confirmation email. These tests are about the money and the record
   * `placeOrder` writes; the send is exercised properly in email.test.ts and
   * email-queue.test.ts. Switching the template off makes the dispatcher return before it
   * renders anything, which keeps these assertions fast and the output free of a
   * "no provider configured" line per order.
   */
  await updateEmailTemplate("order-confirmation", {
    enabled: false,
    subject: "Disabled for tests",
    heading: "",
    body: "",
  });
});

const ADDRESS = {
  name: "Test Buyer",
  phone: "+44 20 7946 0102",
  line1: "1 Test Street",
  city: "London",
  region: "Greater London",
  postalCode: "e1 6an",
  country: "United Kingdom",
};

async function seedProduct(name: string, price: number) {
  const product = await createProduct({
    slug: "",
    name,
    tagline: "A test piece.",
    department: "unisex",
    category: "knitwear",
    collections: [],
    price,
    sizeSystem: "alpha",
    colors: [{ id: "bone", name: "Bone", hex: "#EFEAE0" }],
    sizes: [{ label: "S" }, { label: "M" }],
    description: "Test description.",
    details: [],
    composition: "100% test",
    care: [],
    fitNote: "True to size.",
    origin: "Made in a test.",
    releasedAt: new Date().toISOString(),
    popularity: 1,
    costPrice: Math.round(price * 0.4),
    weightGrams: 400,
  } as Parameters<typeof createProduct>[0]);

  await setProductStatus([product.id], "active");
  return product;
}

function request(
  items: Array<{ productId: string; colorId: string; size: string; quantity: number }>,
  overrides: Partial<Parameters<typeof placeOrder>[0]> = {},
) {
  return placeOrder({
    email: "buyer@prestine.test",
    address: ADDRESS,
    items,
    ...overrides,
  });
}

describe("placeOrder — pricing", () => {
  it("prices from the store, not from the request", async () => {
    const product = await seedProduct("Test Priced Item", 20000);

    const result = await request([
      { productId: product.id, colorId: "bone", size: "S", quantity: 2 },
    ]);
    assert.equal(result.ok, true);
    assert.ok(result.ok);

    const order = await getOrder(result.orderId);
    assert.ok(order);
    // 2 x 20000 = 40000, regardless of anything the browser believed.
    assert.equal(order.totals.subtotal, 40000);
    assert.equal(order.lines[0].unitPrice, 20000);
  });

  it("applies the store's live tax rate and shipping threshold", async () => {
    await updateSettings({
      taxRate: 0.1,
      freeShippingThreshold: 50000,
      standardShippingRate: 1000,
    });

    const product = await seedProduct("Test Tax Item", 10000);

    // 10000 subtotal, below the 50000 threshold: standard shipping is charged.
    const below = await request([
      { productId: product.id, colorId: "bone", size: "S", quantity: 1 },
    ]);
    assert.ok(below.ok);
    const belowOrder = (await getOrder(below.orderId))!;
    assert.equal(belowOrder.totals.shipping, 1000, "charged the wrong standard rate");
    assert.equal(belowOrder.totals.tax, 1000, "did not use the live tax rate");
    assert.equal(belowOrder.totals.total, 10000 + 1000 + 1000);

    // 60000 subtotal, at or above the threshold: standard shipping is free.
    const above = await request([
      { productId: product.id, colorId: "bone", size: "S", quantity: 6 },
    ]);
    assert.ok(above.ok);
    const aboveOrder = (await getOrder(above.orderId))!;
    assert.equal(aboveOrder.totals.shipping, 0, "did not honour the free-shipping threshold");
    assert.equal(aboveOrder.totals.tax, 6000);
  });

  it("only records a promo code that actually discounted the order", async () => {
    await updateSettings({ taxRate: 0.08, freeShippingThreshold: 20000, standardShippingRate: 900 });
    await createPromoCode({
      code: "TESTPLACE20",
      description: "20% off",
      percentOff: 20,
    });

    const product = await seedProduct("Test Promo Item", 30000);

    const applied = await request(
      [{ productId: product.id, colorId: "bone", size: "S", quantity: 1 }],
      { promoCode: "testplace20" },
    );
    assert.ok(applied.ok);
    const discounted = (await getOrder(applied.orderId))!;
    assert.equal(discounted.totals.discount, 6000);
    assert.equal(discounted.promoCode, "TESTPLACE20");

    // An unknown code is ignored rather than failing the order or being recorded.
    const bogus = await request(
      [{ productId: product.id, colorId: "bone", size: "S", quantity: 1 }],
      { promoCode: "NOT-A-REAL-CODE" },
    );
    assert.ok(bogus.ok);
    const undiscounted = (await getOrder(bogus.orderId))!;
    assert.equal(undiscounted.totals.discount, 0);
    assert.equal(undiscounted.promoCode, undefined);
  });
});

/**
 * The per-line cap.
 *
 * There is no inventory, so nothing here is about availability — an order can never be
 * refused for being short. What remains worth pinning down is the one quantity limit
 * that does exist, and that it cannot be evaded by splitting a variant across lines.
 */
describe("placeOrder — quantity limits", () => {
  it("accepts any quantity up to the cap", async () => {
    const product = await seedProduct("Test Quantity", 15000);

    const result = await request([
      { productId: product.id, colorId: "bone", size: "S", quantity: 10 },
    ]);
    assert.ok(result.ok);
  });

  it("merges duplicate variants so the per-line cap cannot be split", async () => {
    const product = await seedProduct("Test Merge", 10000);

    // 6 + 6 = 12, above the cap of 10 for a single variant.
    const result = await request([
      { productId: product.id, colorId: "bone", size: "S", quantity: 6 },
      { productId: product.id, colorId: "bone", size: "S", quantity: 6 },
    ]);

    assert.equal(result.ok, false);
    assert.ok(!result.ok);
    assert.match(result.error, /maximum of 10/);
  });

  it("lets the same piece be ordered repeatedly", async () => {
    // Deliberate: fulfilment is manual and nothing is finite, so five concurrent
    // orders for the same size all succeed. This is the behaviour that replaced
    // oversell protection — if it ever starts failing, inventory has crept back in.
    const product = await seedProduct("Test Repeat Order", 10000);

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        request([{ productId: product.id, colorId: "bone", size: "S", quantity: 1 }]),
      ),
    );

    assert.equal(results.filter((result) => result.ok).length, 5);
  });
});

describe("placeOrder — validation", () => {
  it("rejects an empty bag", async () => {
    const result = await request([]);
    assert.equal(result.ok, false);
    assert.ok(!result.ok);
    assert.match(result.error, /bag is empty/i);
  });

  it("rejects a bad email and an incomplete address", async () => {
    const product = await seedProduct("Test Validation", 10000);
    const items = [{ productId: product.id, colorId: "bone", size: "S", quantity: 1 }];

    const badEmail = await request(items, { email: "not-an-email" });
    assert.equal(badEmail.ok, false);

    const badAddress = await request(items, {
      address: { ...ADDRESS, city: "  " },
    });
    assert.equal(badAddress.ok, false);
    assert.ok(!badAddress.ok);
    assert.match(badAddress.error, /City is required/);
  });

  it("rejects unknown products, colourways and sizes", async () => {
    const product = await seedProduct("Test Unknowns", 10000);

    const noProduct = await request([
      { productId: "p-nope", colorId: "bone", size: "S", quantity: 1 },
    ]);
    assert.equal(noProduct.ok, false);

    const noColor = await request([
      { productId: product.id, colorId: "not-a-colour", size: "S", quantity: 1 },
    ]);
    assert.equal(noColor.ok, false);
    assert.ok(!noColor.ok);
    assert.match(noColor.error, /colourway/);

    const noSize = await request([
      { productId: product.id, colorId: "bone", size: "XXXL", quantity: 1 },
    ]);
    assert.equal(noSize.ok, false);
    assert.ok(!noSize.ok);
    assert.match(noSize.error, /no longer offered/);
  });

  it("refuses to sell a draft or archived product", async () => {
    const product = await seedProduct("Test Unpublished", 10000);
    await setProductStatus([product.id], "draft");

    const result = await request([
      { productId: product.id, colorId: "bone", size: "S", quantity: 1 },
    ]);
    assert.equal(result.ok, false);

    // And it must stay a draft — a rejected order must not publish anything.
    const after = await getProduct(product.id);
    assert.equal(after!.status, "draft");
  });

  it("rejects fractional and non-positive quantities", async () => {
    const product = await seedProduct("Test Quantities", 10000);

    for (const quantity of [0, -1, 1.5, Number.NaN]) {
      const result = await request([
        { productId: product.id, colorId: "bone", size: "S", quantity },
      ]);
      assert.equal(result.ok, false, `accepted a quantity of ${quantity}`);
    }
  });
});

describe("placeOrder — the record it writes", () => {
  it("stores only the last four card digits, normalised", async () => {
    const product = await seedProduct("Test Card", 10000);

    const result = await request(
      [{ productId: product.id, colorId: "bone", size: "S", quantity: 1 }],
      { cardLast4: "4242 4242 4242 4111" },
    );
    assert.ok(result.ok);

    const order = (await getOrder(result.orderId))!;
    assert.equal(order.cardLast4, "4111");

    // Nothing anywhere on the record may resemble a full card number.
    assert.doesNotMatch(JSON.stringify(order), /\d{13,19}/);
  });

  it("normalises the email it saves and writes only the collected address fields", async () => {
    const product = await seedProduct("Test Normalise", 10000);

    const result = await request(
      [{ productId: product.id, colorId: "bone", size: "S", quantity: 1 }],
      { email: "  Buyer@Prestine.TEST " },
    );
    assert.ok(result.ok);

    const order = (await getOrder(result.orderId))!;
    assert.equal(order.email, "buyer@prestine.test");

    /*
     * Checkout collects five fields. The legacy keys are still readable on historical
     * orders, so the guarantee worth asserting is that nothing writes them any more —
     * a fixture carrying `postalCode` and `country` must not have them persisted.
     */
    assert.equal(order.shippingAddress.postalCode, undefined);
    assert.equal(order.shippingAddress.country, undefined);
    assert.equal(order.shippingAddress.firstName, undefined);
    assert.ok(order.shippingAddress.name);
    assert.ok(order.shippingAddress.phone);
  });

  it("issues a readable, unique reference and starts the order processing", async () => {
    const product = await seedProduct("Test Reference", 10000);

    const seen = new Set<string>();
    for (let i = 0; i < 4; i += 1) {
      const result = await request([
        { productId: product.id, colorId: "bone", size: "S", quantity: 1 },
      ]);
      assert.ok(result.ok);
      assert.match(result.orderId, /^PR-\d{6}-[A-Z2-9]{4}$/);
      assert.equal(seen.has(result.orderId), false, "issued a duplicate reference");
      seen.add(result.orderId);

      const order = (await getOrder(result.orderId))!;
      assert.equal(order.status, "processing");
      assert.equal(order.lines[0].productId, product.id);
    }
  });

  /**
   * Replaces a test that asserted an unrecognised shipping method fell back to standard.
   * There is one shipping option now, so the client cannot name a method at all — which
   * is a stronger guarantee than validating one, and worth pinning down: shipping must
   * be derived from the spend, never accepted from the request.
   */
  it("prices shipping from the order value, not from anything the client sends", async () => {
    const product = await seedProduct("Test Shipping Derived", 10000);

    const cheap = await request([
      { productId: product.id, colorId: "bone", size: "S", quantity: 1 },
    ]);
    assert.ok(cheap.ok);
    const cheapOrder = (await getOrder(cheap.orderId))!;
    assert.ok(cheapOrder.totals.shipping > 0, "below the threshold, shipping is charged");

    // Enough quantity to clear the free-shipping threshold.
    const large = await request([
      { productId: product.id, colorId: "bone", size: "S", quantity: 5 },
    ]);
    assert.ok(large.ok);
    const largeOrder = (await getOrder(large.orderId))!;
    assert.equal(largeOrder.totals.shipping, 0);
  });
});
