"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useBrowserStore } from "@/hooks/use-store";
import { recentSearchesStore } from "@/lib/stores";

const MAX_RECENT = 6;

interface SearchContextValue {
  isOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  recent: string[];
  /** Record a submitted query so it can be offered again. */
  remember: (query: string) => void;
  clearRecent: () => void;
}

const SearchContext = createContext<SearchContextValue | null>(null);

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [recent, setRecent] = useBrowserStore(recentSearchesStore);

  const openSearch = useCallback(() => setIsOpen(true), []);
  const closeSearch = useCallback(() => setIsOpen(false), []);

  const remember = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (trimmed.length < 2) return;
      setRecent((current) =>
        [trimmed, ...current.filter((q) => q.toLowerCase() !== trimmed.toLowerCase())].slice(
          0,
          MAX_RECENT,
        ),
      );
    },
    [setRecent],
  );

  const clearRecent = useCallback(() => setRecent([]), [setRecent]);

  const value = useMemo(
    () => ({ isOpen, openSearch, closeSearch, recent, remember, clearRecent }),
    [isOpen, openSearch, closeSearch, recent, remember, clearRecent],
  );

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearch(): SearchContextValue {
  const context = useContext(SearchContext);
  if (!context) throw new Error("useSearch must be used within <SearchProvider>");
  return context;
}
