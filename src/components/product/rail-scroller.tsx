"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/**
 * Horizontal scroll container with previous/next arrows.
 *
 * A client component that takes **already-rendered** cards as `children`. The rail
 * itself stays a server component: passing elements down means the product cards are
 * still rendered on the server and none of the catalogue reaches the browser bundle,
 * which is the whole point of the projection boundary in `product-grid.tsx`.
 *
 * Notes on the parts that are easy to get wrong:
 *
 * - **Native scrolling is preserved.** The arrows call `scrollBy`; they do not replace
 *   the scroll container with a transform. Swipe, trackpad, shift-wheel, and arrow keys
 *   after tabbing into the list all keep working, and `scroll-snap` still lands cards
 *   on their edges.
 * - **Arrows are hidden when there is nothing to scroll.** Rendering a permanently
 *   disabled arrow on a rail of three cards is noise. `overflow` is measured, not
 *   assumed from the child count, because how many fit depends on the viewport.
 * - **`scrollWidth` is measured after layout and on resize.** A rail that fits at
 *   1280px overflows at 640px, so the decision cannot be made once.
 */
export function RailScroller({
  children,
  label,
  className,
}: {
  children: React.ReactNode;
  /** Names the rail for screen readers, e.g. "New arrivals". */
  label: string;
  className?: string;
}) {
  const track = useRef<HTMLUListElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  /**
   * Recompute which arrows apply.
   *
   * The 2px tolerance is not superstition: sub-pixel layout and fractional device
   * ratios mean `scrollLeft + clientWidth` frequently lands a fraction short of
   * `scrollWidth` at the true end, which would leave the next arrow enabled forever.
   */
  const measure = useCallback(() => {
    const element = track.current;
    if (!element) return;

    const maxScroll = element.scrollWidth - element.clientWidth;
    setAtStart(element.scrollLeft <= 2);
    setAtEnd(maxScroll <= 2 || element.scrollLeft >= maxScroll - 2);
  }, []);

  useEffect(() => {
    measure();

    const element = track.current;
    if (!element) return;

    // `ResizeObserver` rather than a window resize listener: the rail also changes
    // width when a sidebar opens or the scrollbar appears, which never fires `resize`.
    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => observer.disconnect();
  }, [measure]);

  const scroll = (direction: -1 | 1) => {
    const element = track.current;
    if (!element) return;

    // Just under a full viewport, so the card at the edge stays partly visible and
    // the shopper keeps their place instead of being teleported to a fresh set.
    element.scrollBy({ left: direction * element.clientWidth * 0.85, behavior: "smooth" });
  };

  // Nothing overflows, so there is nothing to page through.
  const idle = atStart && atEnd;

  return (
    <div className={cn("relative", className)}>
      <ul
        ref={track}
        onScroll={measure}
        className="scrollbar-thin -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12"
      >
        {children}
      </ul>

      {idle ? null : (
        <>
          <ArrowButton
            direction="previous"
            label={`Previous ${label}`}
            disabled={atStart}
            onClick={() => scroll(-1)}
          />
          <ArrowButton
            direction="next"
            label={`More ${label}`}
            disabled={atEnd}
            onClick={() => scroll(1)}
          />
        </>
      )}
    </div>
  );
}

/**
 * One arrow.
 *
 * Hidden below `lg`, where swipe is the gesture and a floating control would sit on
 * top of a card. `disabled` rather than removed at the extremes so the pair does not
 * shift position as the shopper scrolls.
 */
function ArrowButton({
  direction,
  label,
  disabled,
  onClick,
}: {
  direction: "previous" | "next";
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "absolute top-[38%] z-10 hidden size-10 -translate-y-1/2 place-items-center rounded-full border border-line bg-canvas/90 text-content shadow-sm backdrop-blur-sm transition-opacity hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-0 lg:grid",
        direction === "previous" ? "-left-3" : "-right-3",
      )}
    >
      {direction === "previous" ? (
        <CaretLeft size={16} aria-hidden />
      ) : (
        <CaretRight size={16} aria-hidden />
      )}
    </button>
  );
}
