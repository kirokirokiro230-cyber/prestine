import assert from "node:assert/strict";
import { afterAll, describe, it, vi } from "vitest";
import { checkSupabaseDatabase, testRunTag } from "./supabase-test-helpers";

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
  headers: async () => ({ get: () => null }),
}));

/*
 * `placeOrder` now opens a real Cashfree payment session before it ever writes an
 * order — the one external call in the whole trust-boundary function, and not one
 * these tests should depend on a live Cashfree sandbox account to exercise. The
 * subject here is the money and the record `placeOrder` writes, which is unrelated
 * to what Cashfree's API returns, so `createCashfreeOrder` is stubbed to hand back a
 * fixed session immediately. `cashfreeConfig` also has to resolve non-null or
 * `placeOrder` refuses every request before pricing ever runs.
 */
vi.mock("@/server/cashfree", () => ({
  cashfreeConfig: () => ({
    appId: "test-app-id",
    secretKey: "test-secret",
    environment: "sandbox" as const,
    webhookSecret: "test-secret",
    apiVersion: "2023-08-01",
    apiBase: "https://sandbox.cashfree.com",
  }),
  createCashfreeOrder: async ({ orderId }: { orderId: string }) => ({
    cfOrderId: `cf_${orderId}`,
    orderId,
    orderStatus: "ACTIVE",
    paymentSessionId: `session_test_${orderId}`,
  }),
  CashfreeApiError: class CashfreeApiError extends Error {},
}));

const { placeOrder } = await import("@/app/actions/checkout");
const { getOrder } = await import("@/server/repositories/orders");
const { createProduct, getProduct, setProductStatus } = await import(
  "@/server/repositories/products"
);
const { createPromoCode, getSettings, updateSettings } = await import(
  "@/server/repositories/settings"
);
const { getEmailTemplate, updateEmailTemplate } = await import("@/server/repositories/email");
const { db } = await import("@/server/supabase");

/**
 * Order placement is the trust boundary: the browser says what it wants, the server
 * decides what it costs. These tests exist to prove the client cannot influence the
 * money, and that an invalid request is refused whole rather than in part.
 *
 * Integration test against a real Supabase project — see `supabase-test-helpers.ts`.
 */

const { configured, reason } = checkSupabaseDatabase();
const tag = testRunTag();
const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];
const createdPromoCodes: string[] = [];

const ADDRESS = {
  name: "Test Buyer",
  phone: "+442079460102",
  line1: "1 Test Street",
  city: "London",
  region: "Greater London",
};

