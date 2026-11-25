"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CaretLeft, CaretRight, Copy, MagnifyingGlass } from "@phosphor-icons/react";
import {
  deleteProductAction,
  duplicateProductAction,
  setStatusAction,
} from "@/app/admin/actions/products";
import { Button } from "@/components/ui/button";
import { createMoneyFormatter } from "@/lib/format";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ConfirmSubmit, StatusPill } from "./primitives";

/**
 * Products table with filters and bulk actions.
 *
 * Filters write to the URL and let the server re-query, so the table, the count and
 * the address bar always agree. Selection is local state — it should not survive a
 * filter change, because the rows it referred to may no longer be on screen.
 */
export function ProductsTable({
  products,
  total,
  page,
  totalPages,
  categories,
  collections,
  currency,
  locale,
}: {
  products: Product[];
  total: number;
  page: number;
  totalPages: number;
  categories: Array<{ slug: string; name: string }>;
  collections: Array<{ slug: string; name: string }>;
  currency: string;
  locale: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const money = createMoneyFormatter(currency, locale);

  const [selected, setSelected] = useState<string[]>([]);

  const setParam = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    // Any filter change invalidates the current page number.
    if (!("page" in updates)) next.delete("page");
    setSelected([]);
    router.push(`/admin/products?${next.toString()}`);
  };

  const allOnPageSelected =
    products.length > 0 && products.every((product) => selected.includes(product.id));

  const toggleAll = () => {
    setSelected(allOnPageSelected ? [] : products.map((product) => product.id));
  };

  return (
    <div>
      {/* Filter bar */}
      <div className="grid gap-3 border-b border-line bg-surface-sunken/45 px-5 py-4 md:grid-cols-2 xl:grid-cols-[minmax(16rem,1fr)_repeat(4,auto)] xl:items-end">
        <div className="relative min-w-52 flex-1">
          <label htmlFor="product-search" className="sr-only">
            Search products
          </label>
          <MagnifyingGlass
            size={14}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-content-muted"
          />
          <input
            id="product-search"
            type="search"
            defaultValue={searchParams.get("q") ?? ""}
            placeholder="Name, SKU, slug or colour"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                setParam({ q: (event.target as HTMLInputElement).value });
              }
            }}
            className="h-10 w-full border border-line-strong bg-surface pl-9 pr-3 text-sm shadow-xs placeholder:text-content-subtle transition-[border-color,box-shadow] focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/10"
          />
        </div>

        <Select
          label="Status"
          value={searchParams.get("status") ?? "all"}
          onChange={(value) => setParam({ status: value === "all" ? null : value })}
          options={[
            { value: "all", label: "All statuses" },
            { value: "active", label: "Active" },
            { value: "draft", label: "Draft" },
            { value: "archived", label: "Archived" },
          ]}
        />

        <Select
          label="Category"
          value={searchParams.get("category") ?? "all"}
          onChange={(value) => setParam({ category: value === "all" ? null : value })}
          options={[
            { value: "all", label: "All categories" },
            ...categories.map((category) => ({
              value: category.slug,
              label: category.name,
            })),
          ]}
        />

        <Select
          label="Collection"
          value={searchParams.get("collection") ?? "all"}
          onChange={(value) => setParam({ collection: value === "all" ? null : value })}
          options={[
            { value: "all", label: "All collections" },
            ...collections.map((collection) => ({
              value: collection.slug,
              label: collection.name,
            })),
          ]}
        />

        <Select
          label="Sort"
          value={searchParams.get("sort") ?? "updated-desc"}
          onChange={(value) => setParam({ sort: value })}
          options={[
            { value: "updated-desc", label: "Recently updated" },
            { value: "created-desc", label: "Newest" },
            { value: "name-asc", label: "Name A–Z" },
            { value: "price-desc", label: "Price high–low" },
            { value: "price-asc", label: "Price low–high" },
          ]}
        />
      </div>

      {/* Bulk actions */}
      {selected.length > 0 ? (
        <div className="sticky top-17 z-20 flex flex-wrap items-center gap-3 border-b border-accent/20 bg-accent-soft/95 px-5 py-3 shadow-sm backdrop-blur-md">
          <p data-numeric className="text-sm">
            {selected.length} selected
          </p>

          {(["active", "draft", "archived"] as const).map((status) => (
            <form key={status} action={setStatusAction}>
              {selected.map((id) => (
                <input key={id} type="hidden" name="ids" value={id} />
              ))}
              <input type="hidden" name="status" value={status} />
              <Button type="submit" variant="secondary" size="sm">
                Set {status}
              </Button>
            </form>
          ))}

          <form action={deleteProductAction} className="ml-auto">
            {selected.map((id) => (
              <input key={id} type="hidden" name="ids" value={id} />
            ))}
            <ConfirmSubmit confirmLabel={`Delete ${selected.length} — confirm`}>
              Delete selected
            </ConfirmSubmit>
          </form>
        </div>
      ) : null}

      {/* Table */}
      {products.length === 0 ? (
        <div className="px-5 py-16 text-center">
          <p className="text-sm text-content">No products match those filters.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => router.push("/admin/products")}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-4xl text-sm">
            <caption className="sr-only">
              Products, page {page} of {totalPages}
            </caption>
            <thead>
              <tr className="border-b border-line text-left">
                <th scope="col" className="w-10 px-5 py-2.5">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleAll}
                    aria-label="Select all products on this page"
                    className="size-4 cursor-pointer accent-current"
                  />
                </th>
                {["Product", "Status", "Category", "Price", "Margin", ""].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className={cn(
                      "px-3 py-2.5 text-2xs font-medium uppercase tracking-[0.1em] text-content-muted",
                      (heading === "Price" || heading === "Margin") && "text-right",
                    )}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {products.map((product) => {
                const margin =
                  product.costPrice && product.price > 0
                    ? Math.round(((product.price - product.costPrice) / product.price) * 100)
                    : null;

                return (
                  <tr
                    key={product.id}
                    className={cn(
                      "border-b border-line last:border-0",
                      selected.includes(product.id) && "bg-accent-soft/50",
                    )}
                  >
                    <td className="px-5 py-3">
                      <input
                        type="checkbox"
                        checked={selected.includes(product.id)}
                        onChange={() =>
                          setSelected((current) =>
                            current.includes(product.id)
                              ? current.filter((id) => id !== product.id)
                              : [...current, product.id],
                          )
                        }
                        aria-label={`Select ${product.name}`}
                        className="size-4 cursor-pointer accent-current"
                      />
                    </td>

                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <span
                          aria-hidden
                          style={{ backgroundColor: product.colors[0]?.hex }}
                          className="size-9 shrink-0 rounded-lg ring-1 ring-inset ring-black/10 shadow-xs"
                        />
                        <span className="min-w-0">
                          <Link
                            href={`/admin/products/${product.id}`}
                            className="link-underline block truncate font-medium"
                          >
                            {product.name}
                          </Link>
                          <span data-numeric className="block truncate text-xs text-content-subtle">
                            {product.sku ?? product.id} · {product.colors.length} colour
                            {product.colors.length === 1 ? "" : "s"}
                          </span>
                        </span>
                      </div>
                    </td>

                    <td className="px-3 py-3">
                      <StatusPill status={product.status ?? "active"} />
                    </td>

                    <td className="px-3 py-3 text-content-muted">{product.category}</td>

                    <td data-numeric className="px-3 py-3 text-right">
                      {money(product.price)}
                      {product.compareAtPrice ? (
                        <span className="block text-xs text-content-subtle line-through">
                          {money(product.compareAtPrice)}
                        </span>
                      ) : null}
                    </td>

                    <td data-numeric className="px-3 py-3 text-right text-content-muted">
                      {margin === null ? "—" : `${margin}%`}
                    </td>

                    <td className="px-5 py-3 text-right">
                      <form action={duplicateProductAction}>
                        <input type="hidden" name="id" value={product.id} />
                        <button
                          type="submit"
                          aria-label={`Duplicate ${product.name}`}
                          title="Duplicate"
                          className="grid size-9 place-items-center text-content-muted transition-colors hover:text-content"
                        >
                          <Copy size={15} aria-hidden />
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-4 border-t border-line px-5 py-3">
          <p data-numeric className="text-xs text-content-muted">
            Page {page} of {totalPages} · {total} total
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setParam({ page: String(page - 1) })}
            >
              <CaretLeft size={12} aria-hidden />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setParam({ page: String(page + 1) })}
            >
              Next
              <CaretRight size={12} aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Compact labelled select for the filter bar. */
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="flex min-w-36 flex-col gap-1.5 text-2xs font-semibold uppercase tracking-[0.1em] text-content-muted">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 cursor-pointer border border-line-strong bg-surface px-3 text-sm font-normal normal-case tracking-normal text-content shadow-xs transition-[border-color,box-shadow] focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/10"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
