"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Handbag } from "@phosphor-icons/react";
import { useCart } from "@/components/providers/cart-provider";
import { Button, ButtonLink } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { pluralise } from "@/lib/format";
import { CartLineItem } from "./cart-line-item";
import { FreeShippingMeter } from "./free-shipping-meter";

/**
 * Slide-over bag. Mounted once in the root layout so any component can open it
 * through `useCart().openCart()` without prop drilling.
 */
export function CartDrawer() {
  const { lines, count, subtotal, isOpen, closeCart, money } = useCart();
  const pathname = usePathname();

  // Never leave the bag open across a navigation.
  useEffect(() => {
    closeCart();
  }, [pathname, closeCart]);

  return (
    <Drawer
      open={isOpen}
      onClose={closeCart}
      title="Your bag"
      description={count > 0 ? pluralise(count, "item") : undefined}
      footer={
        lines.length > 0 ? (
          <div className="flex flex-col gap-4">
            <FreeShippingMeter />

            <div className="flex items-baseline justify-between">
              <span className="text-2xs uppercase tracking-[0.14em] text-content-muted">
                Subtotal
              </span>
              <span data-numeric className="text-lg">
                {money(subtotal)}
              </span>
            </div>

            <p className="text-xs text-content-subtle">
              Shipping and taxes calculated at checkout.
            </p>

            <div className="flex flex-col gap-2">
              <ButtonLink href="/checkout" size="lg" block onClick={closeCart}>
                Checkout
              </ButtonLink>
              <ButtonLink href="/cart" variant="outline" size="md" block onClick={closeCart}>
                View bag
              </ButtonLink>
            </div>
          </div>
        ) : null
      }
    >
      {lines.length === 0 ? (
        <EmptyState
          icon={<Handbag size={24} aria-hidden />}
          title="Your bag is empty"
          description="Nothing here yet. Start with the pieces our clients reorder most."
          className="py-14"
        >
          <Button onClick={closeCart} variant="outline" size="md">
            Keep looking
          </Button>
          <ButtonLink href="/collections/best-sellers" size="md" onClick={closeCart}>
            Shop best sellers
          </ButtonLink>
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line px-5 sm:px-6">
          {lines.map((line) => (
            <CartLineItem key={line.id} line={line} />
          ))}
        </ul>
      )}
    </Drawer>
  );
}
