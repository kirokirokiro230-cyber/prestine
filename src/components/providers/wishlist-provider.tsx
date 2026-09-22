"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useBrowserStore, useIsHydrated } from "@/hooks/use-store";
import { wishlistStore } from "@/lib/stores";
import type { ProductSummary, WishlistEntry } from "@/lib/types";
import { useToast } from "./toast-provider";

interface WishlistContextValue {
  entries: WishlistEntry[];
  count: number;
  hydrated: boolean;
  isOpen: boolean;
  openWishlist: () => void;
  closeWishlist: () => void;
  /** True when this product is saved in any colourway. */
  has: (productId: string) => boolean;
  /** True when this exact colourway is saved. */
  hasVariant: (productId: string, colorId: string) => boolean;
  toggle: (product: ProductSummary, colorId?: string) => void;
  remove: (productId: string, colorId?: string) => void;
  clear: () => void;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useBrowserStore(wishlistStore);
  const hydrated = useIsHydrated();

  const [isOpen, setIsOpen] = useState(false);
  const { notify } = useToast();

  const openWishlist = useCallback(() => setIsOpen(true), []);
  const closeWishlist = useCallback(() => setIsOpen(false), []);

  const has = useCallback(
    (productId: string) => entries.some((e) => e.productId === productId),
    [entries],
  );

  const hasVariant = useCallback(
    (productId: string, colorId: string) =>
      entries.some((e) => e.productId === productId && e.colorId === colorId),
    [entries],
  );

  const remove = useCallback(
    (productId: string, colorId?: string) => {
      setEntries((current) =>
        current.filter((e) =>
          colorId
            ? !(e.productId === productId && e.colorId === colorId)
            : e.productId !== productId,
        ),
      );
    },
    [setEntries],
  );

  const toggle = useCallback(
    (product: ProductSummary, colorId?: string) => {
      const color = colorId ?? product.colors[0]?.id ?? "default";

      if (hasVariant(product.id, color)) {
        remove(product.id, color);
        notify({ tone: "info", title: "Removed from saved items", description: product.name });
        return;
      }

      setEntries((current) => [
        { productId: product.id, colorId: color, addedAt: Date.now() },
        ...current,
      ]);
      notify({
        tone: "success",
        title: "Saved for later",
        description: product.name,
        action: { label: "View saved items", onClick: openWishlist },
      });
    },
    [hasVariant, notify, openWishlist, remove, setEntries],
  );

  const clear = useCallback(() => setEntries([]), [setEntries]);

  const value = useMemo<WishlistContextValue>(
    () => ({
      entries,
      count: entries.length,
      hydrated,
      isOpen,
      openWishlist,
      closeWishlist,
      has,
      hasVariant,
      toggle,
      remove,
      clear,
    }),
    [
      entries,
      hydrated,
      isOpen,
      openWishlist,
      closeWishlist,
      has,
      hasVariant,
      toggle,
      remove,
      clear,
    ],
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist(): WishlistContextValue {
  const context = useContext(WishlistContext);
  if (!context) throw new Error("useWishlist must be used within <WishlistProvider>");
  return context;
}
