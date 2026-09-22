"use client";

import { Moon, Sun } from "@phosphor-icons/react";
import { useTheme } from "@/components/providers/theme-provider";
import { useIsHydrated } from "@/hooks/use-store";
import { cn } from "@/lib/utils";

/**
 * Light/dark switch.
 *
 * Renders an inert placeholder until mounted: the applied theme is only known on
 * the client, and guessing would either flash the wrong icon or mismatch
 * hydration. The placeholder keeps the header layout stable meanwhile.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolved, toggle } = useTheme();
  const hydrated = useIsHydrated();

  if (!hydrated) {
    return <span aria-hidden className={cn("block size-11 shrink-0", className)} />;
  }

  const goingDark = resolved === "light";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={goingDark ? "Switch to dark theme" : "Switch to light theme"}
      title={goingDark ? "Dark theme" : "Light theme"}
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-full text-content transition-colors hover:bg-surface-sunken",
        className,
      )}
    >
      {goingDark ? (
        <Moon size={18} aria-hidden />
      ) : (
        <Sun size={18} aria-hidden />
      )}
    </button>
  );
}
