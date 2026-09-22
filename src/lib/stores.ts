import { createJsonStore, createStringStore } from "./browser-store";
import type { Address, CartLine, OrderRef, WishlistEntry } from "./types";

/**
 * Every piece of persisted browser state, declared in one place.
 *
 * Keys are versioned so a future schema change can ship without corrupting
 * someone's bag — bump the suffix and old data is simply ignored.
 */

export const cartStore = createJsonStore<CartLine[]>("prestine:cart:v1", []);

export const wishlistStore = createJsonStore<WishlistEntry[]>("prestine:wishlist:v1", []);

export const recentlyViewedStore = createJsonStore<string[]>(
  "prestine:recently-viewed:v1",
  [],
);

export const recentSearchesStore = createJsonStore<string[]>(
  "prestine:recent-searches:v1",
  [],
);

export const addressStore = createJsonStore<Address[]>("prestine:addresses:v1", []);

/**
 * Receipt stubs, not orders.
 *
 * Orders themselves live on the server now, so the browser only keeps the
 * reference and the email needed to claim it. Nothing here is authoritative and
 * nothing here is worth stealing — the totals, status and tracking all come from
 * the server on demand. Key bumped to v2 so any v1 payload of full orders written
 * by an earlier build is ignored rather than misread.
 */
export const orderStore = createJsonStore<OrderRef[]>("prestine:orders:v2", []);

/**
 * When the post-delivery review prompt may next appear, as an epoch-millis timestamp.
 *
 * Dismissing the prompt sets this a few days out so a shopper who is not in the mood is
 * not asked again on the very next page. Zero — the default — means "no snooze", so the
 * prompt is free to open as soon as there is something to review. Not authoritative: the
 * server decides *whether* there is anything to ask about; this only paces *when*.
 */
export const reviewPromptSnoozeStore = createJsonStore<number>(
  "prestine:review-snooze:v1",
  0,
);

export const THEME_STORAGE_KEY = "prestine:theme";

export type ThemeChoice = "light" | "dark" | "system";

export const THEME_CHOICES = ["light", "dark", "system"] as const;

export const themeStore = createStringStore<ThemeChoice>(
  THEME_STORAGE_KEY,
  "system",
  THEME_CHOICES,
);
