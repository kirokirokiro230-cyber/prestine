"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

/**
 * Order list filters.
 *
 * Writes to the URL so a view is shareable — "all unfulfilled orders from last
 * week" is a link a merchant can bookmark rather than rebuild each morning.
 */
export function OrderFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const set = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (!value) next.delete(key);
      else next.set(key, value);
    }
    if (!("page" in updates)) next.delete("page");
    router.push(`/admin/orders?${next.toString()}`);
  };

  const hasFilters = ["q", "status", "from", "to", "sort"].some((key) =>
    searchParams.get(key),
  );

  return (
    <div className="grid gap-3 border-b border-line bg-surface-sunken/45 px-5 py-4 md:grid-cols-2 xl:grid-cols-[minmax(16rem,1fr)_repeat(4,auto)] xl:items-end">
      <div className="relative min-w-52 flex-1">
        <label htmlFor="order-search" className="sr-only">
          Search orders
        </label>
        <MagnifyingGlass
          size={14}
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-content-muted"
        />
        <input
          id="order-search"
          type="search"
          defaultValue={searchParams.get("q") ?? ""}
          placeholder="Reference, name, email, postcode, tracking"
          onKeyDown={(event) => {
            if (event.key === "Enter") set({ q: (event.target as HTMLInputElement).value });
          }}
          className="h-10 w-full border border-line-strong bg-surface pl-9 pr-3 text-sm shadow-xs placeholder:text-content-subtle transition-[border-color,box-shadow] focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/10"
        />
      </div>

      <Field label="Status">
        <select
          value={searchParams.get("status") ?? "all"}
          onChange={(event) =>
            set({ status: event.target.value === "all" ? null : event.target.value })
          }
          className="h-10 cursor-pointer border border-line-strong bg-surface px-3 text-sm font-normal normal-case tracking-normal text-content shadow-xs transition-[border-color,box-shadow] focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/10"
        >
          <option value="all">All statuses</option>
          <option value="processing">Processing</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </Field>

      <Field label="From">
        <input
          type="date"
          value={searchParams.get("from") ?? ""}
          onChange={(event) => set({ from: event.target.value || null })}
          className="h-10 border border-line-strong bg-surface px-3 text-sm font-normal normal-case tracking-normal text-content shadow-xs transition-[border-color,box-shadow] focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/10"
        />
      </Field>

      <Field label="To">
        <input
          type="date"
          value={searchParams.get("to") ?? ""}
          onChange={(event) => set({ to: event.target.value || null })}
          className="h-10 border border-line-strong bg-surface px-3 text-sm font-normal normal-case tracking-normal text-content shadow-xs transition-[border-color,box-shadow] focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/10"
        />
      </Field>

      <Field label="Sort">
        <select
          value={searchParams.get("sort") ?? "date-desc"}
          onChange={(event) => set({ sort: event.target.value })}
          className="h-10 cursor-pointer border border-line-strong bg-surface px-3 text-sm font-normal normal-case tracking-normal text-content shadow-xs transition-[border-color,box-shadow] focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/10"
        >
          <option value="date-desc">Newest first</option>
          <option value="date-asc">Oldest first</option>
          <option value="total-desc">Highest value</option>
          <option value="total-asc">Lowest value</option>
        </select>
      </Field>

      {hasFilters ? (
        <Button variant="ghost" size="sm" onClick={() => router.push("/admin/orders")}>
          Clear
        </Button>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-36 flex-col gap-1.5 text-2xs font-semibold uppercase tracking-[0.1em] text-content-muted">
      <span>{label}</span>
      {children}
    </label>
  );
}
