"use client";

import { CheckCircle, Truck } from "@phosphor-icons/react";
import { useFreeShippingNudge } from "@/components/providers/cart-provider";
import { cn } from "@/lib/utils";

/**
 * Progress toward complimentary shipping.
 *
 * The bar is decorative (`aria-hidden`) because the same information is already
 * in the sentence above it — announcing both would be redundant.
 */
export function FreeShippingMeter({ className }: { className?: string }) {
  const { label, progress, remaining } = useFreeShippingNudge();
  if (!label) return null;

  const unlocked = remaining === 0;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <p
        aria-live="polite"
        className={cn(
          "flex items-center gap-2 text-xs",
          unlocked ? "text-success-700 dark:text-success-500" : "text-content-muted",
        )}
      >
        {unlocked ? (
          <CheckCircle size={15} weight="fill" aria-hidden className="shrink-0" />
        ) : (
          <Truck size={15} aria-hidden className="shrink-0" />
        )}
        {label}
      </p>

      <div aria-hidden className="h-0.5 w-full overflow-hidden bg-surface-sunken">
        <div
          className={cn(
            "h-full transition-[width] duration-500 ease-out",
            unlocked ? "bg-success-500" : "bg-inverse",
          )}
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
    </div>
  );
}
