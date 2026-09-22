import { cache } from "react";
import { buildReviews } from "./data/reviews";
import {
  isNew,
  isOnSale,
  primaryBadge,
  toSummary,
} from "./product-utils";
import { submittedToDisplayReview } from "./review-reasons";
import { listSubmittedReviewsForProduct } from "@/server/repositories/reviews";
import { listLiveBanners } from "@/server/repositories/banners";
import { listActiveProducts } from "@/server/repositories/products";
import { getSettings, listHiddenReviewIds } from "@/server/repositories/settings";
import {
  getCategory as readCategory,
  getCollection as readCollection,
  listCategories,
  listCollections,
} from "@/server/repositories/taxonomy";
import type {
  Banner,
  Category,
  CategorySlug,
  Collection,
  CollectionSlug,
  Department,
  Product,
  ProductFilters,
  ProductSummary,
  Review,
  SortKey,
  StoreSettings,
} from "./types";

/**
 * Storefront read layer.
 *
 * Everything here is async and reads from the server store, so a change made in the
 * admin panel is live on the next request. That is the whole point: an admin panel
 * writing to data the storefront ignores would be decoration.
 *
 * Only `active` products are ever returned — drafts and archived items are invisible
 * here by construction, not by a filter each caller has to remember.
 *
 * Server-only: importing this from a client component would pull the store in. The
 * pure predicates re-exported below live in `product-utils`, which is safe anywhere.
 */

export { isNew, isOnSale, primaryBadge, toSummary };

/* ------------------------------------------------------------------ */
/* Settings and taxonomy                                              */
/* ------------------------------------------------------------------ */

/**
 * Memoised per request with `React.cache`.
 *
 * A single render of the storefront chrome plus a page routinely calls `allProducts`,
 * `storeSettings` and the taxonomy readers several times over — the layout needs them,
 * the page needs them again, a component three levels down asks a third time. Against
 * the JSON store that repetition was free (an in-memory array); against Postgres each
 * call is a network round trip, so the same request would otherwise open the same
 * query a handful of times over. `cache()` collapses repeat calls with the same
 * arguments into one within a single request, and resets on the next one — exactly the
 * lifetime this needs, since a merchant's edit must still be visible on the very next
 * request rather than staying stale for a fixed TTL.
 */
export const storeSettings = cache(async (): Promise<StoreSettings> => {
  return getSettings();
});

export const allProducts = cache(async (): Promise<Product[]> => {
  return listActiveProducts();
});

export const allCategories = cache(async (): Promise<Category[]> => {
  return listCategories();
});

/**
 * Hero slides the shopper should see right now.
 *
 * Filtering on active state and schedule happens in the repository, so a page can
 * never accidentally render a queued or expired slide.
 */
export const heroBanners = cache(async (): Promise<Banner[]> => {
  return listLiveBanners();
});

/** Collections shown in navigation — hidden ones stay reachable by URL. */
export const navCollections = cache(async (): Promise<Collection[]> => {
  return (await listCollections()).filter((collection) => !collection.hidden);
});

export const allCollections = cache(async (): Promise<Collection[]> => {
  return listCollections();
});

export async function getCategory(slug: string): Promise<Category | undefined> {
  return readCategory(slug);
}

export async function getCollection(slug: string): Promise<Collection | undefined> {
  return readCollection(slug);
}

/* ------------------------------------------------------------------ */
/* Lookups                                                             */
/* ------------------------------------------------------------------ */

export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  return (await allProducts()).find((product) => product.slug === slug);
}

export async function getProductById(id: string): Promise<Product | undefined> {
  return (await allProducts()).find((product) => product.id === id);
}

export async function getProductsByIds(ids: string[]): Promise<Product[]> {
  const products = await allProducts();
  return ids
    .map((id) => products.find((product) => product.id === id))
    .filter((product): product is Product => Boolean(product));
}

/** Preserves the order of the slugs passed in, which recently-viewed relies on. */
export async function getProductsBySlugs(slugs: string[]): Promise<Product[]> {
  const products = await allProducts();
  return slugs
    .map((slug) => products.find((product) => product.slug === slug))
    .filter((product): product is Product => Boolean(product));
}

export async function allProductSlugs(): Promise<string[]> {
  return (await allProducts()).map((product) => product.slug);
}

/* ------------------------------------------------------------------ */
/* Projections                                                         */
/* ------------------------------------------------------------------ */

export function toSummaries(source: Product[]): ProductSummary[] {
  return source.map(toSummary);
}

export async function summariesByIds(ids: string[]): Promise<ProductSummary[]> {
  return (await getProductsByIds(ids)).map(toSummary);
}

export async function summariesBySlugs(slugs: string[]): Promise<ProductSummary[]> {
  return (await getProductsBySlugs(slugs)).map(toSummary);
}

/**
 * A product's reviews, with anything a moderator has hidden removed.
 *
 * Hidden reviews are excluded before the rating breakdown is computed, so the
 * histogram on the page always matches the reviews listed under it.
 */
