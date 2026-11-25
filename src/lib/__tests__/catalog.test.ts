import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, it } from "vitest";
import {
  allCategories,
  allCollections,
  buildFacets,
  filterProducts,
  getProductBySlug,
  isNew,
  isOnSale,
  primaryBadge,
  productsInCategory,
  relatedProducts,
  searchProducts,
  sortProducts,
  toSummary,
} from "@/lib/catalog";
import { createProduct, setProductStatus } from "@/server/repositories/products";
import { db } from "@/server/supabase";
import type { Category, Collection, Product } from "@/lib/types";
import { checkSupabaseDatabase, testRunTag } from "@/server/__tests__/supabase-test-helpers";

/**
 * The catalogue read layer, against a real Supabase project.
 *
 * Integration test — see `supabase-test-helpers.ts`. Unlike the JSON-store
 * version of this file, there is no pre-seeded demo catalogue to describe:
 * `supabase/migrations/00000000000004_seed.sql` seeds only taxonomy, promo
 * codes, email copy and starter banners, deliberately no products (per the
 * "build from zero" migration brief). So this file builds a small fixture
 * catalogue of its own — enough variety (two categories, a sale item, a
 * sustainable item, a cross-sell pairing, a departments split) to exercise
 * every property the original tests pinned down — rather than asserting
 * facts about a specific shipped product range that no longer exists.
 */

const { configured, reason } = checkSupabaseDatabase();
const tag = testRunTag();
const createdProductIds: string[] = [];

let categories: Category[];
let collections: Collection[];
let products: Product[];

/** One fixture product, active and published, with sane defaults. */
async function fixtureProduct(overrides: Partial<Parameters<typeof createProduct>[0]>) {
  const product = await createProduct({
    slug: "",
    name: `Test Catalogue Item ${tag} ${overrides.name ?? ""}`.trim(),
    tagline: "A test piece.",
    department: "unisex",
    category: "knitwear",
    collections: [],
    price: 12000,
    sizeSystem: "alpha",
    colors: [{ id: "bone", name: "Bone", hex: "#EFEAE0" }],
    sizes: [{ label: "M" }],
    description: "Test description.",
    details: [],
    composition: "100% test",
    care: [],
    fitNote: "True to size.",
    origin: "Made in a test.",
    releasedAt: new Date().toISOString(),
    popularity: 1,
    sku: `PRS-CAT-${tag}-${createdProductIds.length}`,
    costPrice: 4000,
    weightGrams: 400,
    rating: 4.5,
    reviewCount: 3,
    ...overrides,
  } as Parameters<typeof createProduct>[0]);
  await setProductStatus([product.id], "active");
  createdProductIds.push(product.id);
  return product;
}

