"use client";

import { useCallback, useState } from "react";
import { ArrowsOut, CaretLeft, CaretRight } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useResetOnChange } from "@/hooks/use-store";
import { primaryBadge } from "@/lib/product-utils";
import type { ProductColor, ProductSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ProductImage } from "./product-image";

const VIEW_LABELS = ["Front", "Detail", "Back", "Styled"];

/**
 * Product gallery.
 *
 * - Thumbnails are real buttons in a `tablist`-like group with arrow-key support.
 * - The main image opens a zoom dialog, which is the accessible equivalent of a
 *   hover-magnifier (hover zoom is unusable on touch and with a keyboard).
 * - Changing colour resets to the front view so the shopper is never left looking
 *   at a detail crop of a colour they did not choose.
 */
export function ProductGallery({
  product,
  color,
}: {
  product: ProductSummary;
  color: ProductColor;
}) {
  const [index, setIndex] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const viewCount = color.images?.length ?? VIEW_LABELS.length;

  // Changing colour returns to the front view, so the shopper is never left
  // looking at a detail crop of a colour they did not choose.
  useResetOnChange(color.id, () => setIndex(0));

  const go = useCallback(
    (next: number) => {
      setIndex((next + viewCount) % viewCount);
    },
    [viewCount],
  );

  const badge = primaryBadge(product);

  return (
    <>
      {/*
        `self-start` so the gallery is its own height rather than the height of whatever
        is tallest in the row. The purchase panel already opts out the same way; the
        gallery not doing so is what let it stretch in the first place.
      */}
      <div className="flex flex-col-reverse gap-3 lg:flex-row lg:gap-4 lg:self-start">
        {/* Thumbnails */}
        <div
          role="group"
          aria-label="Product images"
          className="no-scrollbar flex gap-3 overflow-x-auto lg:w-20 lg:flex-col lg:overflow-visible"
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowRight") {
              event.preventDefault();
              go(index + 1);
            } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
              event.preventDefault();
              go(index - 1);
            }
          }}
        >
          {Array.from({ length: viewCount }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show ${VIEW_LABELS[i] ?? `image ${i + 1}`} view`}
              aria-pressed={i === index}
              className={cn(
                "relative w-16 shrink-0 overflow-hidden bg-surface-sunken transition-[outline] lg:w-full",
                i === index
                  ? "outline outline-offset-2 outline-content"
                  : "opacity-70 hover:opacity-100",
              )}
            >
              <div className="aspect-3/4">
                <ProductImage product={product} color={color} view={i} sizes="80px" />
              </div>
            </button>
          ))}
        </div>

        {/* Main image */}
        {/*
          The background belongs on the aspect frame, not on this wrapper.
          
          This wrapper is a stretching flex item, and the gallery is a stretching grid
          item, so when the purchase panel beside it is taller than the photograph the
          wrapper grows past the frame — and a `bg-surface-sunken` on it painted that
          leftover height as a cream block under the image. Backing the element the image
          actually occupies means there is no surface left to leak.
        */}
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div className="relative aspect-3/4 bg-surface-sunken">
            <ProductImage
              product={product}
              color={color}
              view={index}
              priority
              texture
              sizes="(min-width: 1024px) 46vw, 100vw"
            />
          </div>

          {badge ? (
            <div className="pointer-events-none absolute left-4 top-4">
              <Badge tone={badge.tone}>{badge.label}</Badge>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setZoomOpen(true)}
            aria-label="Enlarge image"
            className="absolute right-4 top-4 grid size-11 place-items-center rounded-full bg-surface/85 text-content backdrop-blur-sm transition-colors hover:bg-surface"
          >
            <ArrowsOut size={17} aria-hidden />
          </button>

          {/* Mobile paging — desktop uses the thumbnail rail */}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between p-3 lg:hidden">
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label="Previous image"
              className="grid size-11 place-items-center rounded-full bg-surface/85 text-content backdrop-blur-sm"
            >
              <CaretLeft size={16} aria-hidden />
            </button>

            <p
              data-numeric
              aria-live="polite"
              className="rounded-full bg-surface/85 px-3 py-1 text-2xs tracking-[0.1em] text-content backdrop-blur-sm"
            >
              {index + 1} / {viewCount}
            </p>

            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label="Next image"
              className="grid size-11 place-items-center rounded-full bg-surface/85 text-content backdrop-blur-sm"
            >
              <CaretRight size={16} aria-hidden />
            </button>
          </div>
        </div>
      </div>

      <Modal
        open={zoomOpen}
        onClose={() => setZoomOpen(false)}
        title={product.name}
        description={`${color.name} — ${VIEW_LABELS[index] ?? "view"}`}
        size="xl"
      >
        <div className="relative mx-auto aspect-3/4 w-full max-w-xl bg-surface-sunken">
          <ProductImage product={product} color={color} view={index} texture sizes="90vw" />
        </div>

        <div className="mt-4 flex justify-center gap-2">
          {Array.from({ length: viewCount }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show ${VIEW_LABELS[i] ?? `image ${i + 1}`}`}
              aria-pressed={i === index}
              className={cn(
                "h-1 w-8 transition-colors",
                i === index ? "bg-inverse" : "bg-line-strong",
              )}
            />
          ))}
        </div>
      </Modal>
    </>
  );
}
