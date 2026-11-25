import type { Metadata } from "next";
import { ProductListing } from "@/components/shop/product-listing";
import { allCategories, allProducts } from "@/lib/catalog";
import { parseSearchParams, type RawSearchParams } from "@/lib/search-params";

export const metadata: Metadata = {
  title: "All clothing",
  description:
    "The full PRESTINE range — tailored outerwear, hand-finished knitwear, shirting, denim and leather goods. Filter by category, size, colour and price.",
  alternates: { canonical: "/shop" },
};

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const [params, scope, categories] = await Promise.all([
    searchParams,
    allProducts(),
    allCategories(),
  ]);

  const { filters, sort, page } = parseSearchParams(params, {
    categorySlugs: categories.map((category) => category.slug),
  });

  return (
    <ProductListing
      scope={scope}
      filters={filters}
      sort={sort}
      page={page}
      basePath="/shop"
      searchParams={params}
      eyebrow="The full range"
      title="All clothing"
      description="Thirty-three pieces. Each one specified line by line — fabric weight, mill, construction — so you can judge it on more than a photograph."
      breadcrumbs={[{ label: "Home", href: "/" }, { label: "All clothing" }]}
    />
  );
}
