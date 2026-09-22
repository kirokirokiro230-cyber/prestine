import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { beforeAll, describe, it } from "vitest";
import {
  allCategories,
  allCollections,
  allProducts,
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
import type { Category, Collection, Product } from "@/lib/types";

/**
 * The catalogue read layer is async now — it reads through the server store — so
 * everything is resolved once up front and the assertions run against plain
 * arrays. That keeps the tests readable and means the store is read once per file
 * rather than once per assertion.
 */
let products: Product[];
let categories: Category[];
let collections: Collection[];

beforeAll(async () => {
  const path = ".test-store/catalog.json";
  process.env.PRESTINE_STORE_PATH = path;

  // Read-only here, but the file is re-seeded rather than reused so these tests
  // describe the shipped catalogue and never a store some other run left behind.
  rmSync(path, { force: true });

  [products, categories, collections] = await Promise.all([
    allProducts(),
    allCategories(),
    allCollections(),
  ]);
});

describe("catalogue integrity", () => {
  it("has a unique slug and id for every product", () => {
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

  it("keeps rating in range and consistent with review count", () => {
    for (const product of products) {
      assert.ok(product.rating >= 0 && product.rating <= 5, `${product.slug}: rating out of range`);
      assert.ok(product.reviewCount > 0, `${product.slug}: no reviews`);
    }
  });

  it("sale-tagged products are actually reduced, and vice versa", () => {
    for (const product of products) {
      const tagged = product.collections.includes("sale");
      assert.equal(
        tagged,
        isOnSale(product),
        `${product.slug}: sale tag and compare-at price disagree`,
      );
    }
  });

  it("only exposes active products to the storefront", () => {
    for (const product of products) {
      assert.equal(product.status, "active", `${product.slug}: non-active product leaked`);
    }
  });

  it("gives every product the admin fields the panel edits", () => {
    for (const product of products) {
      assert.ok(product.sku, `${product.slug}: no SKU`);
      assert.ok(product.createdAt, `${product.slug}: no createdAt`);
      assert.ok(product.updatedAt, `${product.slug}: no updatedAt`);
      assert.ok(
        typeof product.costPrice === "number" && product.costPrice > 0,
        `${product.slug}: no cost price`,
      );
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
    const result = filterProducts(products, { categories: ["knitwear"] });
    assert.ok(result.length > 0);
    assert.ok(result.every((p) => p.category === "knitwear"));
  });

  it("treats multiple values within a facet as OR", () => {
    const result = filterProducts(products, { categories: ["knitwear", "denim"] });
    assert.ok(result.every((p) => p.category === "knitwear" || p.category === "denim"));
    assert.ok(result.length > filterProducts(products, { categories: ["denim"] }).length);
  });

  it("treats separate facets as AND", () => {
    const result = filterProducts(products, {
      categories: ["denim"],
      departments: ["women"],
    });
    assert.ok(result.every((p) => p.category === "denim" && p.department === "women"));
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
    const result = filterProducts(products, { minPrice: 10000, maxPrice: 20000 });
    assert.ok(result.every((p) => p.price >= 10000 && p.price <= 20000));
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

  it("orders newest first", () => {
    const dates = sortProducts(products, "newest").map((p) =>
      new Date(p.releasedAt).getTime(),
    );
    assert.deepEqual(dates, [...dates].sort((a, b) => b - a));
  });

  it("ranks the featured order by popularity alone", () => {
    // Nothing can be unavailable, so popularity is the whole ranking — there is no
    // availability tie-break sinking anything to the bottom.
    const scores = sortProducts(products, "featured").map((p) => p.popularity);
    assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  });

  it("does not mutate the input array", () => {
    const original = [...products];
    sortProducts(products, "price-desc");
    assert.deepEqual(products, original);
  });
});

describe("search", () => {
  it("finds products by material", async () => {
    const results = await searchProducts("cashmere");
    assert.ok(results.length > 0);
    assert.ok(results.some((p) => p.slug === "grade-a-cashmere-crew"));
  });

  it("finds products by category name", async () => {
    const results = await searchProducts("denim");
    assert.ok(results.length > 0);
  });

  it("requires every term to match", async () => {
    // "cashmere" matches; "helicopter" cannot — so the whole query fails.
    assert.equal((await searchProducts("cashmere helicopter")).length, 0);
  });

  it("returns nothing for an empty or unmatched query", async () => {
    assert.equal((await searchProducts("")).length, 0);
    assert.equal((await searchProducts("   ")).length, 0);
    assert.equal((await searchProducts("zzzzqqqq")).length, 0);
  });

  it("honours the limit", async () => {
    assert.ok((await searchProducts("cotton", 3)).length <= 3);
  });

  it("is case insensitive", async () => {
    const upper = await searchProducts("CASHMERE");
    const lower = await searchProducts("cashmere");
    assert.equal(upper.length, lower.length);
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

  it("never lists a size no product offers", async () => {
    const facets = await buildFacets(products);
    for (const size of facets.sizes) {
      assert.ok(size.count > 0, `${size.label} listed but offered by no product`);
    }
  });
});

describe("recommendations", () => {
  it("never recommends the product itself and never repeats", async () => {
    for (const product of products) {
      const related = await relatedProducts(product, 4);
      assert.ok(related.every((r) => r.id !== product.id), `${product.slug}: recommended itself`);
      assert.equal(
        new Set(related.map((r) => r.id)).size,
        related.length,
        `${product.slug}: duplicate recommendation`,
      );
    }
  });

  it("fills up to the requested count wherever the catalogue allows", async () => {
    for (const product of products) {
      const related = await relatedProducts(product, 4);
      assert.equal(related.length, 4, `${product.slug}: short on related`);
    }
  });
});

describe("badges", () => {
  it("shows a discount percentage on reduced products", () => {
    const reduced = products.find((p) => isOnSale(p));
    if (reduced) {
      const badge = primaryBadge(reduced);
      assert.equal(badge?.tone, "sale");
      assert.match(badge?.label ?? "", /^\d+% off$/);
    }
  });

  it("prefers a discount over newness", () => {
    // A shopper scanning a grid is looking for the price, so sale outranks new — and
    // with no inventory these are the only two states a badge can report.
    const both = products.find((p) => isOnSale(p) && isNew(p));
    if (both) assert.equal(primaryBadge(both)?.tone, "sale");
  });

  it("reports nothing for a full-price product that is not new", () => {
    const plain = products.find((p) => !isOnSale(p) && !isNew(p));
    if (plain) assert.equal(primaryBadge(plain), null);
  });
});

describe("category queries", () => {
  it("returns products for every declared category", async () => {
    for (const category of categories) {
      const items = await productsInCategory(category.slug);
      assert.ok(items.length > 0, `${category.slug} has no products`);
    }
  });
});
