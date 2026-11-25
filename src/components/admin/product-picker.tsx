"use client";

import { useId, useState } from "react";
import { Check, MagnifyingGlass, X } from "@phosphor-icons/react";
import { MAX_LOOK_PRODUCTS } from "@/lib/style-looks";
import type { ProductStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Pick the products worn in a look, and which of their pages it appears on.
 *
 * Two questions about each product, kept apart on purpose:
 *
 * - **Worn in the photo?** Ticked in the list below. Every one of these is listed when a
 *   shopper opens the photograph.
 * - **Shown on its page?** The "Show on its page" box beside each selected product. Only
 *   these products' pages display the photograph.
 *
 * They used to be one question, so a photo of an outfit turned up on the page of every
 * garment in it. Separating them lets one photograph belong to a single product while
 * still listing the rest of the outfit when opened.
 *
 * ## Defaults
 *
 * The first product chosen is shown (a photo has to appear somewhere, and the first pick is
 * the one it is about). Every product added after that is NOT shown by default; sharing a
 * photo onto another page is a deliberate tick.
 *
 * ## `pinnedProductId`
 *
 * When this is opened from one product's own admin page, that product is the photo's owner:
 * it is always selected, always shown, and cannot be removed here — otherwise the photo
 * could be saved without the page it was created for.
 *
 * ## What it submits
 *
 * A hidden `productId` per selected product, in the order they were chosen (that order is
 * the order pieces are listed in), and a hidden `shownOn` per product whose page shows the
 * photo.
 *
 * ## Drafts
 *
 * A draft or archived product can be chosen, and is labelled. Shoppers only see products
 * they can buy, so it stays hidden in the look until it is published.
 */

export interface PickerProduct {
  id: string;
  name: string;
  category: string;
  status: ProductStatus;
  /** First photograph of the first colour, if there is one. */
  image?: string;
}

export function ProductPicker({
  products,
  defaultSelected = [],
  defaultShown,
  pinnedProductId,
}: {
  products: PickerProduct[];
  defaultSelected?: string[];
  /** Products whose page shows the photo. Defaults to the first selected one. */
  defaultShown?: string[];
  pinnedProductId?: string;
}) {
  const [selected, setSelected] = useState<string[]>(() => {
    // The owner leads the list, so it is the first piece and the one shown by default.
    if (pinnedProductId && !defaultSelected.includes(pinnedProductId)) {
      return [pinnedProductId, ...defaultSelected];
    }
    return defaultSelected;
  });

  const [shown, setShown] = useState<string[]>(() => {
    const start = defaultShown ?? defaultSelected.slice(0, 1);
    return pinnedProductId && !start.includes(pinnedProductId)
      ? [pinnedProductId, ...start]
      : start;
  });

  const [query, setQuery] = useState("");
  const searchId = useId();

  const byId = new Map(products.map((product) => [product.id, product]));

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? products.filter(
        (product) =>
          product.name.toLowerCase().includes(needle) ||
          product.category.toLowerCase().includes(needle),
      )
    : products;

  const full = selected.length >= MAX_LOOK_PRODUCTS;

  const toggle = (id: string) => {
    if (id === pinnedProductId) return;

    if (selected.includes(id)) {
      setSelected((current) => current.filter((entry) => entry !== id));
      // Unticking also takes it off the pages the photo appears on.
      setShown((current) => current.filter((entry) => entry !== id));
      return;
    }

    if (selected.length >= MAX_LOOK_PRODUCTS) return;

    setSelected((current) => [...current, id]);
    // Only the very first product is shown automatically; later ones are opt-in.
    if (selected.length === 0) setShown([id]);
  };

  const toggleShown = (id: string) => {
    if (id === pinnedProductId) return;
    setShown((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  };

  const shownCount = selected.filter((id) => shown.includes(id)).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={searchId}
          className="text-2xs font-medium uppercase tracking-[0.12em] text-content-muted"
        >
          Products in this photograph
        </label>
        <span data-numeric className="text-2xs text-content-subtle">
          {selected.length} of {MAX_LOOK_PRODUCTS}
        </span>
      </div>

      {/* The submitted values: worn products in order, then the pages it appears on. */}
      {selected.map((id) => (
        <input key={`worn-${id}`} type="hidden" name="productId" value={id} />
      ))}
      {selected
        .filter((id) => shown.includes(id))
        .map((id) => (
          <input key={`shown-${id}`} type="hidden" name="shownOn" value={id} />
        ))}

      {selected.length > 0 ? (
        <div>
          <ul
            aria-label="Selected products"
            className="divide-y divide-line rounded-lg border border-line"
          >
            {selected.map((id, index) => {
              const product = byId.get(id);
              const pinned = id === pinnedProductId;
              const isShown = shown.includes(id);
              const name = product?.name ?? "Unavailable product";

              return (
                <li key={id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
                  <span data-numeric className="w-4 text-2xs text-content-subtle">
                    {index + 1}
                  </span>

                  <span className="min-w-0 flex-1 basis-40 truncate text-sm font-medium text-content">
                    {name}
                    {pinned ? (
                      <span className="ml-2 text-2xs font-normal uppercase tracking-[0.1em] text-content-subtle">
                        this product
                      </span>
                    ) : null}
                  </span>

                  <label
                    className={cn(
                      "inline-flex items-center gap-2 text-xs",
                      pinned ? "text-content-muted" : "cursor-pointer text-content",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isShown}
                      disabled={pinned}
                      onChange={() => toggleShown(id)}
                      className="size-4 accent-[var(--color-accent)] disabled:opacity-60"
                    />
                    Show on its page
                  </label>

                  {pinned ? (
                    // Keeps the row the same width so the checkboxes line up.
                    <span aria-hidden className="size-7" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggle(id)}
                      aria-label={`Remove ${name}`}
                      className="grid size-7 place-items-center rounded-full text-content-muted transition-colors hover:bg-surface-sunken hover:text-content"
                    >
                      <X size={13} aria-hidden />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          <p className="mt-2 text-xs leading-relaxed text-content-muted">
            {shownCount === 0
              ? "Tick “Show on its page” for at least one product, or this photograph will not appear anywhere."
              : `Appears on ${shownCount} product ${shownCount === 1 ? "page" : "pages"}. Every product above is listed when the photograph is opened.`}
          </p>
        </div>
      ) : null}

      <div className="relative">
        <MagnifyingGlass
          size={14}
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-content-muted"
        />
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search products to add"
          autoComplete="off"
          className="h-11 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-3 text-sm text-content placeholder:text-content-subtle focus:border-accent focus:outline-none"
        />
      </div>

      <ul
        aria-label="Products"
        className="scrollbar-thin max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line"
      >
        {visible.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-content-muted">
            No products match &ldquo;{query}&rdquo;.
          </li>
        ) : (
          visible.map((product) => {
            const checked = selected.includes(product.id);
            const pinned = product.id === pinnedProductId;
            // At the cap, an unticked row is inert; ticked rows stay clickable to remove.
            const blocked = (full && !checked) || pinned;

            return (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => toggle(product.id)}
                  disabled={blocked}
                  role="checkbox"
                  aria-checked={checked}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent",
                    checked && "bg-accent-soft/50",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded border transition-colors",
                      checked
                        ? "border-accent bg-accent text-on-accent"
                        : "border-line-strong bg-surface",
                    )}
                  >
                    {checked ? <Check size={12} weight="bold" /> : null}
                  </span>

                  <span
                    aria-hidden
                    className="h-12 w-9 shrink-0 rounded-xs border border-line bg-surface-sunken bg-cover bg-center"
                    style={product.image ? { backgroundImage: `url(${product.image})` } : undefined}
                  />

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-content">
                      {product.name}
                    </span>
                    <span className="block truncate text-xs capitalize text-content-muted">
                      {product.category}
                    </span>
                  </span>

                  {product.status !== "active" ? (
                    <span
                      title="Shoppers only see published products, so this one stays hidden in the look until it is published."
                      className="shrink-0 rounded-full bg-warning-100 px-2 py-0.5 text-2xs font-medium uppercase tracking-[0.08em] text-warning-700"
                    >
                      {product.status === "draft" ? "Draft" : "Archived"}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })
        )}
      </ul>

      {full ? (
        <p role="status" className="text-xs text-content-muted">
          That is the maximum of {MAX_LOOK_PRODUCTS} products. Remove one to add another.
        </p>
      ) : null}
    </div>
  );
}
