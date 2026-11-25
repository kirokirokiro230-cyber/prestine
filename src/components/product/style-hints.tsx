"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { Modal } from "@/components/ui/modal";
import { Price } from "@/components/ui/price";
import { usePrefersReducedMotion } from "@/hooks/use-store";
import { canOptimiseImage } from "@/lib/image-hosts";
import { pluralise } from "@/lib/format";
import type { StyleLookCard } from "@/lib/style-looks";
import type { ProductSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ProductImage } from "./product-image";

/**
 * Style hints: styling photographs, and the pieces worn in each.
 *
 * A row of photographs on the product page. Opening one shows the whole look — the larger
 * photograph beside every product in it, each linking to its own page — which is the
 * point of the feature: the shopper sees how the piece is worn and can buy the rest of the
 * outfit from the same screen.
 *
 * ## Sizing
 *
 * Nothing here is sized as a share of the page. The first version made each photograph a
 * third of the container, so on a wide desktop a 3:4 portrait came out well over 600px
 * tall and the strip dominated the page; and the opened photograph was a full-width 3:4
 * block, which on a phone filled the screen before a single product was visible.
 *
 * - **Strip cards** are `clamp(9.5rem, 24vw, 17rem)` wide: about 150px on a phone (so two
 *   and a bit are visible and the next one peeks, which says "scroll"), growing with the
 *   screen and stopping at 272px. That is roughly 360px tall at most, however wide the
 *   monitor, and a wider screen simply shows more of them.
 * - **The opened photograph** is limited by the viewport's HEIGHT as well as its width, so
 *   it can never be taller than the screen can show: `46dvh` (at most 26rem) on a phone,
 *   `62dvh` (at most 28rem) beside the product list from `md` up. `dvh` rather than `vh`
 *   so a phone's collapsing address bar does not push it off-screen.
 *
 * ## Behaviour
 *
 * - The strip scrolls sideways with scroll-snap, so it works by swipe, trackpad and
 *   keyboard without a carousel library. The arrow buttons appear from `sm` up, where
 *   there is a pointer and no swipe, and only when the strip actually overflows — measured,
 *   because how many cards fit now depends on the screen.
 * - Each photograph is a real `<button>` that opens a dialog, so it is reachable and
 *   operable by keyboard, and the dialog traps focus and closes on Escape (see `Modal`).
 * - The piece the shopper came from is marked as the one they are viewing rather than
 *   linking back to the page they are already on.
 */

/**
 * Hints for `next/image`, matching the widths above so a phone is not sent a desktop-sized
 * file. The strip card is 152px up to ~633px of screen, then 24vw, then fixed at 272px;
 * the opened photograph is at most 0.75 × 28rem = 336px beside the list, less on a phone.
 */
const SIZES_STRIP = "(min-width: 1136px) 272px, (min-width: 640px) 24vw, 152px";
const SIZES_DIALOG = "(min-width: 768px) 336px, 240px";

