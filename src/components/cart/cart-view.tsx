"use client";

import { Handbag, LockSimple } from "@phosphor-icons/react";
import { useCart } from "@/components/providers/cart-provider";
import { ProductGrid } from "@/components/product/product-grid";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CartSkeleton, ProductGridSkeleton } from "@/components/ui/skeleton";
import { SectionHeading } from "@/components/ui/section-heading";
import { pluralise } from "@/lib/format";
import type { Product } from "@/lib/types";
import { CartLineItem } from "./cart-line-item";
import { OrderSummary } from "./order-summary";

/**
 * Cart page body.
 *
 * A client component because the bag lives in localStorage. While the store
 * hydrates it renders a skeleton rather than the empty state — flashing "your bag
 * is empty" at someone who has ten items in it is the worst version of this page.
 */
export function CartView({ recommendations }: { recommendations: Product[] }) {
  const { lines, count, hydrated, clearCart } = useCart();

  if (!hydrated) {
    return (
      <div role="status" aria-label="Loading your bag">
        <CartSkeleton />
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="page-gutter mx-auto max-w-page py-10">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Bag" }]} />

        <EmptyState
          icon={<Handbag size={24} aria-hidden />}
          title="Your bag is empty"
          description="Nothing here yet. These are the pieces our clients reorder most often."
        >
          <ButtonLink href="/shop" variant="outline" size="md">
            Browse all clothing
          </ButtonLink>
          <ButtonLink href="/collections/best-sellers" size="md">
            Shop best sellers
          </ButtonLink>
        </EmptyState>

        {recommendations.length > 0 ? (
          <section className="mt-8">
            <SectionHeading eyebrow="Start here" title="Best sellers" className="mb-8" />
            <ProductGrid products={recommendations} columns={4} />
          </section>
        ) : (
          <ProductGridSkeleton count={4} />
        )}
      </div>
    );
  }

  return (
    <div className="page-gutter mx-auto max-w-page py-10">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Bag" }]} />

      <header className="mt-8 flex flex-wrap items-end justify-between gap-4 border-l-2 border-accent pl-5 sm:pl-7">
        <div>
          <p className="eyebrow mb-3">Your selection</p>
          <h1 className="text-5xl leading-[0.98] sm:text-6xl">Your bag</h1>
          <p data-numeric className="mt-2 text-sm text-content-muted">
            {pluralise(count, "item")}
          </p>
        </div>

        <Button variant="link" size="sm" onClick={clearCart} className="text-content-muted">
          Empty bag
        </Button>
      </header>

      <div className="mt-10 grid items-start gap-10 lg:grid-cols-[1fr_22rem] lg:gap-16">
        <ul className="divide-y divide-line border-t border-line pt-8">
          {lines.map((line) => (
            <CartLineItem key={line.id} line={line} layout="page" />
          ))}
        </ul>

        <div className="lg:sticky lg:top-28">
          <OrderSummary className="rounded-[1.5rem] border border-line bg-surface p-1 shadow-md">
            <div className="flex flex-col gap-3">
              <ButtonLink href="/checkout" size="lg" block>
                <LockSimple size={14} weight="fill" aria-hidden />
                Secure checkout
              </ButtonLink>
              <ButtonLink href="/shop" variant="ghost" size="md" block>
                Continue shopping
              </ButtonLink>
            </div>
          </OrderSummary>

          <p className="mt-4 px-1 text-xs leading-relaxed text-content-subtle">
            Every piece is made to order, so nothing in your bag can sell out. Prices are
            confirmed at checkout.
          </p>
        </div>
      </div>

      {recommendations.length > 0 ? (
        <section className="mt-20">
          <SectionHeading
            eyebrow="Complete the look"
            title="You may also like"
            className="mb-10"
          />
          <ProductGrid products={recommendations} columns={4} />
        </section>
      ) : null}
    </div>
  );
}