describe.skipIf(!configured)("catalogue read layer", () => {
  if (!configured) {
    it.skip(reason, () => {});
    return;
  }

  beforeAll(async () => {
    categories = await allCategories();
    collections = await allCollections();

    const knitwear = categories.find((c) => c.slug === "knitwear")?.slug ?? categories[0].slug;
    const denim = categories.find((c) => c.slug === "denim")?.slug ?? categories[0].slug;
    const saleCollection = collections.find((c) => c.slug === "sale")?.slug;

    const plain = await fixtureProduct({
      name: "Plain",
      category: knitwear,
      department: "women",
      // Well outside isNew()'s 45-day window (src/lib/product-utils.ts) and well
      // before CATALOGUE_NOW, so this fixture is unambiguously neither on sale
      // nor new — the actual case the "reports nothing" badge test needs.
      releasedAt: "2020-01-01T00:00:00.000Z",
    });
    const onSale = await fixtureProduct({
      name: "On Sale",
      category: denim,
      department: "men",
      price: 8000,
      compareAtPrice: 12000,
      collections: saleCollection ? [saleCollection] : [],
      sustainable: true,
      sizes: [{ label: "XXL" }],
    });
    const paired = await fixtureProduct({
      name: "Paired",
      category: knitwear,
      department: "unisex",
      pairsWith: [plain.slug],
    });

    products = [plain, onSale, paired];
  });

  afterAll(async () => {
    if (createdProductIds.length > 0) {
      await db().from("products").delete().in("id", createdProductIds);
    }
  });

  describe("catalogue integrity", () => {
    it("has a unique slug and id for every fixture product", () => {
      const slugs = new Set(products.map((p) => p.slug));
      const ids = new Set(products.map((p) => p.id));
      assert.equal(slugs.size, products.length);
      assert.equal(ids.size, products.length);
    });

    it("references only declared categories and collections", () => {
      const categorySlugs = new Set(categories.map((c) => c.slug));
      const collectionSlugs = new Set(collections.map((c) => c.slug));

      for (const product of products) {
        assert.ok(categorySlugs.has(product.category), `${product.slug}: bad category`);
        for (const collection of product.collections) {
          assert.ok(collectionSlugs.has(collection), `${product.slug}: bad collection`);
        }
      }
    });

    it("only cross-sells products that exist", async () => {
      for (const product of products) {
        for (const slug of product.pairsWith ?? []) {
          assert.ok(
            await getProductBySlug(slug),
            `${product.slug} pairs with missing ${slug}`,
          );
        }
      }
    });

    it("prices in whole minor units, with sane compare-at values", () => {
      for (const product of products) {
        assert.ok(Number.isInteger(product.price), `${product.slug}: fractional price`);
        assert.ok(product.price > 0, `${product.slug}: non-positive price`);
        if (product.compareAtPrice !== undefined) {
          assert.ok(
            product.compareAtPrice > product.price,
            `${product.slug}: compare-at is not above price`,
          );
        }
      }
    });

    it("has at least one colour and one size everywhere", () => {
      for (const product of products) {
        assert.ok(product.colors.length > 0, `${product.slug}: no colours`);
        assert.ok(product.sizes.length > 0, `${product.slug}: no sizes`);

        const colorIds = new Set(product.colors.map((c) => c.id));
        assert.equal(colorIds.size, product.colors.length, `${product.slug}: duplicate colour id`);

        for (const color of product.colors) {
          assert.match(color.hex, /^#[0-9a-fA-F]{6}$/, `${product.slug}: bad hex ${color.hex}`);
        }
      }
    });

    it("only exposes active products to the storefront", () => {
      for (const product of products) {
        assert.equal(product.status, "active", `${product.slug}: non-active product leaked`);
      }
    });
  });

  describe("summaries", () => {
    it("drop long-form fields that must not reach client components", () => {
      const summary = toSummary(products[0]) as Record<string, unknown>;
      for (const field of ["description", "details", "care", "reviews", "origin", "fitNote"]) {
        assert.equal(summary[field], undefined, `summary still carries ${field}`);
      }
    });

    it("keep everything a card and add-to-bag need", () => {
      const summary = toSummary(products[0]);
      assert.ok(summary.id && summary.slug && summary.name);
      assert.ok(summary.colors.length > 0 && summary.sizes.length > 0);
      assert.equal(typeof summary.price, "number");
    });
  });

  describe("filtering", () => {
    it("matches a single category", () => {
      const knitwearSlug = products[0].category;
      const result = filterProducts(products, { categories: [knitwearSlug] });
      assert.ok(result.length > 0);
      assert.ok(result.every((p) => p.category === knitwearSlug));
    });

    it("treats separate facets as AND", () => {
      const onSale = products.find((p) => isOnSale(p))!;
      const result = filterProducts(products, {
        categories: [onSale.category],
        departments: [onSale.department],
      });
      assert.ok(result.every((p) => p.category === onSale.category && p.department === onSale.department));
      assert.ok(result.some((p) => p.id === onSale.id));
    });

    it("matches a size only when the product offers it", () => {
      const result = filterProducts(products, { sizes: ["XXL"] });
      for (const product of result) {
        assert.ok(
          product.sizes.some((s) => s.label === "XXL"),
          `${product.slug}: XXL matched but is not offered`,
        );
      }
    });

    it("respects price bounds inclusively", () => {
      const result = filterProducts(products, { minPrice: 8000, maxPrice: 8000 });
      assert.ok(result.every((p) => p.price === 8000));
    });

    it("filters to sale and sustainability flags", () => {
      assert.ok(filterProducts(products, { onSale: true }).every(isOnSale));
      assert.ok(
        filterProducts(products, { sustainable: true }).every((p) => p.sustainable === true),
      );
    });

    it("returns everything when no filters are set", () => {
      assert.equal(filterProducts(products, {}).length, products.length);
    });
  });

  describe("sorting", () => {
    it("orders by price ascending and descending", () => {
      const asc = sortProducts(products, "price-asc").map((p) => p.price);
      const desc = sortProducts(products, "price-desc").map((p) => p.price);
      assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
      assert.deepEqual(desc, [...desc].sort((a, b) => b - a));
    });

    it("does not mutate the input array", () => {
      const original = [...products];
      sortProducts(products, "price-desc");
      assert.deepEqual(products, original);
    });
  });

  describe("search", () => {
    it("finds a fixture product by name", async () => {
      const results = await searchProducts(`Test Catalogue Item ${tag}`);
      assert.ok(results.length > 0);
    });

    it("returns nothing for an empty or unmatched query", async () => {
      assert.equal((await searchProducts("")).length, 0);
      assert.equal((await searchProducts("zzzzqqqq-no-such-thing")).length, 0);
    });

    it("is case insensitive", async () => {
      const upper = await searchProducts(`TEST CATALOGUE ITEM ${tag}`.toUpperCase());
      const lower = await searchProducts(`test catalogue item ${tag}`.toLowerCase());
      assert.equal(upper.length, lower.length);
      assert.ok(upper.length > 0);
    });
  });

  describe("facets", () => {
    it("counts every product exactly once across categories", async () => {
      const facets = await buildFacets(products);
      const total = facets.categories.reduce((sum, facet) => sum + facet.count, 0);
      assert.equal(total, products.length);
    });

    it("reports a price range that contains every product", async () => {
      const { priceRange } = await buildFacets(products);
      for (const product of products) {
        assert.ok(product.price >= priceRange.min && product.price <= priceRange.max);
      }
    });
  });

  describe("recommendations", () => {
    it("never recommends the product itself, and prefers the curated pairing", async () => {
      const paired = products.find((p) => (p.pairsWith?.length ?? 0) > 0)!;
      const related = await relatedProducts(paired, 4);

      assert.ok(related.every((r) => r.id !== paired.id), "recommended itself");
      assert.equal(new Set(related.map((r) => r.id)).size, related.length, "duplicate recommendation");
      assert.ok(
        related.some((r) => r.slug === paired.pairsWith![0]),
        "curated pairing did not appear in recommendations",
      );
    });
  });

  describe("badges", () => {
    it("shows a discount percentage on the sale fixture", () => {
      const reduced = products.find((p) => isOnSale(p))!;
      const badge = primaryBadge(reduced);
      assert.equal(badge?.tone, "sale");
      assert.match(badge?.label ?? "", /^\d+% off$/);
    });

    it("reports nothing for a full-price product that is not new", () => {
      const plain = products.find((p) => !isOnSale(p) && !isNew(p));
      assert.ok(plain, "fixture setup should guarantee a plain, non-new product");
      assert.equal(primaryBadge(plain), null);
    });
  });

  describe("category queries", () => {
    it("returns the fixture products for their category", async () => {
      const knitwearSlug = products[0].category;
      const items = await productsInCategory(knitwearSlug);
      assert.ok(items.some((item) => products.some((p) => p.id === item.id)));
    });
  });
});
