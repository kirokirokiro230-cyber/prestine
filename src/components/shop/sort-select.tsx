"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CaretDown } from "@phosphor-icons/react";
import { sortOptions } from "@/lib/config";
import { buildQueryString } from "@/lib/search-params";
import type { SortKey } from "@/lib/types";

/**
 * Sort control. A native `<select>` on purpose — it gets the platform's own
 * picker on mobile, full keyboard support for free, and no focus-management bugs.
 */
export function SortSelect({ value, basePath }: { value: SortKey; basePath: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <div className="relative">
      <label htmlFor="sort" className="sr-only">
        Sort products by
      </label>
      <select
        id="sort"
        value={value}
        onChange={(event) => {
          router.push(
            `${basePath}${buildQueryString(searchParams, {
              sort: event.target.value as SortKey,
            })}`,
            { scroll: false },
          );
        }}
        className="h-11 cursor-pointer appearance-none border border-line-strong bg-surface pl-3.5 pr-9 text-xs text-content transition-colors hover:border-content focus:border-accent focus:outline-none"
      >
        {sortOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <CaretDown
        size={12}
        aria-hidden
        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-content-muted"
      />
    </div>
  );
}
