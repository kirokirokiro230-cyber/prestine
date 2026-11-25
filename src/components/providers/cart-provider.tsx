"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getFirstOrderOffer, type FirstOrderOffer } from "@/app/actions/first-order";
import { useBrowserStore, useIsHydrated } from "@/hooks/use-store";
import { cartStore } from "@/lib/stores";
import {
  cartLineId,
  freeShippingProgress,
  freeShippingShortfall,
  itemCount,
  MAX_LINE_QUANTITY,
  merchandiseSubtotal,
  orderSummary,
  type PricingRules,
  type ResolvedOrderSummary,
} from "@/lib/cart-math";
import type { CartLine, ProductSummary } from "@/lib/types";
import { clamp } from "@/lib/utils";
import { useStore } from "./store-provider";
import { useToast } from "./toast-provider";

/** Guard against a shopper (or a bug) putting an absurd quantity in the bag. */

interface AddToCartInput {
  /** A summary carries everything a cart line needs to be built. */
  product: ProductSummary;
  colorId: string;
  size: string;
  quantity?: number;
}

interface CartContextValue {
  lines: CartLine[];
  count: number;
  subtotal: number;
  summary: ResolvedOrderSummary;
  hydrated: boolean;

  /**
   * Re-exported from `useStore` purely for convenience.
   *
   * Every cart surface needs both alongside the totals, and reading them from one
   * hook keeps those components from importing two providers to render one row.
   */
  rules: PricingRules;
  money: (minorUnits: number) => string;

  /** Drawer visibility, owned here so any component can open the bag. */
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;

  promoCode: string | null;
  setPromoCode: (code: string | null) => void;

  /**
   * What the server last said about the first-order discount for this shopper, or `null`
   * before it has said anything. Only `eligible` changes the totals.
   */
  firstOrderOffer: FirstOrderOffer | null;
  /** Ask again, e.g. after checkout reports the discount is no longer available. */
  refreshFirstOrderOffer: () => Promise<void>;

  addItem: (input: AddToCartInput) => { ok: boolean; reason?: string };
  updateQuantity: (lineId: string, quantity: number) => void;
  incrementLine: (lineId: string) => void;
  decrementLine: (lineId: string) => void;
  removeItem: (lineId: string) => void;
  clearCart: () => void;
  /** Quantity already in the bag for a given variant. */
  quantityOf: (productId: string, colorId: string, size: string) => number;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useBrowserStore(cartStore);
  const hydrated = useIsHydrated();
  const { rules, money } = useStore();

  const [drawerRequested, setDrawerRequested] = useState(false);
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [firstOrderOffer, setFirstOrderOffer] = useState<FirstOrderOffer | null>(null);
  const offerRequest = useRef(0);
  const pathname = usePathname();

  const { notify } = useToast();

  const refreshFirstOrderOffer = useCallback(async () => {
    // Only the newest answer counts: a slow earlier reply must not overwrite a later one.
    const ticket = ++offerRequest.current;
    try {
      const offer = await getFirstOrderOffer();
      if (ticket === offerRequest.current) setFirstOrderOffer(offer);
    } catch {
      // Not knowing means no discount shown, which is the safe side to be wrong on.
      if (ticket === offerRequest.current) setFirstOrderOffer({ kind: "none" });
    }
  }, []);

  const hasLines = lines.length > 0;

  /*
   * Ask the server whether this shopper has the first-order discount, once there is
   * something in the bag to apply it to.
   *
   * Not on every page: it is a database query. It is asked when nothing is known yet, again
   * while the answer is "sign in" (they may have just done so, and this provider outlives
   * the sign-in page), and always on the bag and checkout pages, where the total is about
   * to be paid and a stale discount would be a lie.
   */
  const offerKind = firstOrderOffer?.kind ?? null;
  const askedOnPath = useRef<string | null>(null);

  useEffect(() => {
    if (!hydrated || !hasLines) return;

    const onMoneyPage = pathname.startsWith("/cart") || pathname.startsWith("/checkout");
    const unknown = offerKind === null || offerKind === "sign-in";
    // Once per visit to a money page, not once per answer that comes back.
    const dueHere = onMoneyPage && askedOnPath.current !== pathname;

    if (!unknown && !dueHere) return;

    askedOnPath.current = pathname;
    void refreshFirstOrderOffer();
  }, [hydrated, hasLines, pathname, offerKind, refreshFirstOrderOffer]);

  // Derived rather than stored: an empty bag can never sit open, and removing the
  // last line closes the drawer without an effect chasing it.
  const isOpen = drawerRequested && lines.length > 0;

  const openCart = useCallback(() => setDrawerRequested(true), []);
  const closeCart = useCallback(() => setDrawerRequested(false), []);

  const quantityOf = useCallback(
    (productId: string, colorId: string, size: string) =>
      lines.find((line) => line.id === cartLineId(productId, colorId, size))?.quantity ?? 0,
    [lines],
  );

