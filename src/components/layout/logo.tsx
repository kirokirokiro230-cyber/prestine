import Link from "next/link";
import { TurtleMark, Wordmark } from "@/components/brand/brand-mark";
import { cn } from "@/lib/utils";

/**
 * The brand lockup: the mark alongside the wordmark.
 *
 * Both halves are inline SVG rather than an image file, so the logo stays crisp at any
 * size, inherits the theme colour through `currentColor`, needs no network request and
 * cannot be a broken image. The accessible name comes from settings, so the label still
 * follows the store name even though the artwork is fixed.
 *
 * ## The flight target
 *
 * The opening animation ends by flying the mark from the middle of the screen into
 * this lockup, which means the intro has to be able to find the mark and measure where
 * it will land. Only the header's copy is flagged with `flightTarget`, because a page
 * can contain several lockups — the footer has one — and the intro must not aim at the
 * wrong one.
 *
 * While the intro is playing, CSS hides the flagged mark and reveals it as the flying
 * one arrives. It still occupies layout the whole time, which is what makes it
 * measurable before it is visible.
 */
export function Logo({
  name,
  className,
  size = "md",
  flightTarget = false,
}: {
  name: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  /** Marks this lockup as where the opening animation lands. Header only. */
  flightTarget?: boolean;
}) {
  return (
    <Link
      href="/"
      aria-label={`${name} — home`}
      className={cn(
        "group/logo inline-flex shrink-0 items-center text-content transition-opacity hover:opacity-70",
        size === "sm" && "gap-2",
        size === "md" && "gap-2.5",
        size === "lg" && "gap-3.5",
        className,
      )}
    >
      <TurtleMark
        /**
         * Spread rather than `data-brand-target={flightTarget ? "" : undefined}`.
         * An explicitly-undefined prop is still serialised into the streamed payload
         * as `"$undefined"` on every lockup that is not the target; omitting the key
         * keeps it out of the wire format altogether.
         */
        {...(flightTarget ? { "data-brand-target": "" } : {})}
        className={cn(
          "w-auto",
          size === "sm" && "h-6",
          size === "md" && "h-7 lg:h-8",
          size === "lg" && "h-12 lg:h-14",
        )}
      />
      <Wordmark
        className={cn(
          "w-auto",
          size === "sm" && "h-[0.6rem]",
          size === "md" && "h-[0.68rem] lg:h-[0.78rem]",
          size === "lg" && "h-[1.1rem] lg:h-[1.3rem]",
        )}
      />
    </Link>
  );
}