export async function getProductReviews(product: Product): Promise<Review[]> {
  const [hiddenIds, submitted] = await Promise.all([
    listHiddenReviewIds(),
    listSubmittedReviewsForProduct(product.slug),
  ]);
  const hidden = new Set(hiddenIds);

  const generated = buildReviews(
    product.slug,
    product.reviewCount,
    product.sizes.map((size) => size.label),
  );

  /*
   * Real customer reviews and the seeded editorial ones merge into one list and one
   * card. Both pass through the same moderator hide-filter, and both feed the histogram
   * and fit meter the component derives — so hiding a real review drops it from the
   * aggregate exactly as it does a generated one, and the two can never disagree.
   */
  return [...submitted.map(submittedToDisplayReview), ...generated]
    .filter((review) => !hidden.has(review.id))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

/**
 * Field-weighted keyword search. Every query term must match somewhere (AND
 * semantics), which keeps results tight on a catalogue this size.
 */
export function scoreProduct(product: Product, query: string): number {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 0;

  const haystacks: Array<[string, number]> = [
    [product.name.toLowerCase(), 10],
    [product.category, 6],
    [product.department, 4],
    [product.tagline.toLowerCase(), 3],
    [product.colors.map((color) => color.name).join(" ").toLowerCase(), 3],
    [product.collections.join(" "), 2],
    [product.composition.toLowerCase(), 2],
    [product.description.toLowerCase(), 1],
  ];

  let total = 0;
  for (const term of terms) {
    let termScore = 0;
    for (const [text, weight] of haystacks) {
      if (text.includes(term)) {
        // Exact word matches outrank substring hits.
        const wordBoundary = new RegExp(`\\b${escapeRegExp(term)}`).test(text);
        termScore = Math.max(termScore, weight * (wordBoundary ? 1.5 : 1));
      }
    }
    if (termScore === 0) return 0; // a term matched nothing — reject
    total += termScore;
  }

  return total;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function searchProducts(query: string, limit?: number): Promise<Product[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const products = await allProducts();

  const scored = products
    .map((product) => ({ product, score: scoreProduct(product, trimmed) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.product.popularity - a.product.popularity);

  const results = scored.map((entry) => entry.product);
  return typeof limit === "number" ? results.slice(0, limit) : results;
}

/* ------------------------------------------------------------------ */
/* Filtering + sorting                                                 */
/* ------------------------------------------------------------------ */

export function filterProducts(
  source: Product[],
  filters: Partial<ProductFilters>,
): Product[] {
  return source.filter((product) => {
    if (filters.categories?.length && !filters.categories.includes(product.category)) {
      return false;
    }
    if (filters.departments?.length && !filters.departments.includes(product.department)) {
      return false;
    }
    if (filters.colors?.length) {
      const ids = product.colors.map((color) => color.id);
      if (!filters.colors.some((color) => ids.includes(color))) return false;
    }
    if (filters.sizes?.length) {
      const offered = product.sizes.map((size) => size.label);
      if (!filters.sizes.some((size) => offered.includes(size))) return false;
    }
    if (typeof filters.minPrice === "number" && product.price < filters.minPrice) return false;
    if (typeof filters.maxPrice === "number" && product.price > filters.maxPrice) return false;
    if (filters.onSale && !isOnSale(product)) return false;
    if (filters.sustainable && !product.sustainable) return false;
    if (filters.search && scoreProduct(product, filters.search) === 0) return false;
    return true;
  });
}

export function sortProducts(source: Product[], sort: SortKey): Product[] {
  const items = [...source];

  switch (sort) {
    case "newest":
      return items.sort(
        (a, b) => new Date(b.releasedAt).getTime() - new Date(a.releasedAt).getTime(),
      );
    case "price-asc":
      return items.sort((a, b) => a.price - b.price);
    case "price-desc":
      return items.sort((a, b) => b.price - a.price);
    case "rating":
      return items.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
    case "name-asc":
      return items.sort((a, b) => a.name.localeCompare(b.name));
    case "featured":
    default:
      // Nothing can be unavailable, so popularity is the whole ranking.
      return items.sort((a, b) => b.popularity - a.popularity);
  }
}

/* ------------------------------------------------------------------ */
/* Facets                                                             */
/* ------------------------------------------------------------------ */

export interface Facet<T extends string = string> {
  value: T;
  label: string;
  count: number;
  /** Swatch fill, for colour facets only. */
  hex?: string;
}

export interface FacetSet {
  categories: Facet<CategorySlug>[];
  departments: Facet<Department>[];
  colors: Facet[];
  sizes: Facet[];
  priceRange: { min: number; max: number };
  saleCount: number;
  sustainableCount: number;
}

const SIZE_ORDER = [
  "XS", "S", "M", "L", "XL", "XXL",
  "28", "30", "32", "34", "36", "38",
  "39", "40", "41", "42", "43", "44", "45",
  "One size",
];

/**
 * Build facet counts from a product set.
 *
 * Counts reflect the *unfiltered* scope passed in, so a shopper can see how many
 * items a filter would add rather than watching every count collapse to zero.
 */
export async function buildFacets(source: Product[]): Promise<FacetSet> {
  const categories = await listCategories();

  const categoryCounts = new Map<CategorySlug, number>();
  const departmentCounts = new Map<Department, number>();
  const colorCounts = new Map<string, { label: string; hex: string; count: number }>();
  const sizeCounts = new Map<string, number>();

  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  let saleCount = 0;
  let sustainableCount = 0;

  for (const product of source) {
    categoryCounts.set(product.category, (categoryCounts.get(product.category) ?? 0) + 1);
    departmentCounts.set(
      product.department,
      (departmentCounts.get(product.department) ?? 0) + 1,
    );

    for (const color of product.colors) {
      const entry = colorCounts.get(color.id);
      if (entry) entry.count += 1;
      else colorCounts.set(color.id, { label: color.name, hex: color.hex, count: 1 });
    }

    for (const size of product.sizes) {
      sizeCounts.set(size.label, (sizeCounts.get(size.label) ?? 0) + 1);
    }

    min = Math.min(min, product.price);
    max = Math.max(max, product.price);
    if (isOnSale(product)) saleCount += 1;
    if (product.sustainable) sustainableCount += 1;
  }

  return {
    categories: categories
      .filter((category) => categoryCounts.has(category.slug))
      .map((category) => ({
        value: category.slug,
        label: category.name,
        count: categoryCounts.get(category.slug)!,
      })),
    departments: (["women", "men", "unisex"] as Department[])
      .filter((department) => departmentCounts.has(department))
      .map((department) => ({
        value: department,
        label:
          department === "unisex" ? "Unisex" : department === "women" ? "Women" : "Men",
        count: departmentCounts.get(department)!,
      })),
    colors: [...colorCounts.entries()]
      .map(([value, meta]) => ({
        value,
        label: meta.label,
        hex: meta.hex,
        count: meta.count,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    sizes: [...sizeCounts.entries()]
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => {
        const ai = SIZE_ORDER.indexOf(a.value);
        const bi = SIZE_ORDER.indexOf(b.value);
        // Unknown labels sort last rather than jumping to the front.
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      }),
    priceRange: { min: Number.isFinite(min) ? min : 0, max },
    saleCount,
    sustainableCount,
  };
}

/* ------------------------------------------------------------------ */
/* Curated queries                                                     */
/* ------------------------------------------------------------------ */

export async function productsInCategory(slug: CategorySlug): Promise<Product[]> {
  return (await allProducts()).filter((product) => product.category === slug);
}

export async function productsInCollection(slug: CollectionSlug): Promise<Product[]> {
  return (await allProducts()).filter((product) => product.collections.includes(slug));
}

/**
 * Products for the home page "New arrivals" section.
 *
 * Three sources, in order of how deliberate they are:
 *
 * 1. Products a merchant ticked "Show on the home page" on — an explicit choice, so
 *    it outranks everything.
 * 2. The `new-arrivals` collection.
 * 3. The newest products.
 *
 * Falling through rather than returning empty matters: a merchant who has not
 * discovered the tick box yet still gets a populated home page, and one who ticks a
 * single product gets exactly that product rather than it being diluted by the
 * collection.
 */
export async function newArrivals(limit = 8): Promise<Product[]> {
  const everything = await allProducts();

  const picked = everything.filter((product) => product.showOnHome);
  if (picked.length > 0) return sortProducts(picked, "newest").slice(0, limit);

  const tagged = await productsInCollection("new-arrivals");
  const source = tagged.length > 0 ? tagged : everything;
  return sortProducts(source, "newest").slice(0, limit);
}

export async function bestSellers(limit = 8): Promise<Product[]> {
  const items = await productsInCollection("best-sellers");
  const source = items.length > 0 ? items : await allProducts();
  return sortProducts(source, "featured").slice(0, limit);
}

export async function onSaleProducts(limit?: number): Promise<Product[]> {
  const items = sortProducts((await allProducts()).filter(isOnSale), "featured");
  return typeof limit === "number" ? items.slice(0, limit) : items;
}

/**
 * "You may also like". Prefers the curated `pairsWith` list, then fills from the same
 * category, then from shared collections — never the product itself, never a repeat.
 */
export async function relatedProducts(product: Product, limit = 4): Promise<Product[]> {
  const products = await allProducts();
  const picked = new Map<string, Product>();

  const add = (candidate: Product) => {
    if (candidate.id === product.id) return;
    if (picked.size >= limit) return;
    if (!picked.has(candidate.id)) picked.set(candidate.id, candidate);
  };

  for (const slug of product.pairsWith ?? []) {
    const match = products.find((candidate) => candidate.slug === slug);
    if (match) add(match);
  }

  if (picked.size < limit) {
    sortProducts(
      products.filter((candidate) => candidate.category === product.category),
      "featured",
    ).forEach(add);
  }

  if (picked.size < limit) {
    sortProducts(
      products.filter((candidate) =>
        candidate.collections.some((slug) => product.collections.includes(slug)),
      ),
      "featured",
    ).forEach(add);
  }

  return [...picked.values()].slice(0, limit);
}
