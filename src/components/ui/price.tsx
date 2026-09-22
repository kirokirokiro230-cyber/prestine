"use client";

import { useMoney } from "@/components/providers/store-provider";
import { discountPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

interface PriceProps {
  /** Minor units. */
  value: number;
  /** Minor units. Renders a struck-through original when higher than `value`. */
  compareAt?: number;
  size?: "sm" | "md" | "lg";
  /** Show the "−20%" chip beside the prices. */
  showDiscount?: boolean;
  className?: string;
}

const SIZES = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
} as const;

/**
 * Price display. The reduced figure always comes first in the DOM so a screen
 * reader announces what the shopper will pay before what they would have paid.
 */
export function Price({
  value,
  compareAt,
  size = "sm",
  showDiscount = false,
  className,
}: PriceProps) {
  const money = useMoney();
  const reduced = typeof compareAt === "number" && compareAt > value;
  const off = reduced ? discountPercent(value, compareAt) : 0;

  return (
    <span className={cn("inline-flex items-baseline gap-2", SIZES[size], className)}>
      <span
        data-numeric
        className={cn("tracking-tight", reduced ? "text-danger-500 dark:text-clay-300" : "text-content")}
      >
        {reduced ? <span className="sr-only">Reduced price: </span> : null}
        {money(value)}
      </span>

      {reduced ? (
        <>
          <s data-numeric className="text-content-subtle decoration-1">
            <span className="sr-only">Original price: </span>
            {money(compareAt)}
          </s>
          {showDiscount ? (
            <span className="text-2xs font-medium uppercase tracking-[0.1em] text-danger-500 dark:text-clay-300">
              {off}% off
            </span>
          ) : null}
        </>
      ) : null}
    </span>
  );
}
