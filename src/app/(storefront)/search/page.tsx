import type { Metadata } from "next";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { ProductListing } from "@/components/shop/product-listing";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { allCategories, searchProducts } from "@/lib/catalog";
import { parseSearchParams, type RawSearchParams } from "@/lib/search-params";

export const metadata: Metadata = {
  title: "Search",
  // Search result pages should not compete with category pages in the index.
  robots: { index: false, follow: true },
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const [params, categories] = await Promise.all([searchParams, allCategories()]);

  const { filters, sort, page } = parseSearchParams(params, {
    categorySlugs: categories.map((category) => category.slug),
  });
  const query = filters.search ?? "";

  // Rank by relevance first, then hand the ranked set to the shared listing so
  // filters and pagination behave exactly as they do elsewhere.
  const matches = query ? await searchProducts(query) : [];

  if (!query) {
    return (
      <div className="page-gutter mx-auto max-w-page py-12">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Search" }]} />
        <EmptyState
          icon={<MagnifyingGlass size={22} aria-hidden />}
          title="What are you looking for?"
          description="Search by piece, fabric, colour or category — try “cashmere”, “selvedge” or “linen”."
        >
          <ButtonLink href="/shop" size="md">
            Browse all clothing
          </ButtonLink>
        </EmptyState>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="page-gutter mx-auto max-w-page py-12">
        <Breadcrumbs
          items={[{ label: "Home", href: "/" }, { label: `Search: ${query}` }]}
        />

        <EmptyState
          icon={<MagnifyingGlass size={22} aria-hidden />}
          title={`No results for “${query}”`}
          description="Our range is small by design, so specific terms can come up empty. Try a broader word, or browse a category below."
        >
          <ButtonLink href="/shop" size="md">
            Browse all clothing
          </ButtonLink>
        </EmptyState>

        <div className="mx-auto max-w-2xl">
          <p className="eyebrow mb-4 text-center">Categories</p>
          <ul className="flex flex-wrap justify-center gap-2">
            {categories.map((category) => (
              <li key={category.slug}>
                <ButtonLink
                  href={`/shop/${category.slug}`}
                  variant="secondary"
                  size="sm"
                >
                  {category.name}
                </ButtonLink>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <ProductListing
      scope={matches}
      // `search` is already applied by searchProducts; re-applying it inside the
      // listing would be harmless but wasteful.
      filters={{ ...filters, search: undefined }}
      sort={sort}
      page={page}
      basePath="/search"
      searchParams={params}
      preserveScopeOrder
      eyebrow="Search results"
      title={`“${query}”`}
      description={`${matches.length} ${matches.length === 1 ? "piece" : "pieces"} matched your search.`}
      breadcrumbs={[{ label: "Home", href: "/" }, { label: `Search: ${query}` }]}
    />
  );
}
