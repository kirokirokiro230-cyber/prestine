"use client";

import { Minus, Plus } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface QuantityStepperProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  /** Announced as the control's purpose, e.g. "Quantity for Cashmere Crew". */
  label: string;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Quantity control. The value is a live region so screen-reader users hear the
 * new count after pressing plus or minus, and both buttons keep a 44px touch
 * target at `md`.
 */
export function QuantityStepper({
  value,
  min = 1,
  max = 10,
  onChange,
  label,
  size = "md",
  className,
}: QuantityStepperProps) {
  const buttonSize = size === "sm" ? "size-8" : "size-10";

  return (
    <div
      className={cn("inline-flex items-center border border-line-strong", className)}
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={`Decrease quantity, currently ${value}`}
        className={cn(
          buttonSize,
          "grid place-items-center text-content transition-colors hover:bg-surface-sunken disabled:cursor-not-allowed disabled:text-content-subtle disabled:hover:bg-transparent",
        )}
      >
        <Minus size={13} aria-hidden />
      </button>

      <span
        data-numeric
        aria-live="polite"
        className={cn(
          "grid min-w-9 place-items-center text-sm tabular-nums",
          size === "sm" && "min-w-8 text-xs",
        )}
      >
        {value}
      </span>

      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={`Increase quantity, currently ${value}`}
        className={cn(
          buttonSize,
          "grid place-items-center text-content transition-colors hover:bg-surface-sunken disabled:cursor-not-allowed disabled:text-content-subtle disabled:hover:bg-transparent",
        )}
      >
        <Plus size={13} aria-hidden />
      </button>
    </div>
  );
}
