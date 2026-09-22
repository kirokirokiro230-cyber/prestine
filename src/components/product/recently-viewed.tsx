"use client";

import { useRecentlyViewed } from "@/components/providers/recently-viewed-provider";
import { ProductRail } from "@/components/product/product-grid";
import { SectionHeading } from "@/components/ui/section-heading";
import { useProductSummaries } from "@/hooks/use-product-summaries";

/**
 * "Recently viewed" rail.
 *
 * The visited slugs live in the browser, so the summaries are fetched rather than
 * imported — that keeps the catalogue out of the client bundle. Renders nothing
 * until there is something worth showing; an empty section header is worse than no
 * section.
 */
export function RecentlyViewed({ excludeSlug }: { excludeSlug?: string }) {
  const { slugs, hydrated } = useRecentlyViewed();
  const wanted = slugs.filter((slug) => slug !== excludeSlug);
  const { products } = useProductSummaries("slugs", wanted);

  if (!hydrated || products.length < 2) return null;

  return (
    <section className="page-gutter mx-auto max-w-page py-16">
      <SectionHeading
        eyebrow="Picked up where you left off"
        title="Recently viewed"
        className="mb-8"
      />
      <ProductRail products={products} />
    </section>
  );
}
