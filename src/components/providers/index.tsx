"use client";

import type { PricingRules } from "@/lib/cart-math";
import { CartProvider } from "./cart-provider";
import { RecentlyViewedProvider } from "./recently-viewed-provider";
import { SearchProvider } from "./search-provider";
import { StoreProvider } from "./store-provider";
import { ThemeProvider } from "./theme-provider";
import { ToastProvider } from "./toast-provider";
import { WishlistProvider } from "./wishlist-provider";

/**
 * Providers every part of the app needs, storefront and admin alike.
 *
 * Deliberately small and data-free: theme comes from a cookie-less pre-paint script
 * and toasts are pure UI state. Nothing here requires a store read, so mounting it
 * at the root costs the admin panel nothing.
 */
export function BaseProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>{children}</ToastProvider>
    </ThemeProvider>
  );
}

/**
 * Providers only the shop needs — bag, saved items, recently viewed, search, and the
 * pricing rules they all compute against.
 *
 * These are mounted by the storefront layout rather than the root, because the admin
 * panel has no cart and no wishlist. Mounting them there would ship dead JavaScript
 * to every admin screen and make each one pay for a settings read it never uses.
 */
export function StorefrontProviders({
  children,
  rules,
}: {
  children: React.ReactNode;
  rules: PricingRules;
}) {
  return (
    <StoreProvider rules={rules}>
      <WishlistProvider>
        <CartProvider>
          <RecentlyViewedProvider>
            <SearchProvider>{children}</SearchProvider>
          </RecentlyViewedProvider>
        </CartProvider>
      </WishlistProvider>
    </StoreProvider>
  );
}
