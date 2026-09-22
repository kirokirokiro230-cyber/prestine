"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import type { BrowserStore } from "@/lib/browser-store";

/**
 * Read and write a `BrowserStore` from a component.
 *
 * Returns a tuple shaped like `useState`, so call sites read the same way they
 * would with local state — but the value comes from the store during render
 * rather than from an effect after mount.
 */
export function useBrowserStore<T>(
  store: BrowserStore<T>,
): [T, (next: T | ((current: T) => T)) => void] {
  const value = useSyncExternalStore(store.subscribe, store.read, store.serverSnapshot);

  const setValue = useCallback(
    (next: T | ((current: T) => T)) => {
      const resolved =
        typeof next === "function" ? (next as (current: T) => T)(store.read()) : next;
      store.write(resolved);
    },
    [store],
  );

  return [value, setValue];
}

/** Subscribe to nothing — for snapshot-only hooks that never change after mount. */
const noopSubscribe = () => () => {};

/**
 * `false` on the server and during the hydration render, `true` afterwards.
 *
 * The supported way to gate browser-only UI without a mount effect. Use it to
 * hold back cart counts and to show skeletons instead of flashing a wrong value.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/** Track a media query. Returns `false` during server render. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (listener: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", listener);
      return () => list.removeEventListener("change", listener);
    },
    [query],
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** True when the visitor has asked their OS to reduce motion. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

/**
 * Run `reset` during render when `value` changes.
 *
 * React's documented alternative to a reset effect for "adjust state when a prop
 * changes": setting state during render re-runs the component immediately without
 * painting the stale state, so there is no flash and no extra commit.
 */
export function useResetOnChange<T>(value: T, reset: () => void): void {
  // The previous value is held in state rather than a ref: refs must not be read
  // during render, and state comparison is the pattern React documents for this.
  const [previous, setPrevious] = useState(value);

  if (previous !== value) {
    setPrevious(value);
    reset();
  }
}