async function seedProduct(name: string, price: number) {
  const product = await createProduct({
    slug: "",
    name: `${name} ${tag}`,
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
  createdProductIds.push(product.id);

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

/** Track a successful placeOrder result's order id for later cleanup. */
function tracked<T extends { ok: boolean }>(result: T): T {
  if (result.ok && "orderId" in result) {
    createdOrderIds.push((result as unknown as { orderId: string }).orderId);
  }
  return result;
}

describe.skipIf(!configured)("placeOrder", () => {
  if (!configured) {
    it.skip(reason, () => {});
    return;
  }

  /*
   * Silence the confirmation email. These tests are about the money and the record
   * `placeOrder` writes; the send is exercised properly in email.test.ts and
   * email-queue.test.ts. Switching the template off makes the dispatcher return before it
   * renders anything, which keeps these assertions fast and free of a "no provider
   * configured" line per order.
   *
   * This mutates the shared, singleton `order-confirmation` template rather than a
   * tagged fixture — unavoidable, since there is exactly one row per template key —
   * so the row's exact current values are captured first and restored verbatim in
   * `afterAll`, rather than overwritten with placeholder copy that would corrupt a
   * merchant's real wording if this were ever pointed at a non-disposable project.
   */
  let originalConfirmationTemplate: Awaited<ReturnType<typeof getEmailTemplate>>;
  /*
   * Several tests below also change taxRate/freeShippingThreshold/standardShippingRate
   * on the same shared settings row, for the same reason (there is exactly one). Captured
   * once here and restored in `afterAll` alongside the template.
   */
  let originalSettings: Awaited<ReturnType<typeof getSettings>>;

  it("setup: disables the confirmation email for this run", async () => {
    originalConfirmationTemplate = await getEmailTemplate("order-confirmation");
    originalSettings = await getSettings();

    await updateEmailTemplate("order-confirmation", {
      enabled: false,
      subject: "Disabled for tests",
      heading: "",
      body: "",
    });
  });

  describe("pricing", () => {
    it("prices from the store, not from the request", async () => {
      const product = await seedProduct("Test Priced Item", 20000);

      const result = tracked(
        await request([{ productId: product.id, colorId: "bone", size: "S", quantity: 2 }]),
      );
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
      const below = tracked(
        await request([{ productId: product.id, colorId: "bone", size: "S", quantity: 1 }]),
      );
      assert.ok(below.ok);
      const belowOrder = (await getOrder(below.orderId))!;
      assert.equal(belowOrder.totals.shipping, 1000, "charged the wrong standard rate");
      assert.equal(belowOrder.totals.tax, 1000, "did not use the live tax rate");
      assert.equal(belowOrder.totals.total, 10000 + 1000 + 1000);

      // 60000 subtotal, at or above the threshold: standard shipping is free.
      const above = tracked(
        await request([{ productId: product.id, colorId: "bone", size: "S", quantity: 6 }]),
      );
      assert.ok(above.ok);
      const aboveOrder = (await getOrder(above.orderId))!;
      assert.equal(aboveOrder.totals.shipping, 0, "did not honour the free-shipping threshold");
      assert.equal(aboveOrder.totals.tax, 6000);
    });

    it("only records a promo code that actually discounted the order", async () => {
      await updateSettings({ taxRate: 0.08, freeShippingThreshold: 20000, standardShippingRate: 900 });
      const code = `TESTPLACE20${tag}`;
      createdPromoCodes.push(code.toUpperCase());
      await createPromoCode({ code, description: "20% off", percentOff: 20 });

      const product = await seedProduct("Test Promo Item", 30000);

      const applied = tracked(
        await request(
          [{ productId: product.id, colorId: "bone", size: "S", quantity: 1 }],
          { promoCode: code.toLowerCase() },
        ),
      );
      assert.ok(applied.ok);
      const discounted = (await getOrder(applied.orderId))!;
      assert.equal(discounted.totals.discount, 6000);
      assert.equal(discounted.promoCode, code.toUpperCase());

      // An unknown code is ignored rather than failing the order or being recorded.
      const bogus = tracked(
        await request(
          [{ productId: product.id, colorId: "bone", size: "S", quantity: 1 }],
          { promoCode: "NOT-A-REAL-CODE" },
        ),
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
  describe("quantity limits", () => {
    it("accepts any quantity up to the cap", async () => {
      const product = await seedProduct("Test Quantity", 15000);

      const result = tracked(
        await request([{ productId: product.id, colorId: "bone", size: "S", quantity: 10 }]),
      );
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
      results.forEach((result) => tracked(result));

      assert.equal(results.filter((result) => result.ok).length, 5);
    });
  });

  describe("validation", () => {
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

  describe("the record it writes", () => {
    it("stores only the last four card digits, normalised", async () => {
      const product = await seedProduct("Test Card", 10000);

      const result = tracked(
        await request(
          [{ productId: product.id, colorId: "bone", size: "S", quantity: 1 }],
          { cardLast4: "4242 4242 4242 4111" },
        ),
      );
      assert.ok(result.ok);

      const order = (await getOrder(result.orderId))!;
      assert.equal(order.cardLast4, "4111");

      // Nothing anywhere on the record may resemble a full card number.
      assert.doesNotMatch(JSON.stringify(order), /\d{13,19}/);
    });

    it("normalises the email it saves and writes only the collected address fields", async () => {
      const product = await seedProduct("Test Normalise", 10000);

      const result = tracked(
        await request(
          [{ productId: product.id, colorId: "bone", size: "S", quantity: 1 }],
          { email: "  Buyer@Prestine.TEST " },
        ),
      );
      assert.ok(result.ok);

      const order = (await getOrder(result.orderId))!;
      assert.equal(order.email, "buyer@prestine.test");

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
        const result = tracked(
          await request([{ productId: product.id, colorId: "bone", size: "S", quantity: 1 }]),
        );
        assert.ok(result.ok);
        assert.match(result.orderId, /^PR-\d{6}-[A-Z2-9]{4}$/);
        assert.equal(seen.has(result.orderId), false, "issued a duplicate reference");
        seen.add(result.orderId);

        const order = (await getOrder(result.orderId))!;
        assert.equal(order.status, "processing");
        assert.equal(order.lines[0].productId, product.id);
      }
    });

    it("prices shipping from the order value, not from anything the client sends", async () => {
      const product = await seedProduct("Test Shipping Derived", 10000);

      const cheap = tracked(
        await request([{ productId: product.id, colorId: "bone", size: "S", quantity: 1 }]),
      );
      assert.ok(cheap.ok);
      const cheapOrder = (await getOrder(cheap.orderId))!;
      assert.ok(cheapOrder.totals.shipping > 0, "below the threshold, shipping is charged");

      // Enough quantity to clear the free-shipping threshold.
      const large = tracked(
        await request([{ productId: product.id, colorId: "bone", size: "S", quantity: 5 }]),
      );
      assert.ok(large.ok);
      const largeOrder = (await getOrder(large.orderId))!;
      assert.equal(largeOrder.totals.shipping, 0);
    });
  });

  afterAll(async () => {
    if (originalConfirmationTemplate) {
      await updateEmailTemplate("order-confirmation", {
        enabled: originalConfirmationTemplate.enabled,
        subject: originalConfirmationTemplate.subject,
        heading: originalConfirmationTemplate.heading,
        body: originalConfirmationTemplate.body,
      });
    }
    if (originalSettings) {
      await updateSettings({
        taxRate: originalSettings.taxRate,
        freeShippingThreshold: originalSettings.freeShippingThreshold,
        standardShippingRate: originalSettings.standardShippingRate,
      });
    }

    if (createdOrderIds.length > 0) {
      await db().from("orders").delete().in("id", createdOrderIds);
    }
    if (createdProductIds.length > 0) {
      await db().from("products").delete().in("id", createdProductIds);
    }
    for (const code of createdPromoCodes) {
      await db().from("promo_codes").delete().eq("code", code);
    }
  });
});