export function StyleHints({
  looks,
  currentProductId,
}: {
  looks: StyleLookCard[];
  currentProductId: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const railRef = useRef<HTMLUListElement>(null);
  const reduceMotion = usePrefersReducedMotion();

  // Whether the strip is wider than its box, and whether it is at either end. Both are
  // measured, because how many cards fit depends on the screen.
  const [overflowing, setOverflowing] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const measure = () => {
      const max = rail.scrollWidth - rail.clientWidth;
      setOverflowing(max > 2);
      setAtStart(rail.scrollLeft <= 2);
      setAtEnd(rail.scrollLeft >= max - 2);
    };

    // Fires once on observe and again on every resize, which is when the answer changes.
    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    rail.addEventListener("scroll", measure, { passive: true });

    return () => {
      observer.disconnect();
      rail.removeEventListener("scroll", measure);
    };
  }, [looks.length]);

  const open = looks.find((look) => look.id === openId) ?? null;

  if (looks.length === 0) return null;

  const scrollRail = (direction: 1 | -1) => {
    const rail = railRef.current;
    if (!rail) return;

    rail.scrollBy({
      left: direction * rail.clientWidth * 0.9,
      // Someone who asked their device for less motion gets the jump, not the glide.
      behavior: reduceMotion ? "auto" : "smooth",
    });
  };

  return (
    <div className="relative">
      <ul
        ref={railRef}
        aria-label="Style hints"
        className="scrollbar-thin -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-3 sm:gap-4"
      >
        {looks.map((look, index) => (
          <li
            key={look.id}
            className="w-[clamp(9.5rem,24vw,17rem)] shrink-0 snap-start"
          >
            <button
              type="button"
              onClick={() => setOpenId(look.id)}
              aria-haspopup="dialog"
              aria-label={`${look.title}. See the ${pluralise(look.products.length, "piece")} in this look`}
              className="group block w-full text-left"
            >
              <span className="relative block aspect-3/4 overflow-hidden rounded-2xl border border-line bg-surface-sunken shadow-sm transition-[border-color,box-shadow,transform] duration-500 ease-out group-hover:-translate-y-1 group-hover:border-line-strong group-hover:shadow-lg group-focus-visible:border-line-strong">
                <LookImage
                  src={look.imageUrl}
                  alt=""
                  sizes={SIZES_STRIP}
                  priority={index === 0}
                  className="transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                />

                {/* Says it is clickable, and how much is in it, without needing hover. */}
                <span className="absolute bottom-2 left-2 inline-flex items-center rounded-full bg-surface/90 px-2.5 py-1 text-2xs font-semibold uppercase tracking-[0.1em] text-content shadow-sm backdrop-blur-md">
                  {pluralise(look.products.length, "piece")}
                </span>
              </span>

              {/* No `block` here: `line-clamp` sets its own display, and a later `block`
                  overrides it, which silently turns the clamp off. */}
              <span className="mt-2.5 line-clamp-2 px-0.5 text-xs font-medium leading-snug text-content sm:text-sm">
                {look.title}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {overflowing ? (
        <div className="mt-2 hidden justify-end gap-2 sm:flex">
          <RailButton direction="previous" disabled={atStart} onClick={() => scrollRail(-1)} />
          <RailButton direction="next" disabled={atEnd} onClick={() => scrollRail(1)} />
        </div>
      ) : null}

      <Modal
        open={open !== null}
        onClose={() => setOpenId(null)}
        title={open?.title ?? "Style hint"}
        description={
          open ? `${pluralise(open.products.length, "piece")} in this look` : undefined
        }
        size="xl"
      >
        {open ? (
          <LookView
            look={open}
            currentProductId={currentProductId}
            onNavigate={() => setOpenId(null)}
          />
        ) : null}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

/**
 * The opened look: the photograph, and every piece in it.
 *
 * Exported so the sizing can be checked on its own, outside the modal.
 *
 * The photograph's box is sized from the VIEWPORT HEIGHT, then given its 3:4 shape: width
 * is `0.75 ×` the height cap, bounded by the column, and `aspect-3/4` derives the height
 * from that. Capping only `max-height` would not do — the box would stay full width and
 * the photograph would be cropped to a wider shape instead of simply being smaller.
 *
 * On a phone it is centred above the list at most 46% of the screen high, so products are
 * in view without scrolling. From `md` it sits beside the list and stays in view while the
 * list scrolls.
 */
export function LookView({
  look,
  currentProductId,
  onNavigate,
}: {
  look: StyleLookCard;
  currentProductId: string;
  onNavigate: () => void;
}) {
  return (
    <div
      className={cn(
        // Explicit tracks. The photograph's width must come from the column, and the
        // column's width from the viewport: an `auto` column sized by content, holding a
        // box whose width is a percentage of that column, is circular — it collapsed to
        // zero and the photograph vanished. `grid-cols-1` is a definite `1fr` track, so
        // the phone layout cannot overflow its container either.
        "grid grid-cols-1 gap-5 md:gap-8",
        "md:grid-cols-[min(45%,calc(0.75*min(62dvh,28rem)))_minmax(0,1fr)]",
      )}
    >
      <div
        className={cn(
          "relative mx-auto aspect-3/4 overflow-hidden rounded-xl border border-line bg-surface-sunken",
          // Phone: width from the height cap (3:4), never wider than the screen.
          "w-[calc(0.75*min(46dvh,26rem))] max-w-full",
          // From md the column already has the right width; fill it and stay in view.
          "md:sticky md:top-0 md:mx-0 md:w-full md:max-w-none md:self-start",
        )}
      >
        <LookImage src={look.imageUrl} alt={look.title} sizes={SIZES_DIALOG} />
      </div>

      <ul className="flex min-w-0 flex-col divide-y divide-line">
        {look.products.map((product) => (
          <li key={product.id}>
            <LookProduct
              product={product}
              viewing={product.id === currentProductId}
              onNavigate={onNavigate}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The look photograph.
 *
 * Mirrors `ProductImage`'s guard: `next/image` throws, rather than degrading, when handed
 * a host missing from `remotePatterns`, and the admin accepts any absolute https URL. So an
 * unrecognised host renders as a plain `<img>` — unoptimised, but on the page, and
 * impossible for a pasted URL to take the product page down.
 */
function LookImage({
  src,
  alt,
  sizes,
  priority = false,
  className,
}: {
  src: string;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  if (!canOptimiseImage(src)) {
    return (
      // Deliberate: the optimiser cannot serve this host and would throw.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className={cn("absolute inset-0 size-full object-cover", className)}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      className={cn("object-cover", className)}
    />
  );
}

function LookProduct({
  product,
  viewing,
  onNavigate,
}: {
  product: ProductSummary;
  viewing: boolean;
  onNavigate: () => void;
}) {
  const color = product.colors[0];

  const body = (
    <>
      <span className="relative block aspect-3/4 w-14 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-sunken sm:w-20">
        {color ? <ProductImage product={product} color={color} view={0} sizes="80px" /> : null}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-snug text-content">
          {product.name}
        </span>
        {color ? (
          <span className="mt-0.5 block text-xs text-content-muted">{color.name}</span>
        ) : null}
        <span className="mt-1.5 block">
          <Price value={product.price} compareAt={product.compareAtPrice} size="sm" />
        </span>

        {/*
          Under the price, not beside the row. As a flex sibling it took ~140px of a
          column that is only ~340px wide beside the photograph at tablet width, which
          squeezed the product name to a few letters per line.
        */}
        {viewing ? (
          <span className="mt-2 inline-block rounded-full bg-accent-soft px-2.5 py-1 text-2xs font-semibold uppercase tracking-[0.1em] text-accent">
            You&rsquo;re viewing this
          </span>
        ) : null}
      </span>
    </>
  );

  // The page the shopper is already on is not a link: it would reload what they see.
  if (viewing) {
    return (
      <div aria-current="true" className="flex items-center gap-3 py-3 sm:gap-4 sm:py-4">
        {body}
      </div>
    );
  }

  return (
    <Link
      href={`/product/${product.slug}${color ? `?color=${color.id}` : ""}`}
      onClick={onNavigate}
      className="group flex items-center gap-3 py-3 transition-colors hover:bg-surface-sunken/60 focus-visible:bg-surface-sunken/60 sm:gap-4 sm:py-4"
    >
      {body}
      <span className="shrink-0 text-2xs font-semibold uppercase tracking-[0.12em] text-content-muted transition-colors group-hover:text-accent">
        View
      </span>
    </Link>
  );
}

function RailButton({
  direction,
  disabled,
  onClick,
}: {
  direction: "previous" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "previous" ? "Previous style hints" : "Next style hints"}
      className="grid size-10 place-items-center rounded-full border border-line-strong bg-surface text-content shadow-xs transition-colors hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-35"
    >
      {direction === "previous" ? (
        <CaretLeft size={16} aria-hidden />
      ) : (
        <CaretRight size={16} aria-hidden />
      )}
    </button>
  );
}
