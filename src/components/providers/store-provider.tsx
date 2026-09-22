"use client";

import { createContext, useContext, useMemo } from "react";
import type { PricingRules } from "@/lib/cart-math";
import { createMoneyFormatter } from "@/lib/format";

/**
 * Store settings that client components need.
 *
 * Currency, locale, tax rate, shipping rates and promotion codes all live in the
 * store and are editable in the admin panel, but a client component cannot read the
 * store. The root layout resolves them per request and passes them down here, so
 * every price on the page formats in the merchant's currency — product cards, filter
 * bands, the bag, checkout — instead of a compile-time constant.
 *
 * This is not a wrapper for its own sake: it is the only mechanism by which
 * request-scoped server data reaches a `"use client"` subtree without prop-drilling
 * through every card and panel.
 */

interface StoreContextValue {
  rules: PricingRules;
  /** Formats minor units in the store's currency and locale. */
  money: (minorUnits: number) => string;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({
  rules,
  children,
}: {
  rules: PricingRules;
  children: React.ReactNode;
}) {
  const value = useMemo<StoreContextValue>(
    () => ({ rules, money: createMoneyFormatter(rules.currency, rules.locale) }),
    [rules],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used within <StoreProvider>");
  return context;
}

/** Shorthand for the common case: formatting a price. */
export function useMoney(): (minorUnits: number) => string {
  return useStore().money;
}
