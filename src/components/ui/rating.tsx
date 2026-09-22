import { cn } from "@/lib/utils";

/**
 * Five-point star on a 20 x 20 grid, laid out five times across a 104-wide
 * viewBox (20 wide, 1 gap). Drawn as paths inside a single `<svg>` rather than
 * five icon components: a product grid renders dozens of ratings, and one SVG
 * element per rating instead of ten keeps the DOM an order of magnitude smaller.
 */
const STAR =
  "M10 1.6l2.55 5.17 5.7.83-4.12 4.02.97 5.68L10 14.62l-5.1 2.68.97-5.68L1.75 7.6l5.7-.83z";
const OFFSETS = [0, 21, 42, 63, 84];

function Stars({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 104 20"
      aria-hidden
      focusable="false"
      className={cn("block h-full w-auto", className)}
    >
      {OFFSETS.map((x) => (
        <path key={x} d={STAR} transform={`translate(${x} 0)`} />
      ))}
    </svg>
  );
}

interface RatingProps {
  /** 0–5. Fractional values render a partially filled star. */
  value: number;
  reviewCount?: number;
  /** Star height in pixels. */
  size?: number;
  /** Hide the trailing "4.8 (24)" text. */
  hideCount?: boolean;
  className?: string;
}

/**
 * Star rating.
 *
 * Renders one accessible sentence for assistive tech and a clipped-overlay visual
 * for sighted users, so a 4.3 looks like 4.3 rather than being rounded up.
 */
export function Rating({
  value,
  reviewCount,
  size = 13,
  hideCount = false,
  className,
}: RatingProps) {
  const clamped = Math.max(0, Math.min(5, value));
  const percent = (clamped / 5) * 100;

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="relative block" style={{ height: size }} aria-hidden>
        <Stars className="fill-ink-200 dark:fill-ink-600" />

        {/* Filled layer, clipped to the rating by width */}
        <span
          className="absolute inset-y-0 left-0 overflow-hidden"
          style={{ width: `${percent}%` }}
        >
          <Stars className="fill-clay-500 dark:fill-clay-300" />
        </span>
      </span>

      <span className="sr-only">
        Rated {clamped.toFixed(1)} out of 5
        {typeof reviewCount === "number" ? ` from ${reviewCount} reviews` : ""}
      </span>

      {!hideCount && typeof reviewCount === "number" ? (
        <span data-numeric className="text-xs text-content-muted" aria-hidden>
          {clamped.toFixed(1)} <span className="text-content-subtle">({reviewCount})</span>
        </span>
      ) : null}
    </span>
  );
}