  const addItem = useCallback(
    ({ product, colorId, size, quantity = 1 }: AddToCartInput) => {
      const color = product.colors.find((c) => c.id === colorId);
      const sizeRecord = product.sizes.find((s) => s.label === size);

      if (!color) return { ok: false, reason: "Choose a colour first." };
      if (!sizeRecord) return { ok: false, reason: "Choose a size first." };

      const id = cartLineId(product.id, colorId, size);
      const existing = lines.find((line) => line.id === id);
      const desired = (existing?.quantity ?? 0) + quantity;

      /**
       * The only ceiling is the per-line cap. There is no inventory to run out of, so a
       * line can never be refused for availability — the cap exists to keep a single
       * order sane, and it is enforced again on the server.
       */
      if (existing && existing.quantity >= MAX_LINE_QUANTITY) {
        return { ok: false, reason: `Limit of ${MAX_LINE_QUANTITY} per size.` };
      }

      const nextQuantity = clamp(desired, 1, MAX_LINE_QUANTITY);

      setLines((current) => {
        const index = current.findIndex((line) => line.id === id);
        if (index >= 0) {
          const next = [...current];
          next[index] = { ...next[index], quantity: nextQuantity };
          return next;
        }
        const line: CartLine = {
          id,
          productId: product.id,
          slug: product.slug,
          name: product.name,
          colorId: color.id,
          colorName: color.name,
          colorHex: color.hex,
          size,
          unitPrice: product.price,
          compareAtPrice: product.compareAtPrice,
          quantity: nextQuantity,
          category: product.category,
        };
        return [...current, line];
      });

      notify({
        tone: "success",
        title: "Added to your bag",
        description: `${product.name} — ${color.name}, ${size}`,
        action: { label: "View bag", onClick: openCart },
      });

      return { ok: true };
    },
    [lines, notify, openCart, setLines],
  );

  const updateQuantity = useCallback(
    (lineId: string, quantity: number) => {
      setLines((current) => {
        if (quantity <= 0) return current.filter((line) => line.id !== lineId);
        return current.map((line) =>
          line.id === lineId
            ? { ...line, quantity: clamp(quantity, 1, MAX_LINE_QUANTITY) }
            : line,
        );
      });
    },
    [setLines],
  );

  const incrementLine = useCallback(
    (lineId: string) => {
      const line = lines.find((l) => l.id === lineId);
      if (!line) return;
      if (line.quantity >= MAX_LINE_QUANTITY) {
        notify({
          tone: "info",
          title: "That’s the limit",
          description: `Up to ${MAX_LINE_QUANTITY} of one size per order.`,
        });
        return;
      }
      updateQuantity(lineId, line.quantity + 1);
    },
    [lines, notify, updateQuantity],
  );

  const decrementLine = useCallback(
    (lineId: string) => {
      const line = lines.find((l) => l.id === lineId);
      if (!line) return;
      updateQuantity(lineId, line.quantity - 1);
    },
    [lines, updateQuantity],
  );

  const removeItem = useCallback(
    (lineId: string) => {
      const line = lines.find((l) => l.id === lineId);
      setLines((current) => current.filter((item) => item.id !== lineId));
      if (line) {
        notify({
          tone: "info",
          title: "Removed from your bag",
          description: `${line.name} — ${line.colorName}, ${line.size}`,
        });
      }
    },
    [lines, notify, setLines],
  );

  const clearCart = useCallback(() => {
    setLines([]);
    setPromoCode(null);
    // An order has just been placed, and may have used the discount. What was true before
    // it no longer is; forget it so the next bag asks again rather than showing a stale one.
    offerRequest.current += 1;
    setFirstOrderOffer(null);
    askedOnPath.current = null;
  }, [setLines]);

  const subtotal = useMemo(() => merchandiseSubtotal(lines), [lines]);
  const count = useMemo(() => itemCount(lines), [lines]);
  const summary = useMemo(
    () => orderSummary({ lines, promoCode, rules, firstOrder: offerKind === "eligible" }),
    [lines, promoCode, rules, offerKind],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      count,
      subtotal,
      summary,
      hydrated,
      rules,
      money,
      isOpen,
      openCart,
      closeCart,
      promoCode,
      setPromoCode,
      firstOrderOffer,
      refreshFirstOrderOffer,
      addItem,
      updateQuantity,
      incrementLine,
      decrementLine,
      removeItem,
      clearCart,
      quantityOf,
    }),
    [
      lines,
      count,
      subtotal,
      summary,
      hydrated,
      rules,
      money,
      isOpen,
      openCart,
      closeCart,
      promoCode,
      firstOrderOffer,
      refreshFirstOrderOffer,
      addItem,
      updateQuantity,
      incrementLine,
      decrementLine,
      removeItem,
      clearCart,
      quantityOf,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within <CartProvider>");
  return context;
}

/** Convenience for the "spend X more for free shipping" nudge. */
export function useFreeShippingNudge(): {
  remaining: number;
  progress: number;
  label: string | null;
} {
  const { subtotal, rules, money } = useCart();
  const remaining = freeShippingShortfall(subtotal, rules);
  return {
    remaining,
    progress: freeShippingProgress(subtotal, rules),
    label:
      subtotal === 0
        ? null
        : remaining === 0
          ? "You’ve unlocked complimentary shipping."
          : `Spend ${money(remaining)} more for complimentary shipping.`,
  };
}
