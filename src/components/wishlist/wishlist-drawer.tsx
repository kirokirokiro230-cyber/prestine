"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, X } from "@phosphor-icons/react";
import { useWishlist } from "@/components/providers/wishlist-provider";
import { ProductImage } from "@/components/product/product-image";
import { ButtonLink } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { Price } from "@/components/ui/price";
import { useProductSummaries } from "@/hooks/use-product-summaries";
import { pluralise } from "@/lib/format";

/**
 * Saved-items slide-over. A compact companion to the full /wishlist page — it
 * confirms what was just saved without pulling the shopper off the page they
 * were browsing.
 */
export function WishlistDrawer() {
  const { entries, isOpen, closeWishlist, remove } = useWishlist();
  const pathname = usePathname();

  useEffect(() => {
    closeWishlist();
  }, [pathname, closeWishlist]);

  // Saved ids are resolved over the API so the catalogue stays server-side and
  // prices are always current rather than frozen when the item was saved.
  const { products } = useProductSummaries(
    "ids",
    entries.map((entry) => entry.productId),
  );

  const items = entries
    .map((entry) => {
      const product = products.find((candidate) => candidate.id === entry.productId);
      if (!product) return null;
      const color =
        product.colors.find((c) => c.id === entry.colorId) ?? product.colors[0];
      return { entry, product, color };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <Drawer
      open={isOpen}
      onClose={closeWishlist}
      title="Saved items"
      description={items.length > 0 ? pluralise(items.length, "piece") : undefined}
      footer={
        items.length > 0 ? (
          <ButtonLink href="/wishlist" size="lg" block onClick={closeWishlist}>
            View all saved items
          </ButtonLink>
        ) : null
      }
    >
      {items.length === 0 ? (
        <EmptyState
          icon={<Heart size={24} aria-hidden />}
          title="No saved items yet"
          description="Tap the heart on any piece to keep it here while you decide."
          className="py-14"
        >
          <ButtonLink href="/shop" size="md" onClick={closeWishlist}>
            Browse clothing
          </ButtonLink>
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line px-5 sm:px-6">
          {items.map(({ entry, product, color }) => (
            <li key={`${entry.productId}-${entry.colorId}`} className="flex gap-4 py-5">
              <Link
                href={`/product/${product.slug}?color=${color.id}`}
                className="relative w-20 shrink-0 overflow-hidden bg-surface-sunken"
                aria-label={product.name}
              >
                <div className="aspect-3/4">
                  <ProductImage product={product} color={color} sizes="80px" />
                </div>
              </Link>

              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-sans text-sm font-medium leading-snug">
                      <Link
                        href={`/product/${product.slug}?color=${color.id}`}
                        className="hover:text-accent"
                      >
                        {product.name}
                      </Link>
                    </h3>
                    <p className="mt-1 text-xs text-content-muted">{color.name}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => remove(product.id, color.id)}
                    aria-label={`Remove ${product.name} from saved items`}
                    className="-mr-2 -mt-2 grid size-9 shrink-0 place-items-center rounded-full text-content-subtle transition-colors hover:text-danger-500"
                  >
                    <X size={15} aria-hidden />
                  </button>
                </div>

                <div className="mt-auto pt-3">
                  <Price value={product.price} compareAt={product.compareAtPrice} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
