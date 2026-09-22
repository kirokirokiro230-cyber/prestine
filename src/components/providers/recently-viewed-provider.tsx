"use client";

import { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import { useBrowserStore, useIsHydrated } from "@/hooks/use-store";
import { recentlyViewedStore } from "@/lib/stores";

const MAX_ENTRIES = 8;

interface RecentlyViewedContextValue {
  /** Product slugs, most recent first. */
  slugs: string[];
  hydrated: boolean;
  clear: () => void;
}

const RecentlyViewedContext = createContext<RecentlyViewedContextValue | null>(null);

/** Internal: exposed through `useTrackProductView` below. */
const TrackContext = createContext<((slug: string) => void) | null>(null);

export function RecentlyViewedProvider({ children }: { children: React.ReactNode }) {
  const [slugs, setSlugs] = useBrowserStore(recentlyViewedStore);
  const hydrated = useIsHydrated();

  const track = useCallback(
    (slug: string) => {
      setSlugs((current) =>
        [slug, ...current.filter((s) => s !== slug)].slice(0, MAX_ENTRIES),
      );
    },
    [setSlugs],
  );

  const clear = useCallback(() => setSlugs([]), [setSlugs]);

  const value = useMemo(() => ({ slugs, hydrated, clear }), [slugs, hydrated, clear]);

  return (
    <RecentlyViewedContext.Provider value={value}>
      <TrackContext.Provider value={track}>{children}</TrackContext.Provider>
    </RecentlyViewedContext.Provider>
  );
}

export function useRecentlyViewed(): RecentlyViewedContextValue {
  const context = useContext(RecentlyViewedContext);
  if (!context) {
    throw new Error("useRecentlyViewed must be used within <RecentlyViewedProvider>");
  }
  return context;
}

/**
 * Record a product view.
 *
 * A legitimate effect: it writes to an external system (storage) in response to
 * navigation, rather than deriving React state.
 */
export function useTrackProductView(slug: string): void {
  const track = useContext(TrackContext);

  useEffect(() => {
    track?.(slug);
  }, [slug, track]);
}
