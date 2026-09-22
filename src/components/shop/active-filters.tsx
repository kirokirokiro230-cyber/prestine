"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { X } from "@phosphor-icons/react";
import type { FacetSet } from "@/lib/catalog";
import { useMoney } from "@/components/providers/store-provider";
import { buildQueryString, countActiveFilters } from "@/lib/search-params";
import type { ProductFilters } from "@/lib/types";

interface ActiveFiltersProps {
  filters: ProductFilters;
  facets: FacetSet;
  basePath: string;
}

/**
 * Removable chips for whatever is currently applied.
 *
 * Without this, faceted filtering becomes a guessing game — the shopper can see
 * a short result list but not why. Each chip removes exactly one constraint.
 */
export function ActiveFilters({ filters, facets, basePath }: ActiveFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const money = useMoney();

  const total = countActiveFilters(filters);
  if (total === 0) return null;

  const push = (update: Parameters<typeof buildQueryString>[1]) => {
    router.push(`${basePath}${buildQueryString(searchParams, update)}`, { scroll: false });
  };

  const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];

  for (const value of filters.departments) {
    const label = facets.departments.find((d) => d.value === value)?.label ?? value;
    chips.push({
      key: `department-${value}`,
      label,
      onRemove: () =>
        push({ department: filters.departments.filter((d) => d !== value) }),
    });
  }

  for (const value of filters.categories) {
    const label = facets.categories.find((c) => c.value === value)?.label ?? value;
    chips.push({
      key: `category-${value}`,
      label,
      onRemove: () => push({ category: filters.categories.filter((c) => c !== value) }),
    });
  }

  for (const value of filters.sizes) {
    chips.push({
      key: `size-${value}`,
      label: `Size ${value}`,
      onRemove: () => push({ size: filters.sizes.filter((s) => s !== value) }),
    });
  }

  for (const value of filters.colors) {
    const label = facets.colors.find((c) => c.value === value)?.label ?? value;
    chips.push({
      key: `color-${value}`,
      label,
      onRemove: () => push({ color: filters.colors.filter((c) => c !== value) }),
    });
  }

  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    const from = filters.minPrice !== undefined ? money(filters.minPrice) : null;
    const to = filters.maxPrice !== undefined ? money(filters.maxPrice) : null;
    chips.push({
      key: "price",
      label: from && to ? `${from} – ${to}` : from ? `${from}+` : `Under ${to}`,
      onRemove: () => push({ minPrice: null, maxPrice: null }),
    });
  }

  if (filters.onSale) {
    chips.push({ key: "sale", label: "On sale", onRemove: () => push({ sale: false }) });
  }
  if (filters.sustainable) {
    chips.push({
      key: "sustainable",
      label: "Lower impact",
      onRemove: () => push({ sustainable: false }),
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="sr-only" aria-live="polite">
        {total} {total === 1 ? "filter" : "filters"} applied
      </span>

      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
          className="group inline-flex items-center gap-1.5 border border-line-strong px-3 py-1.5 text-xs text-content transition-colors hover:border-content"
        >
          {chip.label}
          <X
            size={11}
            aria-hidden
            className="text-content-subtle transition-colors group-hover:text-content"
          />
          <span className="sr-only">Remove filter</span>
        </button>
      ))}

      <button
        type="button"
        onClick={() =>
          push({
            category: [],
            department: [],
            color: [],
            size: [],
            minPrice: null,
            maxPrice: null,
            sale: false,
            sustainable: false,
          })
        }
        className="link-underline ml-1 py-1.5 text-xs text-content-muted transition-colors hover:text-content"
      >
        Clear all
      </button>
    </div>
  );
}
