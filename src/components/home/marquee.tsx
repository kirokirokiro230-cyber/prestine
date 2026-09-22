import { cn } from "@/lib/utils";

/**
 * Infinite text marquee.
 *
 * The list is duplicated and the track translates -50%, which loops seamlessly.
 * The duplicate is `aria-hidden` so assistive tech reads the phrases once, and
 * the whole animation stops under `prefers-reduced-motion` via the global rule in
 * globals.css.
 */
export function Marquee({
  items,
  className,
}: {
  items: string[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group relative flex overflow-hidden border-y border-line bg-surface py-4",
        className,
      )}
    >
      <div className="flex w-max animate-marquee items-center group-hover:[animation-play-state:paused]">
        {[0, 1].map((copy) => (
          <ul
            key={copy}
            aria-hidden={copy === 1}
            className="flex shrink-0 items-center"
          >
            {items.map((item) => (
              <li
                key={`${copy}-${item}`}
                className="flex items-center gap-10 px-5 text-2xs uppercase tracking-[0.18em] text-content-muted"
              >
                {item}
                <span aria-hidden className="size-1 rounded-full bg-accent" />
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}
