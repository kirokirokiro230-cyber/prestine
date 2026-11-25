"use client";

import { useState } from "react";
import Link from "next/link";
import { Heart, Leaf } from "@phosphor-icons/react";
import { useCart } from "@/components/providers/cart-provider";
import { useWishlist } from "@/components/providers/wishlist-provider";
import { Badge } from "@/components/ui/badge";
import { Price } from "@/components/ui/price";
import { Rating } from "@/components/ui/rating";
import { primaryBadge } from "@/lib/product-utils";
import type { ProductSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ProductImage } from "./product-image";

interface ProductCardProps {
  /**
   * A summary, not a full product record: this is a client component, so every
   * field here is serialised into the page for each card on screen.
   */
  product: ProductSummary;
  /** Eager-load the image — use on the first row of a grid. */
  priority?: boolean;
  /** Hide the hover quick-add rail (used in tight spaces like the cart drawer). */
  compact?: boolean;
  sizes?: string;
  className?: string;
}

/**
 * Product tile.
 *
 * Interaction notes:
 * - Hovering swaps to the second view; the swap is a cross-fade of two stacked
 *   layers so the card's box never changes size (no layout shift, no jitter).
 * - Swatches change the previewed colour without navigating, and the chosen
 *   colour is carried into the product URL so the PDP opens on the same variant.
 * - Quick-add appears on hover for pointer devices and is always reachable on
 *   touch via the product page, so nothing is hidden behind hover alone.
 */
export function ProductCard({
  product,
  priority = false,
  compact = false,
  sizes,
  className,
}: ProductCardProps) {
  const [activeColorIndex, setActiveColorIndex] = useState(0);
  const activeColor = product.colors[activeColorIndex] ?? product.colors[0];

  const { addItem } = useCart();
  const { hasVariant, toggle } = useWishlist();

  const badge = primaryBadge(product);
  const saved = hasVariant(product.id, activeColor.id);
  const href = `/product/${product.slug}?color=${activeColor.id}`;


  return (
    <article className={cn("group relative flex flex-col rounded-[1.25rem]", className)}>
      <div className="relative overflow-hidden rounded-[1.25rem] border border-line bg-surface-sunken shadow-sm transition-[border-color,box-shadow,transform] duration-500 ease-out group-hover:-translate-y-1 group-hover:border-line-strong group-hover:shadow-lg">
        <Link
          href={href}
          aria-label={`${product.name} in ${activeColor.name}`}
          className="block focus-visible:outline-offset-4"
        >
          <div className="relative aspect-3/4">
            {/* Base view */}
            <div
              className={cn(
                "absolute inset-0 transition-opacity duration-500",
                "group-hover:opacity-0 group-focus-within:opacity-0",
              )}
            >
              <ProductImage
                product={product}
                color={activeColor}
                view={0}
                priority={priority}
                sizes={sizes}
              />
            </div>

            {/* Hover view — stacked, so nothing reflows on hover */}
            <div
              aria-hidden
              className={cn(
                "absolute inset-0 opacity-0 transition-opacity duration-500",
                "group-hover:opacity-100 group-focus-within:opacity-100",
              )}
            >
              <ProductImage product={product} color={activeColor} view={3} sizes={sizes} />
            </div>
          </div>
        </Link>

        {/* Badges */}
        <div className="pointer-events-none absolute left-3 top-3 flex flex-col items-start gap-1.5">
          {badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
          {product.sustainable ? (
            <Badge tone="eco">
              <Leaf size={10} weight="fill" aria-hidden />
              Lower impact
            </Badge>
          ) : null}
        </div>

        {/* Save */}
        <button
          type="button"
          onClick={() => toggle(product, activeColor.id)}
          aria-pressed={saved}
          aria-label={
            saved
              ? `Remove ${product.name} from saved items`
              : `Save ${product.name} for later`
          }
          className={cn(
            "absolute right-2.5 top-2.5 grid size-10 place-items-center rounded-full border border-white/30 bg-surface/75 text-content shadow-sm backdrop-blur-md transition-[background-color,color,transform] hover:scale-105 hover:bg-surface focus-visible:bg-surface",
            saved && "text-danger-500 dark:text-clay-300",
          )}
        >
          <Heart size={18} weight={saved ? "fill" : "regular"} aria-hidden />
        </button>

        {/* Quick add — pointer devices only, never the sole route to a size */}
        {!compact && product.sizes.length > 0 ? (
          <div
            className={cn(
              "absolute inset-x-2 bottom-2 hidden translate-y-2 opacity-0 transition-[opacity,transform] duration-300",
              "group-hover:translate-y-0 group-hover:opacity-100",
              "group-focus-within:translate-y-0 group-focus-within:opacity-100",
              "lg:block",
            )}
          >
            <div className="rounded-xl border border-line bg-surface/95 p-2.5 shadow-lg backdrop-blur-md">
              <p className="mb-1.5 px-1 text-2xs uppercase tracking-[0.12em] text-content-muted">
                Quick add
              </p>
              <div className="flex flex-wrap gap-1">
                {product.sizes.slice(0, 6).map((size) => (
                  <button
                    key={size.label}
                    type="button"
                    onClick={() =>
                      addItem({ product, colorId: activeColor.id, size: size.label })
                    }
                    aria-label={`Add ${product.name}, ${activeColor.name}, size ${size.label} to bag`}
                    className="min-w-9 border border-transparent px-2 py-1.5 text-xs text-content transition-colors hover:border-line-strong hover:bg-surface-sunken"
                  >
                    {size.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

      </div>

      {/* Detail */}
      <div className="mt-4 flex flex-1 flex-col px-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-sans text-sm font-medium leading-snug tracking-normal">
            <Link href={href} className="hover:text-accent">
              {product.name}
            </Link>
          </h3>
          <Price value={product.price} compareAt={product.compareAtPrice} className="shrink-0" />
        </div>

        <p className="mt-1 line-clamp-1 text-xs text-content-muted">{product.tagline}</p>

        <div className="mt-2 flex items-center justify-between gap-3">
          {product.colors.length > 1 ? (
            <div
              className="flex items-center gap-1.5"
              role="group"
              aria-label={`Colours available for ${product.name}`}
            >
              {product.colors.map((color, index) => {
                const isActive = index === activeColorIndex;
                return (
                  <button
                    key={color.id}
                    type="button"
                    onMouseEnter={() => setActiveColorIndex(index)}
                    onFocus={() => setActiveColorIndex(index)}
                    onClick={() => setActiveColorIndex(index)}
                    aria-label={`Preview ${color.name}`}
                    aria-pressed={isActive}
                    title={color.name}
                    className={cn(
                      // 44px hit area via padding while the dot stays small.
                      "-m-1.5 grid place-items-center p-1.5",
                    )}
                  >
                    <span
                      aria-hidden
                      style={{ backgroundColor: color.hex }}
                      className={cn(
                        "block size-3.5 rounded-full ring-1 ring-inset ring-black/12 transition-[box-shadow]",
                        isActive && "ring-2 ring-offset-2 ring-offset-canvas ring-content",
                      )}
                    />
                  </button>
                );
              })}
            </div>
          ) : (
            <span className="text-xs text-content-subtle">{activeColor.name}</span>
          )}

          <Rating value={product.rating} reviewCount={product.reviewCount} hideCount />
        </div>
      </div>
    </article>
  );
}
