"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ClockCounterClockwise, MagnifyingGlass, X } from "@phosphor-icons/react";
import { useSearch } from "@/components/providers/search-provider";
import { Price } from "@/components/ui/price";
import { useResetOnChange } from "@/hooks/use-store";
import { useEscapeKey, useScrollLock } from "@/hooks/use-ui";
import type { SearchResultItem } from "@/app/api/search/route";
import { cn } from "@/lib/utils";

const SUGGESTIONS = ["cashmere", "overcoat", "selvedge denim", "linen", "wide leg"];

/**
 * Full-width search panel.
 *
 * Results come from `/api/search` rather than importing the catalogue, which
 * keeps ~60KB of product copy out of the client bundle. Requests are debounced
 * and superseded requests are aborted so a fast typist never sees stale results
 * land out of order.
 */
export function SearchOverlay({
  categories,
}: {
  categories: Array<{ slug: string; name: string }>;
}) {
  const { isOpen, closeSearch, recent, remember, clearRecent } = useSearch();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useScrollLock(isOpen);
  useEscapeKey(isOpen, closeSearch);

  // Clear the field between openings, during render so the previous query is
  // never briefly visible when the panel reopens.
  useResetOnChange(isOpen, () => {
    setQuery("");
    setResults([]);
    setLoading(false);
  });

  // Moving focus is a DOM side effect, which is what effects are for.
  useEffect(() => {
    if (!isOpen) return;
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery.length >= 2;

  useEffect(() => {
    if (trimmedQuery.length < 2) return;

    const controller = new AbortController();
    let cancelled = false;

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(trimmedQuery)}&limit=6`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Search request failed");
        const data = (await response.json()) as { results: SearchResultItem[] };
        if (!cancelled) setResults(data.results);
      } catch (error) {
        if (!cancelled && (error as Error).name !== "AbortError") setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);

    // Supersede in-flight work so a fast typist never sees stale results land.
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmedQuery]);

  if (!isOpen) return null;

  // Results are only meaningful for the query they were fetched for.
  const visibleResults = isSearching ? results : [];

  const submit = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length < 2) return;
    remember(trimmed);
    closeSearch();
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="fixed inset-0 z-90">
      <button
        type="button"
        aria-label="Close search"
        onClick={closeSearch}
        className="absolute inset-0 h-full w-full animate-fade-in cursor-default bg-overlay backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search products"
        className="relative max-h-[90vh] overflow-y-auto bg-canvas shadow-lg"
      >
        <div className="page-gutter mx-auto max-w-page py-5">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit(query);
            }}
            role="search"
            className="flex items-center gap-3 border-b border-line-strong pb-3"
          >
            <MagnifyingGlass size={20} aria-hidden className="shrink-0 text-content-muted" />
            <label htmlFor="site-search" className="sr-only">
              Search products
            </label>
            <input
              ref={inputRef}
              id="site-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search for a piece, a fabric, a colour…"
              autoComplete="off"
              className="h-10 flex-1 bg-transparent text-base text-content placeholder:text-content-subtle focus:outline-none sm:text-lg"
            />
            <button
              type="button"
              onClick={closeSearch}
              aria-label="Close search"
              className="grid size-10 shrink-0 place-items-center rounded-full text-content-muted transition-colors hover:bg-surface-sunken hover:text-content"
            >
              <X size={18} aria-hidden />
            </button>
          </form>

          {/* Results */}
          <div className="py-6" aria-live="polite" aria-busy={loading}>
            {isSearching ? (
              visibleResults.length > 0 ? (
                <>
                  <p className="eyebrow mb-4">
                    {visibleResults.length}{" "}
                    {visibleResults.length === 1 ? "result" : "results"}
                  </p>
                  <ul className="grid gap-1 sm:grid-cols-2">
                    {visibleResults.map((result) => (
                      <li key={result.slug}>
                        <Link
                          href={`/product/${result.slug}?color=${result.colorId}`}
                          onClick={() => {
                            remember(query);
                            closeSearch();
                          }}
                          className="flex items-center gap-4 p-3 transition-colors hover:bg-surface-sunken"
                        >
                          <span
                            aria-hidden
                            style={{ backgroundColor: result.colorHex }}
                            className="size-10 shrink-0 ring-1 ring-inset ring-black/10"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-content">
                              {result.name}
                            </span>
                            <span className="block truncate text-xs text-content-muted">
                              {result.tagline}
                            </span>
                          </span>
                          <Price
                            value={result.price}
                            compareAt={result.compareAtPrice}
                            className="shrink-0"
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={() => submit(query)}
                    className="group mt-5 inline-flex items-center gap-2 text-2xs font-medium uppercase tracking-[0.14em] text-content"
                  >
                    <span className="link-underline">See all results for “{query.trim()}”</span>
                    <ArrowRight
                      size={13}
                      aria-hidden
                      className="transition-transform duration-300 group-hover:translate-x-1"
                    />
                  </button>
                </>
              ) : loading ? (
                <p className="text-sm text-content-muted">Searching…</p>
              ) : (
                <div>
                  <p className="text-sm text-content">
                    Nothing matched “{query.trim()}”.
                  </p>
                  <p className="mt-1.5 text-sm text-content-muted">
                    Try a fabric (cashmere, linen), a category (knitwear, denim) or a
                    colour.
                  </p>
                </div>
              )
            ) : (
              <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {recent.length > 0 ? (
                  <div>
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <p className="eyebrow">Recent</p>
                      <button
                        type="button"
                        onClick={clearRecent}
                        className="text-2xs uppercase tracking-[0.1em] text-content-subtle transition-colors hover:text-content"
                      >
                        Clear
                      </button>
                    </div>
                    <ul className="flex flex-col gap-1">
                      {recent.map((term) => (
                        <li key={term}>
                          <button
                            type="button"
                            onClick={() => submit(term)}
                            className="flex min-h-9 w-full items-center gap-2 text-left text-sm text-content-muted transition-colors hover:text-content"
                          >
                            <ClockCounterClockwise size={14} aria-hidden className="shrink-0" />
                            {term}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div>
                  <p className="eyebrow mb-4">Popular searches</p>
                  <ul className="flex flex-wrap gap-2">
                    {SUGGESTIONS.map((term) => (
                      <li key={term}>
                        <button
                          type="button"
                          onClick={() => setQuery(term)}
                          className="border border-line px-3 py-2 text-xs text-content-muted transition-colors hover:border-line-strong hover:text-content"
                        >
                          {term}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className={cn(recent.length > 0 && "sm:col-span-2 lg:col-span-1")}>
                  <p className="eyebrow mb-4">Browse categories</p>
                  <ul className="grid grid-cols-2 gap-x-4">
                    {categories.map((category) => (
                      <li key={category.slug}>
                        <Link
                          href={`/shop/${category.slug}`}
                          onClick={closeSearch}
                          className="flex min-h-9 items-center text-sm text-content-muted transition-colors hover:text-content"
                        >
                          {category.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
