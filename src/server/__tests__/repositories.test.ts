import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { beforeAll, describe, it } from "vitest";
import type { Order } from "@/lib/types";
import {
  createBanner,
  deleteBanner,
  listBanners,
  listLiveBanners,
  moveBanner,
} from "@/server/repositories/banners";
import { createOrder, canTransition, getOrder, updateOrderStatus } from "@/server/repositories/orders";
import {
  createProduct,
  duplicateProduct,
  getProduct,
  listActiveProducts,
  setProductStatus,
  updateProduct,
} from "@/server/repositories/products";
import {
  createPromoCode,
  deletePromoCode,
  updateSettings,
} from "@/server/repositories/settings";
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from "@/server/repositories/taxonomy";

/**
 * The server layer that the admin panel writes through.
 *
 * These tests run against a scratch store, seeded from the real catalogue, and they
 * mutate it — so they are ordered to be independent of each other rather than
 * relying on a pristine document. What matters here is that a write either happens
 * completely or not at all: a duplicate slug, a half-applied taxonomy rename or a
 * backwards status move are the failures that cost real money.
 */

beforeAll(() => {
  const path = ".test-store/repositories.json";
  process.env.PRESTINE_STORE_PATH = path;

  /**
   * Delete the scratch store first. It is a real file, so without this the suite
   * only passes on a clean checkout: the slug assertions below expect
   * `test-merino-crew`, and a store left over from the previous run makes the
   * de-duplicator hand back `test-merino-crew-2`, then `-3`, and so on. Removing
   * it here — before the store is first read, so nothing is cached yet — is what
   * makes the run repeatable.
   */
  rmSync(path, { force: true });
});

/** A minimal but valid product, used where the fields under test are elsewhere. */
function draftProduct(name: string): Parameters<typeof createProduct>[0] {
  return {
    slug: "",
    name,
    tagline: "A test piece.",
    department: "unisex",
    category: "knitwear",
    collections: [],
    price: 12000,
    sizeSystem: "alpha",
    colors: [{ id: "bone", name: "Bone", hex: "#EFEAE0" }],
    sizes: [
      { label: "S" },
      { label: "M" },
    ],
    description: "Test description.",
    details: [],
    composition: "100% test",
    care: [],
    fitNote: "True to size.",
    origin: "Made in a test.",
    releasedAt: new Date().toISOString(),
    popularity: 1,
    sku: "PRS-TST-001",
    costPrice: 4000,
    weightGrams: 400,
  } as Parameters<typeof createProduct>[0];
}

describe("product creation", () => {
  it("assigns an id, derives a slug and starts as a draft", async () => {
    const created = await createProduct(draftProduct("Test Merino Crew"));

    assert.match(created.id, /^p-\d{3}$/);
    assert.equal(created.slug, "test-merino-crew");
    // A new product must not appear on the storefront until it is published.
    assert.equal(created.status, "draft");
    assert.ok(created.createdAt);
    assert.ok(created.updatedAt);
  });

  it("keeps drafts out of the storefront and lets publishing bring them in", async () => {
    const created = await createProduct(draftProduct("Test Draft Visibility"));

    let active = await listActiveProducts();
    assert.equal(
      active.some((product) => product.id === created.id),
      false,
      "a draft leaked to the storefront",
    );

    await setProductStatus([created.id], "active");
    active = await listActiveProducts();
    assert.equal(active.some((product) => product.id === created.id), true);

    await setProductStatus([created.id], "archived");
    active = await listActiveProducts();
    assert.equal(
      active.some((product) => product.id === created.id),
      false,
      "an archived product stayed on the storefront",
    );
  });

  it("never issues a duplicate slug", async () => {
    const a = await createProduct(draftProduct("Test Slug Clash"));
    const b = await createProduct(draftProduct("Test Slug Clash"));
    const c = await createProduct(draftProduct("Test Slug Clash"));

    assert.equal(a.slug, "test-slug-clash");
    assert.equal(b.slug, "test-slug-clash-2");
    assert.equal(c.slug, "test-slug-clash-3");
  });

  it("stamps updatedAt on every edit", async () => {
    const created = await createProduct(draftProduct("Test Timestamp"));
    // Timestamps are ISO strings at millisecond resolution; wait so the comparison
    // is not testing the clock's granularity.
    await new Promise((resolve) => setTimeout(resolve, 5));

    const updated = await updateProduct(created.id, { price: 13500 });
    assert.equal(updated.price, 13500);
    assert.ok(
      updated.updatedAt! > created.updatedAt!,
      "updatedAt did not move after an edit",
    );
    assert.equal(updated.createdAt, created.createdAt);
  });

  it("duplicates as an unrated draft with a new identity", async () => {
    const source = await createProduct(draftProduct("Test Duplicate Source"));
    await setProductStatus([source.id], "active");

    const copy = await duplicateProduct(source.id);

    assert.notEqual(copy.id, source.id);
    assert.notEqual(copy.slug, source.slug);
    assert.equal(copy.status, "draft");
    assert.equal(copy.rating, 0);
    assert.equal(copy.reviewCount, 0);
    // The copy must not share arrays with the original.
    assert.notEqual(copy.sizes, source.sizes);
  });
});


