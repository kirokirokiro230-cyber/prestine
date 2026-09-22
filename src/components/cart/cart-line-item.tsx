"use client";

import Link from "next/link";
import { Trash } from "@phosphor-icons/react";
import { useCart } from "@/components/providers/cart-provider";
import { GarmentArt } from "@/components/product/garment-art";
import { Price } from "@/components/ui/price";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { MAX_LINE_QUANTITY } from "@/lib/cart-math";
import type { CartLine } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * One line in the bag. Used in the drawer, the cart page and the checkout
 * summary — `layout` switches the density rather than duplicating the component.
 */
export function CartLineItem({
  line,
  layout = "drawer",
  readOnly = false,
}: {
  line: CartLine;
  layout?: "drawer" | "page";
  readOnly?: boolean;
}) {
  const { updateQuantity, removeItem } = useCart();
  const wide = layout === "page";

  /**
   * The line already snapshots everything the artwork needs, so the thumbnail
   * renders without a catalogue lookup. That matters: this is a client component,
   * and importing the catalogue here would ship the whole product list to the
   * browser.
   */
  const artSubject = {
    id: line.productId,
    slug: line.slug,
    name: line.name,
    category: line.category,
  };

  return (
    <li
      className={cn(
        "flex gap-4 py-5",
        wide && "gap-6 py-8 first:pt-0",
      )}
    >
      <Link
        href={`/product/${line.slug}?color=${line.colorId}`}
        aria-label={line.name}
        className={cn(
          "relative shrink-0 overflow-hidden bg-surface-sunken",
          wide ? "w-24 sm:w-32" : "w-20",
        )}
      >
        <div className="aspect-3/4">
          <GarmentArt
            product={artSubject}
            colorHex={line.colorHex}
            colorName={line.colorName}
          />
        </div>
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className={cn("font-sans font-medium leading-snug", wide ? "text-base" : "text-sm")}>
              <Link
                href={`/product/${line.slug}?color=${line.colorId}`}
                className="hover:text-accent"
              >
                {line.name}
              </Link>
            </h3>

            <p className="mt-1.5 flex items-center gap-2 text-xs text-content-muted">
              <span
                aria-hidden
                style={{ backgroundColor: line.colorHex }}
                className="inline-block size-2.5 rounded-full ring-1 ring-inset ring-black/12"
              />
              {line.colorName}
              <span aria-hidden className="text-content-subtle">
                ·
              </span>
              Size {line.size}
            </p>

          </div>

          <Price
            value={line.unitPrice * line.quantity}
            compareAt={
              line.compareAtPrice ? line.compareAtPrice * line.quantity : undefined
            }
            size={wide ? "md" : "sm"}
            className="shrink-0"
          />
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 pt-3">
          {readOnly ? (
            <p data-numeric className="text-xs text-content-muted">
              Quantity {line.quantity}
            </p>
          ) : (
            <QuantityStepper
              value={line.quantity}
              max={MAX_LINE_QUANTITY}
              onChange={(next) => updateQuantity(line.id, next)}
              label={`Quantity for ${line.name}, ${line.colorName}, size ${line.size}`}
              size={wide ? "md" : "sm"}
            />
          )}

          {!readOnly ? (
            <button
              type="button"
              onClick={() => removeItem(line.id)}
              className="group flex items-center gap-1.5 py-2 text-xs text-content-muted transition-colors hover:text-danger-500"
            >
              <Trash size={14} aria-hidden />
              <span className={wide ? "" : "sr-only sm:not-sr-only"}>Remove</span>
              <span className="sr-only">
                {line.name}, {line.colorName}, size {line.size}
              </span>
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
