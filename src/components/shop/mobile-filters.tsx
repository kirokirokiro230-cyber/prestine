"use client";

import { useState } from "react";
import { FadersHorizontal } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import type { FacetSet } from "@/lib/catalog";
import { countActiveFilters } from "@/lib/search-params";
import type { ProductFilters } from "@/lib/types";
import { FilterPanel } from "./filter-panel";

/**
 * Mobile/tablet entry point to the same FilterPanel used on desktop. Sharing the
 * panel means the two never drift apart in behaviour.
 */
export function MobileFilters({
  facets,
  filters,
  basePath,
  hideCategories,
  resultCount,
}: {
  facets: FacetSet;
  filters: ProductFilters;
  basePath: string;
  hideCategories?: boolean;
  resultCount: number;
}) {
  const [open, setOpen] = useState(false);
  const active = countActiveFilters(filters);

  return (
    <>
      <Button
        variant="secondary"
        size="md"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className="lg:hidden"
      >
        <FadersHorizontal size={15} aria-hidden />
        Filters
        {active > 0 ? (
          <span data-numeric className="ml-0.5">
            ({active})
          </span>
        ) : null}
      </Button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        side="left"
        title="Filters"
        description={`${resultCount} ${resultCount === 1 ? "piece" : "pieces"}`}
        footer={
          <Button block size="lg" onClick={() => setOpen(false)}>
            Show {resultCount} {resultCount === 1 ? "piece" : "pieces"}
          </Button>
        }
      >
        <div className="px-5 py-5 sm:px-6">
          <FilterPanel
            facets={facets}
            filters={filters}
            basePath={basePath}
            hideCategories={hideCategories}
          />
        </div>
      </Drawer>
    </>
  );
}
