"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Leaf } from "@phosphor-icons/react";
import { Checkbox } from "@/components/ui/field";
import { useMoney } from "@/components/providers/store-provider";
import type { FacetSet } from "@/lib/catalog";
import { buildQueryString, toggleListValue } from "@/lib/search-params";
import type { ProductFilters } from "@/lib/types";
import { cn } from "@/lib/utils";

interface FilterPanelProps {
  facets: FacetSet;
  filters: ProductFilters;
  /** Base path to push to, e.g. "/shop" or "/shop/knitwear". */
  basePath: string;
  /** Hide the category group on a category page where it is redundant. */
  hideCategories?: boolean;
  onAfterChange?: () => void;
  className?: string;
}

const PRICE_BANDS: Array<{ label: string; min?: number; max?: number }> = [
  { label: "Under $100", max: 9999 },
  { label: "$100 – $200", min: 10000, max: 20000 },
  { label: "$200 – $350", min: 20000, max: 35000 },
  { label: "$350 – $500", min: 35000, max: 50000 },
  { label: "$500 and above", min: 50000 },
];

/**
 * Faceted filter rail.
 *
 * Every interaction writes to the URL and lets the server re-render the results,
 * so the list, the count and the address bar are always the same truth. Counts
 * come from the unfiltered scope, so a shopper can see what a filter would add.
 */
export function FilterPanel({
  facets,
  filters,
  basePath,
  hideCategories = false,
  onAfterChange,
  className,
}: FilterPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const money = useMoney();

  const push = useCallback(
    (update: Parameters<typeof buildQueryString>[1]) => {
      router.push(`${basePath}${buildQueryString(searchParams, update)}`, {
        scroll: false,
      });
      onAfterChange?.();
    },
    [basePath, onAfterChange, router, searchParams],
  );

  const activeBandIndex = PRICE_BANDS.findIndex(
    (band) => band.min === filters.minPrice && band.max === filters.maxPrice,
  );

  return (
    <div className={cn("flex flex-col divide-y divide-line", className)}>
      {/* Quick toggles */}
      <Group title="Refine">
        <div className="flex flex-col gap-3">
          <Checkbox
            label={`On sale (${facets.saleCount})`}
            checked={Boolean(filters.onSale)}
            onChange={(event) => push({ sale: event.target.checked })}
          />
          <Checkbox
            label={
              <span className="inline-flex items-center gap-1.5">
                <Leaf size={13} weight="fill" aria-hidden className="text-moss-500" />
                Lower impact ({facets.sustainableCount})
              </span>
            }
            checked={Boolean(filters.sustainable)}
            onChange={(event) => push({ sustainable: event.target.checked })}
          />
        </div>
      </Group>

      {/* Department */}
      {facets.departments.length > 1 ? (
        <Group title="Department">
          <div className="flex flex-col gap-3">
            {facets.departments.map((facet) => (
              <Checkbox
                key={facet.value}
                label={`${facet.label} (${facet.count})`}
                checked={filters.departments.includes(facet.value)}
                onChange={() =>
                  push({ department: toggleListValue(filters.departments, facet.value) })
                }
              />
            ))}
          </div>
        </Group>
      ) : null}

      {/* Category */}
      {!hideCategories && facets.categories.length > 1 ? (
        <Group title="Category">
          <div className="flex flex-col gap-3">
            {facets.categories.map((facet) => (
              <Checkbox
                key={facet.value}
                label={`${facet.label} (${facet.count})`}
                checked={filters.categories.includes(facet.value)}
                onChange={() =>
                  push({ category: toggleListValue(filters.categories, facet.value) })
                }
              />
            ))}
          </div>
        </Group>
      ) : null}

      {/* Size */}
      {facets.sizes.length > 0 ? (
        <Group title="Size">
          <div className="flex flex-wrap gap-2">
            {facets.sizes.map((facet) => {
              const active = filters.sizes.includes(facet.value);
              return (
                <button
                  key={facet.value}
                  type="button"
                  onClick={() => push({ size: toggleListValue(filters.sizes, facet.value) })}
                  aria-pressed={active}
                  className={cn(
                    "min-w-11 border px-3 py-2.5 text-xs transition-colors",
                    active
                      ? "border-inverse bg-inverse text-on-inverse"
                      : "border-line-strong text-content hover:border-content",
                  )}
                >
                  {facet.label}
                  <span className="sr-only"> — {facet.count} pieces</span>
                </button>
              );
            })}
          </div>
        </Group>
      ) : null}

      {/* Colour */}
      {facets.colors.length > 0 ? (
        <Group title="Colour">
          <ul className="grid grid-cols-2 gap-x-3 gap-y-2">
            {facets.colors.map((facet) => {
              const active = filters.colors.includes(facet.value);
              return (
                <li key={facet.value}>
                  <button
                    type="button"
                    onClick={() => push({ color: toggleListValue(filters.colors, facet.value) })}
                    aria-pressed={active}
                    className="group flex min-h-11 w-full items-center gap-2.5 text-left"
                  >
                    <span
                      aria-hidden
                      style={{ backgroundColor: facet.hex }}
                      className={cn(
                        "size-4 shrink-0 rounded-full ring-1 ring-inset ring-black/15 transition-[box-shadow]",
                        active && "ring-2 ring-offset-2 ring-offset-canvas ring-content",
                      )}
                    />
                    <span
                      className={cn(
                        "truncate text-sm transition-colors",
                        active ? "text-content" : "text-content-muted group-hover:text-content",
                      )}
                    >
                      {facet.label}
                    </span>
                    <span data-numeric className="ml-auto text-xs text-content-subtle">
                      {facet.count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Group>
      ) : null}

      {/* Price */}
      <Group title="Price">
        <div className="flex flex-col gap-3">
          {PRICE_BANDS.map((band, index) => (
            <Checkbox
              key={band.label}
              label={band.label}
              checked={activeBandIndex === index}
              onChange={(event) =>
                push(
                  event.target.checked
                    ? { minPrice: band.min ?? null, maxPrice: band.max ?? null }
                    : { minPrice: null, maxPrice: null },
                )
              }
            />
          ))}
          <p className="pt-1 text-xs text-content-subtle">
            Catalogue ranges {money(facets.priceRange.min)} –{" "}
            {money(facets.priceRange.max)}
          </p>
        </div>
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="py-6 first:pt-0">
      <h3 className="eyebrow mb-4">{title}</h3>
      {children}
    </section>
  );
}