describe("order lifecycle", () => {
  let productId: string;

  beforeAll(async () => {
    const product = await createProduct(draftProduct("Test Order Product"));
    productId = product.id;
  });

  function orderFor(id: string, productIdentifier: string): Order {
    return {
      id,
      placedAt: new Date().toISOString(),
      status: "processing",
      email: "buyer@prestine.test",
      lines: [
        {
          productId: productIdentifier,
          slug: "test-order-product",
          name: "Test Order Product",
          colorId: "bone",
          colorName: "Bone",
          colorHex: "#EFEAE0",
          size: "S",
          quantity: 2,
          unitPrice: 12000,
          category: "knitwear",
        },
      ],
      totals: { subtotal: 24000, discount: 0, shipping: 0, tax: 1920, total: 25920 },
      shippingAddress: {
        name: "Test Buyer",
        phone: "+44 20 7946 0102",
        line1: "1 Test Street",
        city: "London",
        region: "Greater London",
        postalCode: "E1 6AN",
        country: "United Kingdom",
      },
    };
  }

  it("only allows forward moves, plus cancellation", () => {
    assert.equal(canTransition("processing", "shipped"), true);
    assert.equal(canTransition("processing", "cancelled"), true);
    assert.equal(canTransition("shipped", "delivered"), true);
    assert.equal(canTransition("shipped", "cancelled"), true);

    assert.equal(canTransition("shipped", "processing"), false);
    assert.equal(canTransition("delivered", "shipped"), false);
    assert.equal(canTransition("delivered", "processing"), false);
    assert.equal(canTransition("cancelled", "processing"), false);
    assert.equal(canTransition("delivered", "cancelled"), false);
  });

  it("records timestamps as an order progresses", async () => {
    await createOrder(orderFor("PR-TEST-0001", productId));

    const shipped = await updateOrderStatus("PR-TEST-0001", "shipped", {
      carrier: "DPD",
      trackingNumber: "GB0000000001",
    });
    assert.equal(shipped.status, "shipped");
    assert.ok(shipped.shippedAt);
    assert.equal(shipped.trackingNumber, "GB0000000001");

    const delivered = await updateOrderStatus("PR-TEST-0001", "delivered");
    assert.equal(delivered.status, "delivered");
    assert.ok(delivered.deliveredAt);
  });

  it("refuses an illegal transition instead of applying it", async () => {
    await createOrder(orderFor("PR-TEST-0002", productId));
    await updateOrderStatus("PR-TEST-0002", "shipped");

    await assert.rejects(
      () => updateOrderStatus("PR-TEST-0002", "processing"),
      /Cannot move an order/,
    );

    const unchanged = await getOrder("PR-TEST-0002");
    assert.equal(unchanged!.status, "shipped");
  });
});

describe("taxonomy", () => {
  it("rewrites product references when a category slug changes", async () => {
    await createCategory({
      slug: "test-hats",
      name: "Test Hats",
      blurb: "For testing.",
    });

    const product = await createProduct({
      ...draftProduct("Test Hat"),
      category: "test-hats",
    });
    await setProductStatus([product.id], "active");

    await updateCategory("test-hats", {
      slug: "test-caps",
      name: "Test Caps",
      blurb: "Renamed.",
    });

    const moved = await getProduct(product.id);
    assert.equal(
      moved!.category,
      "test-caps",
      "renaming a category orphaned its products",
    );
  });

  it("refuses to delete a category that still has products", async () => {
    await createCategory({
      slug: "test-in-use",
      name: "Test In Use",
      blurb: "Occupied.",
    });
    await createProduct({ ...draftProduct("Test Occupant"), category: "test-in-use" });

    await assert.rejects(() => deleteCategory("test-in-use"));

    const still = await listCategories();
    assert.ok(still.some((category) => category.slug === "test-in-use"));
  });
});

describe("promotion codes", () => {
  it("normalises the code and rejects incoherent definitions", async () => {
    const promo = await createPromoCode({
      code: "  test-ten  ",
      description: "10% off",
      percentOff: 10,
    });
    assert.equal(promo.code, "TEST-TEN");

    await assert.rejects(
      () => createPromoCode({ code: "TEST-BOTH", description: "x", percentOff: 10, amountOff: 500 }),
      /not both/,
    );
    await assert.rejects(
      () => createPromoCode({ code: "TEST-NEITHER", description: "x" }),
      /either a percentage or a fixed amount/,
    );
    await assert.rejects(
      () => createPromoCode({ code: "TEST-OVER", description: "x", percentOff: 150 }),
      /between 1 and 100/,
    );
    await assert.rejects(
      () => createPromoCode({ code: "TEST-TEN", description: "duplicate", percentOff: 5 }),
      /already exists/,
    );

    await deletePromoCode("TEST-TEN");
  });
});

