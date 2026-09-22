"use client";

import { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import { useBrowserStore, useMediaQuery } from "@/hooks/use-store";
import { THEME_STORAGE_KEY, themeStore, type ThemeChoice } from "@/lib/stores";

interface ThemeContextValue {
  /** What the visitor selected. */
  choice: ThemeChoice;
  /** What is actually applied right now. */
  resolved: "light" | "dark";
  setChoice: (choice: ThemeChoice) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Inline script that runs before first paint to apply the stored theme.
 *
 * Without it, a dark-mode visitor sees a white flash on every page load. Kept as
 * a string so it can be injected in the document head; it reads only its own
 * storage key and touches no user input.
 */
export const themeInitScript = `(function(){try{var k="${THEME_STORAGE_KEY}";var s=localStorage.getItem(k);var m=window.matchMedia("(prefers-color-scheme: dark)").matches;var d=s==="dark"||((!s||s==="system")&&m);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [choice, setStoredChoice] = useBrowserStore(themeStore);
  const systemPrefersDark = useMediaQuery("(prefers-color-scheme: dark)");

  // Derived, not stored: there is only one source of truth for what is applied.
  const resolved: "light" | "dark" =
    choice === "dark" || (choice === "system" && systemPrefersDark) ? "dark" : "light";

  // The only effect here, and it is a genuine one: syncing an external system
  // (the document element) with React state.
  useEffect(() => {
    const isDark = resolved === "dark";
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
  }, [resolved]);

  const setChoice = useCallback(
    (next: ThemeChoice) => setStoredChoice(next),
    [setStoredChoice],
  );

  const toggle = useCallback(() => {
    setStoredChoice(resolved === "dark" ? "light" : "dark");
  }, [resolved, setStoredChoice]);

  const value = useMemo(
    () => ({ choice, resolved, setChoice, toggle }),
    [choice, resolved, setChoice, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within <ThemeProvider>");
  return context;
}
