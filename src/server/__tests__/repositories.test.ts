import assert from "node:assert/strict";
import { afterAll, describe, it } from "vitest";
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
import { db } from "@/server/supabase";
import { checkSupabaseDatabase, testRunTag } from "./supabase-test-helpers";

/**
 * The server layer that the admin panel writes through, exercised against a real
 * Supabase project. Integration test — see `supabase-test-helpers.ts`.
 *
 * What matters here is that a write either happens completely or not at all: a
 * duplicate slug, a half-applied taxonomy rename or a backwards status move are
 * the failures that cost real money. Every fixture this file creates is tagged
 * with this run's id so a second run sharing the same project cannot collide with
 * it, and everything is deleted in `afterAll`.
 */

const { configured, reason } = checkSupabaseDatabase();
const tag = testRunTag();

const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCategorySlugs: string[] = [];
const createdPromoCodes: string[] = [];
const createdBannerIds: string[] = [];

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
    sku: `PRS-TST-${tag}`,
    costPrice: 4000,
    weightGrams: 400,
  } as Parameters<typeof createProduct>[0];
}

async function trackedProduct(name: string) {
  const product = await createProduct(draftProduct(`${name} ${tag}`));
  createdProductIds.push(product.id);
  return product;
}

describe.skipIf(!configured)("repository layer", () => {
  if (!configured) {
    it.skip(reason, () => {});
    return;
  }

  describe("product creation", () => {
    it("assigns an id, derives a slug and starts as a draft", async () => {
      const created = await trackedProduct("Test Merino Crew");

      assert.match(created.id, /^p-\d{3}$/);
      assert.match(created.slug, /^test-merino-crew/);
      // A new product must not appear on the storefront until it is published.
      assert.equal(created.status, "draft");
      assert.ok(created.createdAt);
      assert.ok(created.updatedAt);
    });

    it("keeps drafts out of the storefront and lets publishing bring them in", async () => {
      const created = await trackedProduct("Test Draft Visibility");

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
      const a = await trackedProduct("Test Slug Clash");
      const b = await trackedProduct("Test Slug Clash");
      const c = await trackedProduct("Test Slug Clash");

      assert.notEqual(a.slug, b.slug);
      assert.notEqual(b.slug, c.slug);
      assert.ok(b.slug.startsWith(a.slug));
    });

    it("stamps updatedAt on every edit", async () => {
      const created = await trackedProduct("Test Timestamp");
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
      const source = await trackedProduct("Test Duplicate Source");
      await setProductStatus([source.id], "active");

      const copy = await duplicateProduct(source.id);
      createdProductIds.push(copy.id);

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

    function orderFor(id: string, productIdentifier: string, slug: string): Order {
      createdOrderIds.push(id);
      return {
        id,
        placedAt: new Date().toISOString(),
        status: "processing",
        paymentStatus: "pending",
    paymentMethod: "prepaid",
        email: "buyer@prestine.test",
        lines: [
          {
            productId: productIdentifier,
            slug,
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
        totals: { subtotal: 24000, discount: 0, shipping: 0, tax: 1920, codFee: 0, total: 25920 },
        shippingAddress: {
          name: "Test Buyer",
          phone: "+442079460102",
          line1: "1 Test Street",
          city: "London",
          region: "Greater London",
        },
      };
    }

    it("records timestamps as an order progresses", async () => {
      const product = await trackedProduct("Test Order Product A");
      await createOrder(orderFor(`PR-TEST-${tag}-1`, product.id, product.slug));

      const shipped = await updateOrderStatus(`PR-TEST-${tag}-1`, "shipped", {
        carrier: "DPD",
        trackingNumber: "GB0000000001",
      });
      assert.equal(shipped.status, "shipped");
      assert.ok(shipped.shippedAt);
      assert.equal(shipped.trackingNumber, "GB0000000001");

      const delivered = await updateOrderStatus(`PR-TEST-${tag}-1`, "delivered");
      assert.equal(delivered.status, "delivered");
      assert.ok(delivered.deliveredAt);
    });

    it("refuses an illegal transition instead of applying it", async () => {
      const product = await trackedProduct("Test Order Product B");
      await createOrder(orderFor(`PR-TEST-${tag}-2`, product.id, product.slug));
      await updateOrderStatus(`PR-TEST-${tag}-2`, "shipped");

      await assert.rejects(
        () => updateOrderStatus(`PR-TEST-${tag}-2`, "processing"),
        /Cannot move an order/,
      );

      const unchanged = await getOrder(`PR-TEST-${tag}-2`);
      assert.equal(unchanged!.status, "shipped");
    });
  });

  describe("taxonomy", () => {
    it("rewrites product references when a category slug changes", async () => {
      const from = `test-hats-${tag}`;
      const to = `test-caps-${tag}`;
      createdCategorySlugs.push(from, to);

      await createCategory({ slug: from, name: "Test Hats", blurb: "For testing." });

      const product = await trackedProduct("Test Hat");
      await updateProduct(product.id, { category: from });
      await setProductStatus([product.id], "active");

      await updateCategory(from, { slug: to, name: "Test Caps", blurb: "Renamed." });

      const moved = await getProduct(product.id);
      assert.equal(moved!.category, to, "renaming a category orphaned its products");
    });

    it("refuses to delete a category that still has products", async () => {
      const slug = `test-in-use-${tag}`;
      createdCategorySlugs.push(slug);

      await createCategory({ slug, name: "Test In Use", blurb: "Occupied." });
      const product = await trackedProduct("Test Occupant");
      await updateProduct(product.id, { category: slug });

      await assert.rejects(() => deleteCategory(slug));

      const still = await listCategories();
      assert.ok(still.some((category) => category.slug === slug));
    });
  });

  describe("promotion codes", () => {
    it("normalises the code and rejects incoherent definitions", async () => {
      const code = `TEST-TEN-${tag}`;
      createdPromoCodes.push(code.toUpperCase());

      const promo = await createPromoCode({
        code: `  ${code}  `,
        description: "10% off",
        percentOff: 10,
      });
      assert.equal(promo.code, code.toUpperCase());

      await assert.rejects(
        () =>
          createPromoCode({
            code: `TEST-BOTH-${tag}`,
            description: "x",
            percentOff: 10,
            amountOff: 500,
          }),
        /not both/,
      );
      await assert.rejects(
        () => createPromoCode({ code: `TEST-NEITHER-${tag}`, description: "x" }),
        /either a percentage or a fixed amount/,
      );
      await assert.rejects(
        () =>
          createPromoCode({ code: `TEST-OVER-${tag}`, description: "x", percentOff: 150 }),
        /between 1 and 100/,
      );
      await assert.rejects(
        () =>
          createPromoCode({
            code,
            description: "duplicate",
            percentOff: 5,
          }),
        /already exists/,
      );

      await deletePromoCode(code.toUpperCase());
    });
  });

  describe("banners", () => {
    const base = {
      heading: `Test banner ${tag}`,
      textTone: "light" as const,
      align: "left" as const,
      active: true,
    };

    function tracked<T extends { id: string }>(banner: T): T {
      createdBannerIds.push(banner.id);
      return banner;
    }

    it("appends new slides to the end so existing order is untouched", async () => {
      const first = tracked(await createBanner({ ...base, heading: `Test order A ${tag}` }));
      const second = tracked(await createBanner({ ...base, heading: `Test order B ${tag}` }));

      assert.ok(second.position > first.position);
    });

    it("only reports a slide live when it is active and inside its window", async () => {
      const hour = 3600_000;
      const past = new Date(Date.now() - hour).toISOString();
      const future = new Date(Date.now() + hour).toISOString();

      const live = tracked(await createBanner({ ...base, heading: `Test live ${tag}` }));
      const hidden = tracked(
        await createBanner({ ...base, heading: `Test hidden ${tag}`, active: false }),
      );
      const queued = tracked(
        await createBanner({ ...base, heading: `Test queued ${tag}`, startsAt: future }),
      );
      const expired = tracked(
        await createBanner({ ...base, heading: `Test expired ${tag}`, endsAt: past }),
      );
      const windowed = tracked(
        await createBanner({
          ...base,
          heading: `Test windowed ${tag}`,
          startsAt: past,
          endsAt: future,
        }),
      );

      const ids = (await listLiveBanners()).map((banner) => banner.id);

      assert.ok(ids.includes(live.id), "an active slide with no dates should be live");
      assert.ok(ids.includes(windowed.id), "a slide inside its window should be live");
      assert.ok(!ids.includes(hidden.id), "an unpublished slide leaked");
      assert.ok(!ids.includes(queued.id), "a future slide leaked");
      assert.ok(!ids.includes(expired.id), "an expired slide leaked");
    });

    it("rejects a call to action that is only half filled in", async () => {
      await assert.rejects(
        () => createBanner({ ...base, heading: `Test half A ${tag}`, ctaLabel: "Shop now" }),
        /both a label and a link/,
      );
      await assert.rejects(
        () => createBanner({ ...base, heading: `Test half B ${tag}`, ctaHref: "/shop" }),
        /both a label and a link/,
      );

      // Both together is fine.
      const ok = tracked(
        await createBanner({
          ...base,
          heading: `Test half ok ${tag}`,
          ctaLabel: "Shop now",
          ctaHref: "/shop",
        }),
      );
      assert.equal(ok.ctaHref, "/shop");
    });

    it("refuses link schemes that could execute script", async () => {
      for (const href of ["javascript:alert(1)", "data:text/html,x", "http://insecure.test"]) {
        await assert.rejects(
          () =>
            createBanner({
              ...base,
              heading: `Test scheme ${tag}`,
              ctaLabel: "Go",
              ctaHref: href,
            }),
          /must start with/,
          `accepted ${href}`,
        );
      }
    });

    it("validates the accent colour and image scheme", async () => {
      await assert.rejects(
        () => createBanner({ ...base, heading: `Test hex ${tag}`, accentHex: "reddish" }),
        /six-digit hex/,
      );
      await assert.rejects(
        () =>
          createBanner({
            ...base,
            heading: `Test image ${tag}`,
            imageUrl: "http://insecure.test/a.jpg",
          }),
        /https/,
      );
    });

    it("refuses an end date that is not after the start", async () => {
      const now = new Date().toISOString();
      await assert.rejects(
        () =>
          createBanner({ ...base, heading: `Test dates ${tag}`, startsAt: now, endsAt: now }),
        /after the start/,
      );
    });

    it("swaps position when moved, and stops at the ends", async () => {
      const a = tracked(await createBanner({ ...base, heading: `Test move A ${tag}` }));
      const b = tracked(await createBanner({ ...base, heading: `Test move B ${tag}` }));

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
      const doomed = tracked(await createBanner({ ...base, heading: `Test delete me ${tag}` }));
      await deleteBanner(doomed.id);
      createdBannerIds.splice(createdBannerIds.indexOf(doomed.id), 1);

      const positions = (await listBanners()).map((banner) => banner.position);
      assert.deepEqual(
        positions,
        positions.map((_, index) => index),
        "positions left a gap after deletion",
      );
    });

    it("trims input and drops empty optional fields", async () => {
      const banner = tracked(
        await createBanner({
          ...base,
          heading: `  Test trimming ${tag}  `,
          eyebrow: "   ",
          body: "",
        }),
      );

      assert.equal(banner.heading, `Test trimming ${tag}`);
      assert.equal(banner.eyebrow, undefined);
      assert.equal(banner.body, undefined);
    });
  });

  describe("settings", () => {
    it("merges nested social links instead of replacing them", async () => {
      const before = await updateSettings({
        social: { pinterest: "https://pinterest.com/prestine-test-baseline" } as never,
      });
      assert.ok(before.social.instagram !== undefined);

      const updated = await updateSettings({
        social: { instagram: "https://instagram.com/prestine-test" } as never,
      });

      assert.equal(updated.social.instagram, "https://instagram.com/prestine-test");
      // The other two links must survive a partial update.
      assert.equal(updated.social.pinterest, "https://pinterest.com/prestine-test-baseline");
      assert.ok(updated.social.youtube !== undefined);
    });
  });

  afterAll(async () => {
    if (createdOrderIds.length > 0) {
      await db().from("orders").delete().in("id", createdOrderIds);
    }
    if (createdProductIds.length > 0) {
      await db().from("products").delete().in("id", createdProductIds);
    }
    for (const slug of createdCategorySlugs) {
      await db().from("categories").delete().eq("slug", slug);
    }
    for (const code of createdPromoCodes) {
      await db().from("promo_codes").delete().eq("code", code);
    }
    if (createdBannerIds.length > 0) {
      await db().from("banners").delete().in("id", createdBannerIds);
    }
  });
});