describe("banners", () => {
  const base = {
    heading: "Test banner",
    textTone: "light" as const,
    align: "left" as const,
    active: true,
  };

  it("appends new slides to the end so existing order is untouched", async () => {
    const first = await createBanner({ ...base, heading: "Test order A" });
    const second = await createBanner({ ...base, heading: "Test order B" });

    assert.ok(second.position > first.position);
  });

  it("only reports a slide live when it is active and inside its window", async () => {
    const hour = 3600_000;
    const past = new Date(Date.now() - hour).toISOString();
    const future = new Date(Date.now() + hour).toISOString();

    const live = await createBanner({ ...base, heading: "Test live" });
    const hidden = await createBanner({ ...base, heading: "Test hidden", active: false });
    const queued = await createBanner({ ...base, heading: "Test queued", startsAt: future });
    const expired = await createBanner({ ...base, heading: "Test expired", endsAt: past });
    const windowed = await createBanner({
      ...base,
      heading: "Test windowed",
      startsAt: past,
      endsAt: future,
    });

    const ids = (await listLiveBanners()).map((banner) => banner.id);

    assert.ok(ids.includes(live.id), "an active slide with no dates should be live");
    assert.ok(ids.includes(windowed.id), "a slide inside its window should be live");
    assert.ok(!ids.includes(hidden.id), "an unpublished slide leaked");
    assert.ok(!ids.includes(queued.id), "a future slide leaked");
    assert.ok(!ids.includes(expired.id), "an expired slide leaked");
  });

  it("rejects a call to action that is only half filled in", async () => {
    await assert.rejects(
      () => createBanner({ ...base, ctaLabel: "Shop now" }),
      /both a label and a link/,
    );
    await assert.rejects(
      () => createBanner({ ...base, ctaHref: "/shop" }),
      /both a label and a link/,
    );

    // Both together is fine.
    const ok = await createBanner({ ...base, ctaLabel: "Shop now", ctaHref: "/shop" });
    assert.equal(ok.ctaHref, "/shop");
  });

  it("refuses link schemes that could execute script", async () => {
    for (const href of ["javascript:alert(1)", "data:text/html,x", "http://insecure.test"]) {
      await assert.rejects(
        () => createBanner({ ...base, ctaLabel: "Go", ctaHref: href }),
        /must start with/,
        `accepted ${href}`,
      );
    }
  });

  it("validates the accent colour and image scheme", async () => {
    await assert.rejects(
      () => createBanner({ ...base, accentHex: "reddish" }),
      /six-digit hex/,
    );
    await assert.rejects(
      () => createBanner({ ...base, imageUrl: "http://insecure.test/a.jpg" }),
      /https/,
    );
  });

  it("refuses an end date that is not after the start", async () => {
    const now = new Date().toISOString();
    await assert.rejects(
      () => createBanner({ ...base, startsAt: now, endsAt: now }),
      /after the start/,
    );
  });

  it("swaps position when moved, and stops at the ends", async () => {
    // Work on a known pair at the end of the list.
    const a = await createBanner({ ...base, heading: "Test move A" });
    const b = await createBanner({ ...base, heading: "Test move B" });

    await moveBanner(b.id, "up");
    let ordered = await listBanners();
    let indexA = ordered.findIndex((banner) => banner.id === a.id);
    let indexB = ordered.findIndex((banner) => banner.id === b.id);
    assert.ok(indexB < indexA, "moving up did not swap the pair");

    await moveBanner(b.id, "down");
    ordered = await listBanners();
    indexA = ordered.findIndex((banner) => banner.id === a.id);
    indexB = ordered.findIndex((banner) => banner.id === b.id);
    assert.ok(indexB > indexA, "moving back down did not restore the order");

    // The first slide cannot move up past the start.
    const firstId = (await listBanners())[0].id;
    await moveBanner(firstId, "up");
    assert.equal((await listBanners())[0].id, firstId);
  });

  it("keeps positions contiguous after a delete, so ordering still works", async () => {
    const doomed = await createBanner({ ...base, heading: "Test delete me" });
    await deleteBanner(doomed.id);

    const positions = (await listBanners()).map((banner) => banner.position);
    assert.deepEqual(
      positions,
      positions.map((_, index) => index),
      "positions left a gap after deletion",
    );
  });

  it("trims input and drops empty optional fields", async () => {
    const banner = await createBanner({
      ...base,
      heading: "  Test trimming  ",
      eyebrow: "   ",
      body: "",
    });

    assert.equal(banner.heading, "Test trimming");
    assert.equal(banner.eyebrow, undefined);
    assert.equal(banner.body, undefined);
  });
});

describe("settings", () => {
  it("merges nested social links instead of replacing them", async () => {
    const updated = await updateSettings({
      social: { instagram: "https://instagram.com/prestine-test" } as never,
    });

    assert.equal(updated.social.instagram, "https://instagram.com/prestine-test");
    // The other two links must survive a partial update.
    assert.ok(updated.social.pinterest);
    assert.ok(updated.social.youtube);
  });
});
