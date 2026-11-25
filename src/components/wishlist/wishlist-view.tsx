"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Heart, Trash, X } from "@phosphor-icons/react";
import { useCart } from "@/components/providers/cart-provider";
import { useWishlist } from "@/components/providers/wishlist-provider";
import { ProductGrid } from "@/components/product/product-grid";
import { ProductImage } from "@/components/product/product-image";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Price } from "@/components/ui/price";
import { Rating } from "@/components/ui/rating";
import { SectionHeading } from "@/components/ui/section-heading";
import { ProductGridSkeleton, Skeleton } from "@/components/ui/skeleton";
import { useProductSummaries } from "@/hooks/use-product-summaries";
import { pluralise } from "@/lib/format";
import { primaryBadge } from "@/lib/product-utils";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Saved items page.
 *
 * Each card lets the shopper add straight to the bag by picking a size inline —
 * going back to the product page to buy something you have already decided on is
 * needless friction.
 */
export function WishlistView({ recommendations }: { recommendations: Product[] }) {
  const { entries, hydrated, remove, clear } = useWishlist();
  const { addItem } = useCart();

  const [sizeFor, setSizeFor] = useState<Record<string, string>>({});
  const [confirmClear, setConfirmClear] = useState(false);

  // Resolved over the API rather than imported: the catalogue stays on the server
  // and saved items always show today's price.
  const { products, loading } = useProductSummaries(
    "ids",
    entries.map((entry) => entry.productId),
  );

  const items = useMemo(
    () =>
      entries
        .map((entry) => {
          const product = products.find((candidate) => candidate.id === entry.productId);
          if (!product) return null;
          const color =
            product.colors.find((c) => c.id === entry.colorId) ?? product.colors[0];
          return { key: `${entry.productId}-${entry.colorId}`, product, color };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null),
    [entries, products],
  );

  if (!hydrated || (entries.length > 0 && loading)) {
    return (
      <div
        className="page-gutter mx-auto max-w-page py-10"
        role="status"
        aria-label="Loading saved items"
      >
        <Skeleton className="h-10 w-52" />
        <div className="mt-10">
          <ProductGridSkeleton count={4} />
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="page-gutter mx-auto max-w-page py-10">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Saved items" }]} />

        <EmptyState
          icon={<Heart size={24} aria-hidden />}
          title="Nothing saved yet"
          description="Tap the heart on any piece and it will wait here — across sessions, on this device."
        >
          <ButtonLink href="/shop" size="md">
            Browse all clothing
          </ButtonLink>
          <ButtonLink href="/collections/new-arrivals" variant="outline" size="md">
            See what’s new
          </ButtonLink>
        </EmptyState>

        <section className="mt-8">
          <SectionHeading eyebrow="Popular right now" title="Best sellers" className="mb-8" />
          <ProductGrid products={recommendations} columns={4} />
        </section>
      </div>
    );
  }

  return (
    <div className="page-gutter mx-auto max-w-page py-10">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Saved items" }]} />

      <header className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl leading-tight sm:text-5xl">Saved items</h1>
          <p data-numeric className="mt-2 text-sm text-content-muted">
            {pluralise(items.length, "piece")} set aside
          </p>
        </div>

        <Button
          variant="link"
          size="sm"
          onClick={() => setConfirmClear(true)}
          className="text-content-muted"
        >
          <Trash size={13} aria-hidden />
          Clear all
        </Button>
      </header>

      <ul className="mt-10 grid gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-x-6">
        {items.map(({ key, product, color }) => {
          const badge = primaryBadge(product);
          const selectedSize = sizeFor[key];
          const oneSize = product.sizeSystem === "one-size";

          return (
            <li key={key} className="flex flex-col">
              <div className="relative overflow-hidden bg-surface-sunken">
                <Link
                  href={`/product/${product.slug}?color=${color.id}`}
                  aria-label={`${product.name} in ${color.name}`}
                >
                  <div className="relative aspect-3/4">
                    <ProductImage
                      product={product}
                      color={color}
                      sizes="(min-width: 1024px) 31vw, 45vw"
                    />
                  </div>
                </Link>

                {badge ? (
                  <div className="pointer-events-none absolute left-3 top-3">
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={() => remove(product.id, color.id)}
                  aria-label={`Remove ${product.name} from saved items`}
                  className="absolute right-2 top-2 grid size-11 place-items-center rounded-full bg-surface/85 text-content backdrop-blur-sm transition-colors hover:text-danger-500"
                >
                  <X size={16} aria-hidden />
                </button>
              </div>

              <div className="mt-3.5 flex flex-1 flex-col">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-sans text-sm font-medium leading-snug">
                    <Link
                      href={`/product/${product.slug}?color=${color.id}`}
                      className="hover:text-accent"
                    >
                      {product.name}
                    </Link>
                  </h2>
                  <Price
                    value={product.price}
                    compareAt={product.compareAtPrice}
                    className="shrink-0"
                  />
                </div>

                <p className="mt-1 text-xs text-content-muted">{color.name}</p>

                <div className="mt-2">
                  <Rating value={product.rating} reviewCount={product.reviewCount} />
                </div>

                {/* Inline size + add */}
                <div className="mt-4">
                  {!oneSize ? (
                    <div
                      role="radiogroup"
                      aria-label={`Size for ${product.name}`}
                      className="flex flex-wrap gap-1.5"
                    >
                      {product.sizes.map((size) => {
                        const active = selectedSize === size.label;
                        return (
                          <button
                            key={size.label}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() =>
                              setSizeFor((current) => ({ ...current, [key]: size.label }))
                            }
                            className={cn(
                              "min-w-10 border px-2 py-2 text-xs transition-colors",
                              active
                                ? "border-inverse bg-inverse text-on-inverse"
                                : "border-line-strong text-content hover:border-content",
                            )}
                          >
                            {size.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

                  <Button
                    size="md"
                    block
                    className="mt-3"
                    disabled={!oneSize && !selectedSize}
                    onClick={() =>
                      addItem({
                        product,
                        colorId: color.id,
                        size: oneSize ? product.sizes[0].label : selectedSize,
                      })
                    }
                  >
                    {oneSize || selectedSize ? "Add to bag" : "Select a size"}
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear all saved items?"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" size="md" onClick={() => setConfirmClear(false)}>
              Keep them
            </Button>
            <Button
              variant="danger"
              size="md"
              onClick={() => {
                clear();
                setConfirmClear(false);
              }}
            >
              Clear all
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-content-muted">
          This removes all {items.length} saved pieces. It cannot be undone, though nothing
          in your bag is affected.
        </p>
      </Modal>

      <section className="mt-20">
        <SectionHeading
          eyebrow="Also worth a look"
          title="Best sellers"
          className="mb-10"
        />
        <ProductGrid products={recommendations} columns={4} />
      </section>
    </div>
  );
}
