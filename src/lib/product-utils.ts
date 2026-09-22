import type { Product, ProductSummary } from "./types";

/**
 * Pure product predicates.
 *
 * Deliberately in their own module with no data import: client components need
 * these, and pulling them from `catalog.ts` would drag the entire product
 * catalogue into the browser bundle. Each takes the narrowest shape it needs so
 * it works on both a full `Product` and a `ProductSummary`.
 *
 * There is nothing here about availability. The shop does not track inventory —
 * every size is always purchasable — so "sold out" and "low stock" are not states
 * this app can be in.
 */

/** Catalogue reference date, so "new" is stable between builds. */
const CATALOGUE_NOW = Date.UTC(2026, 6, 20);
const NEW_FOR_DAYS = 45;

export function isOnSale(product: { price: number; compareAtPrice?: number }): boolean {
  return typeof product.compareAtPrice === "number" && product.compareAtPrice > product.price;
}

export function isNew(product: { releasedAt: string }): boolean {
  return CATALOGUE_NOW - new Date(product.releasedAt).getTime() <= NEW_FOR_DAYS * 86_400_000;
}

export type BadgeTone = "sale" | "new";

/**
 * The single badge shown on a product card, chosen by priority. One badge only —
 * a card stacked with labels communicates nothing.
 *
 * A discount outranks newness: a shopper scanning a grid is looking for the price.
 */
export function primaryBadge(
  product: Pick<Product, "price" | "compareAtPrice" | "releasedAt">,
): { label: string; tone: BadgeTone } | null {
  if (isOnSale(product)) {
    const compareAt = product.compareAtPrice as number;
    const off = Math.round(((compareAt - product.price) / compareAt) * 100);
    return { label: `${off}% off`, tone: "sale" };
  }

  if (isNew(product)) return { label: "New", tone: "new" };

  return null;
}

/** Narrow a full product record to the projection client components receive. */
export function toSummary(product: Product): ProductSummary {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    tagline: product.tagline,
    department: product.department,
    category: product.category,
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    sizeSystem: product.sizeSystem,
    colors: product.colors,
    sizes: product.sizes,
    rating: product.rating,
    reviewCount: product.reviewCount,
    releasedAt: product.releasedAt,
    sustainable: product.sustainable,
  };
}
