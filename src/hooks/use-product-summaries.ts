"use client";

import { useEffect, useState } from "react";
import type { ProductSummary } from "@/lib/types";

interface Result {
  products: ProductSummary[];
  loading: boolean;
}

/**
 * Resolve product summaries for ids or slugs held in the browser.
 *
 * Saved items and recently-viewed only store identifiers, so they have to be
 * looked up. Going through `/api/products` rather than importing the catalogue
 * keeps the full product list out of the client bundle, and means prices
 * are current rather than frozen at the moment something was saved.
 *
 * The fetched set is tagged with the query it belongs to, so `products` is derived
 * rather than reset in an effect — results for a previous set of ids can never be
 * shown against a new one.
 */
export function useProductSummaries(key: "ids" | "slugs", values: string[]): Result {
  // Joined so the effect depends on the contents, not the array identity.
  const query = values.join(",");

  const [result, setResult] = useState<{ query: string; products: ProductSummary[] }>({
    query: "",
    products: [],
  });

  useEffect(() => {
    if (!query) return;

    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`/api/products?${key}=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Product lookup failed");
        const data = (await response.json()) as { products: ProductSummary[] };
        if (!cancelled) setResult({ query, products: data.products });
      } catch (error) {
        if (!cancelled && (error as Error).name !== "AbortError") {
          // Tagged with the query so the caller stops loading and shows nothing
          // rather than spinning forever.
          setResult({ query, products: [] });
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [key, query]);

  const settled = result.query === query;

  return {
    products: settled ? result.products : [],
    loading: Boolean(query) && !settled,
  };
}
