import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { ProductGrid } from "@/components/product/product-grid";
import { Breadcrumbs, type Crumb } from "@/components/ui/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { buildFacets, filterProducts, sortProducts } from "@/lib/catalog";
import { PAGE_SIZE, buildQueryString } from "@/lib/search-params";
import type { Product, ProductFilters, SortKey } from "@/lib/types";
import { ActiveFilters } from "./active-filters";
import { FilterPanel } from "./filter-panel";
import { MobileFilters } from "./mobile-filters";
import { Pagination } from "./pagination";
import { SortSelect } from "./sort-select";

interface ProductListingProps {
  /** The unfiltered scope for this page — all products, one category, one collection. */
  scope: Product[];
  filters: ProductFilters;
  sort: SortKey;
  page: number;
  basePath: string;
  /** Raw query object, needed to build pagination links on the server. */
  searchParams: Record<string, string | string[] | undefined>;
  eyebrow?: string;
  title: string;
  description?: string;
  breadcrumbs?: Crumb[];
  hideCategories?: boolean;
  /**
   * Keep the incoming order of `scope` when no explicit sort is chosen. Search
   * uses this so relevance ranking is not overwritten by the default sort.
   */
  preserveScopeOrder?: boolean;
}

/**
 * Shared listing view behind /shop, /shop/[category], /collections/[slug] and
 * /search.
 *
 * Runs on the server: filtering, sorting and pagination all happen before the
 * HTML is sent, so the first paint already shows the correct products and the
 * page is fully indexable. Only the controls are client components.
 */
export async function ProductListing({
  scope,
  filters,
  sort,
  page,
  basePath,
  searchParams,
  eyebrow,
  title,
  description,
  breadcrumbs,
  hideCategories = false,
  preserveScopeOrder = false,
}: ProductListingProps) {
  // Facets are built from the page scope, before filters, so counts show what a
  // filter would add rather than collapsing to zero as selections are made.
  const facets = await buildFacets(scope);

  const filtered = filterProducts(scope, filters);
  const sorted =
    preserveScopeOrder && sort === "featured" ? filtered : sortProducts(filtered, sort);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const currentParams = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    currentParams.set(key, Array.isArray(value) ? value.join(",") : value);
  }

  const hrefFor = (target: number) =>
    `${basePath}${buildQueryString(currentParams, { page: target })}`;

  return (
    <div className="page-gutter mx-auto max-w-page py-8 lg:py-12">
      {breadcrumbs ? <Breadcrumbs items={breadcrumbs} className="mb-6" /> : null}

      <header className="max-w-2xl">
        {eyebrow ? <p className="eyebrow mb-3">{eyebrow}</p> : null}
        <h1 className="text-4xl leading-[1.05] sm:text-5xl">{title}</h1>
        {description ? (
          <p className="mt-4 text-sm leading-relaxed text-content-muted sm:text-base">
            {description}
          </p>
        ) : null}
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[16rem_1fr] lg:gap-12">
        {/* Desktop filter rail */}
        <aside className="hidden lg:block">
          <div className="sticky top-28">
            <h2 className="sr-only">Filter products</h2>
            <FilterPanel
              facets={facets}
              filters={filters}
              basePath={basePath}
              hideCategories={hideCategories}
              className="max-h-[calc(100dvh-9rem)] overflow-y-auto pr-2 scrollbar-thin"
            />
          </div>
        </aside>

        <div className="min-w-0">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
            <div className="flex items-center gap-3">
              <MobileFilters
                facets={facets}
                filters={filters}
                basePath={basePath}
                hideCategories={hideCategories}
                resultCount={sorted.length}
              />
              <p
                data-numeric
                // Stable hook for the HTTP smoke test, which needs to read the
                // result count without depending on the rendered wording.
                data-result-count={sorted.length}
                className="text-xs text-content-muted"
                aria-live="polite"
              >
                {sorted.length} {sorted.length === 1 ? "piece" : "pieces"}
                {totalPages > 1 ? (
                  <span className="text-content-subtle">
                    {" "}
                    · page {safePage} of {totalPages}
                  </span>
                ) : null}
              </p>
            </div>

            <SortSelect value={sort} basePath={basePath} />
          </div>

          <div className="pt-5">
            <ActiveFilters filters={filters} facets={facets} basePath={basePath} />
          </div>

          {paged.length > 0 ? (
            <>
              <div className="mt-8">
                <ProductGrid products={paged} columns={3} priorityCount={3} />
              </div>
              <div className="mt-14">
                <Pagination page={safePage} totalPages={totalPages} hrefFor={hrefFor} />
              </div>
            </>
          ) : (
            <EmptyState
              icon={<MagnifyingGlass size={22} aria-hidden />}
              title="Nothing matches those filters"
              description="Try removing a filter, or widen the price range. Our range is small by design, so specific combinations can come up empty."
            >
              <ButtonLink href={basePath} variant="outline" size="md">
                Clear all filters
              </ButtonLink>
              <ButtonLink href="/collections/best-sellers" size="md">
                Shop best sellers
              </ButtonLink>
            </EmptyState>
          )}
        </div>
      </div>
    </div>
  );
}
