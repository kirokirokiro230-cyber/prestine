"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CaretLeft, CaretRight } from "@phosphor-icons/react";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { useHorizontalSwipe } from "@/hooks/use-horizontal-swipe";
import { usePrefersReducedMotion } from "@/hooks/use-store";
import {
  FIRST_SLIDE,
  goToSlide,
  nextSlide,
  previousSlide,
  settleSlide,
} from "@/lib/banners";
import type { Banner } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Home-page hero carousel.
 *
 * The slides are **stacked**, not laid out in a row. Changing banner runs an exit
 * animation on the one leaving — it slides off and fades — while the next banner,
 * already underneath it at full opacity, is revealed.
 *
 * That arrangement is what keeps the loop honest. A sliding track has to travel back
 * across every slide to get from the last banner to the first, so the loop visibly
 * rewinds; earlier this was worked around with a duplicate slide and a silent reset.
 * Stacking removes the problem rather than compensating for it: there is no track to
 * travel along, so wrapping is the same operation as any other move.
 *
 * The departing banner is the one that animates, and the arriving one stays opaque
 * underneath. Cross-fading both would let the page background wash through the middle
 * of the transition, which on a full-bleed photograph looks like a rendering fault.
 *
 * Accessibility rules, all deliberate:
 *
 * - **Never auto-advance under `prefers-reduced-motion`.** Content that moves on its
 *   own is the exact thing that setting asks us not to do. Manual moves in that mode
 *   swap instantly, with no exit animation.
 * - **Auto-advance stops on hover and on focus inside**, so it cannot pull content
 *   away mid-read or mid-tab.
 * - **Every banner except the visible one is `inert`**, so their links are neither
 *   tabbable nor announced. All banners stay mounted so their images are fetched up
 *   front — a slide that loads its photograph at the moment it appears flashes empty.
 * - The whole thing degrades to a single static slide with no controls when there is
 *   one banner, because controls for one slide are noise.
 */

/**
 * How long each banner holds before the next one arrives.
 *
 * The exit eats `EXIT_MS` of this, so the banner is fully still for about 2.3s. That
 * is brisk — it is the top of the range asked for, and short enough that a long
 * headline may not be finished. Raise it here if that bites.
 */
const INTERVAL_MS = 3000;

/**
 * Length of the exit animation. **Mirrors the 0.7s in `--animate-fade-out-left`** in
 * globals.css; if one changes the other has to. It cannot be read from the token
 * because the timer needs the number before the element exists.
 */
const EXIT_MS = 700;

/** Shared by the previous/next buttons, which differ only in which edge they sit on. */
const ARROW_CLASS =
  "absolute top-1/2 z-30 hidden -translate-y-1/2 place-items-center rounded-full bg-canvas/85 p-2.5 text-content shadow-sm backdrop-blur-sm transition-[background-color,opacity] duration-300 hover:bg-canvas focus-visible:opacity-100 sm:grid lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100";

export function HeroCarousel({ banners }: { banners: Banner[] }) {
  const [slide, setSlide] = useState(FIRST_SLIDE);
  const [interacting, setInteracting] = useState(false);

  const { current, leaving, direction } = slide;

  const reducedMotion = usePrefersReducedMotion();

  const count = banners.length;
  const multiple = count > 1;

  /**
   * The stepping rules live in `@/lib/banners` as pure functions, where they are unit
   * tested. Keeping them out of here means the wrap-around behaviour can be checked
   * directly instead of eyeballed in a browser, which is the only way a regression in
   * it would otherwise show up.
   */
  const advance = useCallback(
    () => setSlide((state) => nextSlide(state, count)),
    [count],
  );

  const previous = useCallback(
    () => setSlide((state) => previousSlide(state, count)),
    [count],
  );

  const goTo = useCallback(
    (target: number) => setSlide((state) => goToSlide(state, target, count)),
    [count],
  );

  const swipeHandlers = useHorizontalSwipe({
    enabled: multiple,
    onSwipeLeft: advance,
    onSwipeRight: previous,
    onActiveChange: setInteracting,
  });

  useEffect(() => {
    if (!multiple || interacting || reducedMotion) return;

    const timer = setInterval(advance, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [advance, interacting, multiple, reducedMotion]);

  /**
   * Retire the departing banner once its animation has finished.
   *
   * A timer rather than `animationend`, because `animationend` does not fire if the
   * tab is hidden part-way through — which would leave the banner marked as departing
   * for good, holding its final frame across the top of the carousel.
   *
   * Under reduced motion there is no animation to wait for, so it retires immediately.
   */
  useEffect(() => {
    if (leaving === null) return;

    const timer = setTimeout(() => setSlide(settleSlide), reducedMotion ? 0 : EXIT_MS);
    return () => clearTimeout(timer);
  }, [leaving, reducedMotion]);

  if (count === 0) return null;

  return (
    <section
      {...swipeHandlers}
      aria-roledescription="carousel"
      aria-label="Featured"
      className="group relative touch-pan-y select-none overflow-hidden border-b border-line bg-surface-sunken shadow-lg"
      onMouseEnter={() => setInteracting(true)}
      onMouseLeave={() => setInteracting(false)}
      onFocusCapture={() => setInteracting(true)}
      onBlurCapture={() => setInteracting(false)}
      onKeyDown={(event) => {
        if (!multiple) return;
        if (event.key === "ArrowRight") {
          event.preventDefault();
          advance();
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          previous();
        }
      }}
    >
      {/**
       * The stack sets its own height, because absolutely positioned slides cannot.
       *
       * Mobile keeps a tall hero: a 16/5 strip on a 390px screen is 120px of
       * unreadable letterbox. From `lg` up it becomes a wide cinematic band (3.2:1),
       * so the photograph — not the copy — is what fills the fold on first paint.
       * `max-h` caps it, or on a short wide laptop the band would eat the whole
       * viewport and nothing below the banner would hint that the page scrolls.
       */}
      <div className="relative min-h-[26rem] sm:min-h-[32rem] lg:min-h-0 lg:aspect-16/5 lg:max-h-[28rem]">
        {banners.map((banner, position) => (
          <Slide
            key={banner.id}
            banner={banner}
            label={`${position + 1} of ${count}`}
            active={position === current}
            leaving={position === leaving}
            direction={direction}
            priority={position === 0}
            reducedMotion={reducedMotion}
          />
        ))}
      </div>

      {multiple ? (
        <>
          {/**
           * Previous / next. Hidden on small screens, where swipe is the gesture.
           *
           * From `lg` up they fade in on hover so they do not sit permanently on top
           * of the photograph. `focus-visible:opacity-100` is not optional: without
           * it a keyboard user tabs to a button they cannot see. `group-focus-within`
           * covers focus landing anywhere else in the carousel.
           */}
          <button
            type="button"
            onClick={previous}
            aria-label="Previous slide"
            className={cn(ARROW_CLASS, "left-3")}
          >
            <CaretLeft size={16} aria-hidden />
          </button>
          <button
            type="button"
            onClick={advance}
            aria-label="Next slide"
            className={cn(ARROW_CLASS, "right-3")}
          >
            <CaretRight size={16} aria-hidden />
          </button>

          <div className="absolute inset-x-0 bottom-6 z-30 flex items-center justify-center">
            {/* Lighter on desktop, but the pill stays. Dots straight onto an
                unknown merchant photograph is a contrast gamble. */}
            <div className="flex items-center gap-2 rounded-full border border-white/15 bg-ink-950/35 px-3 py-2 text-white shadow-lg backdrop-blur-md">
              {banners.map((banner, position) => (
                <button
                  key={banner.id}
                  type="button"
                  onClick={() => goTo(position)}
                  aria-label={`Go to slide ${position + 1}: ${banner.heading}`}
                  aria-current={position === current}
                  className="grid size-5 place-items-center"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "block h-1.5 rounded-full transition-all duration-300",
                      position === current
                        ? "w-5 bg-white"
                        : "w-1.5 bg-white/45 hover:bg-white/75",
                    )}
                  />
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function Slide({
  banner,
  label,
  active,
  leaving,
  direction,
  priority,
  reducedMotion,
}: {
  banner: Banner;
  label: string;
  active: boolean;
  leaving: boolean;
  direction: "forward" | "backward";
  priority: boolean;
  reducedMotion: boolean;
}) {
  const accent = banner.accentHex ?? "#3A3A38";
  const light = banner.textTone === "light";
  const centered = banner.align === "center";

  /**
   * Two touches on the arriving banner so it reads as arriving rather than simply
   * being uncovered: the image settles out of a slight zoom, and the copy rises and
   * fades in behind it. Both are skipped under reduced motion, as is the exit.
   */
  const animate = !reducedMotion;
  const exiting = leaving && animate;

  return (
    <div
      role="group"
      aria-roledescription="slide"
      aria-label={label}
      /**
       * Only the current banner is ever interactive. The departing one is still on
       * screen for `EXIT_MS`, but it is on its way out — letting Tab reach a link
       * that is sliding away, or a screen reader announce two banners at once, is
       * worse than the brief mismatch between what is visible and what is exposed.
       */
      inert={!active}
      aria-hidden={!active}
      className={cn(
        "absolute inset-0",
        // The departing banner sits above the arriving one — it is the thing being
        // animated, and it has to cover what it is revealing.
        leaving ? "z-20" : active ? "z-10" : "z-0",
        // Anything neither visible nor leaving is invisible rather than unmounted, so
        // its photograph is already fetched by the time its turn comes.
        !active && !leaving && "opacity-0",
        exiting &&
          (direction === "forward" ? "animate-fade-out-left" : "animate-fade-out-right"),
      )}
    >
      {banner.imageUrl || banner.imageUrlMobile || banner.imageUrlTablet ? (
        /*
         * `<picture>` rather than `next/image`, so a merchant's phone crop is used on a
         * phone instead of a desktop crop with its sides discarded. See
         * `components/ui/responsive-image.tsx` for what that trades away.
         *
         * `absolute inset-0` on the wrapper reproduces what `fill` did, and the `<img>`
         * takes `size-full object-cover` so it still covers the slide.
         */
        <div className="absolute inset-0">
          <ResponsiveImage
            src={banner.imageUrl ?? banner.imageUrlTablet ?? banner.imageUrlMobile ?? ""}
            mobileSrc={banner.imageUrlMobile}
            tabletSrc={banner.imageUrlTablet}
            alt={banner.imageAlt ?? ""}
            priority={priority}
            className={cn(
              "size-full object-cover",
              animate && "transition-transform duration-[1400ms] ease-out",
              // The zoom is the arriving banner's entrance, so the departing one holds
              // at 1 — otherwise it zooms in while sliding out, which fights itself.
              animate && !active && !leaving && "scale-[1.06]",
            )}
          />
        </div>
      ) : (
        /**
         * No photography yet. A generated gradient from the accent colour keeps the
         * hero looking deliberate rather than broken — the same approach as the
         * product artwork.
         */
        <div
          aria-hidden
          className={cn(
            "absolute inset-0",
            animate && "transition-transform duration-[1400ms] ease-out",
            animate && !active && !leaving && "scale-[1.06]",
          )}
          style={{
            backgroundImage: `linear-gradient(135deg, ${accent} 0%, ${accent}cc 45%, ${accent}66 100%)`,
          }}
        />
      )}

      {/**
       * Scrim. Text contrast cannot depend on which photo a merchant uploaded, so
       * there is always one.
       *
       * Two things vary. Left-aligned copy gets a directional gradient that is
       * heaviest behind the text and clears off the far side; centred copy gets a
       * flat wash, because a left-to-right gradient under centred text darkens the
       * wrong half. And it lightens from `lg` up: on the wide desktop band the
       * photograph is the point, and the mobile strength would flatten it.
       */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-0",
          centered
            ? light
              ? "bg-ink-950/55 lg:bg-ink-950/40"
              : "bg-bone-50/70 lg:bg-bone-50/55"
            : light
              ? "bg-gradient-to-r from-ink-950/75 via-ink-950/45 to-ink-950/15 lg:from-ink-950/50 lg:via-ink-950/10 lg:to-transparent"
              : "bg-gradient-to-r from-bone-50/85 via-bone-50/60 to-bone-50/20 lg:from-bone-50/70 lg:via-bone-50/25 lg:to-transparent",
        )}
      />

      {/* Copy */}
      <div className="page-gutter absolute inset-0 mx-auto flex max-w-page items-center">
        {/* `lg:py-0` — from `lg` up the aspect ratio sets the height and the flex
            parent centres this block, so vertical padding would only fight it. */}
        <div
          className={cn(
            "max-w-2xl py-20 lg:py-0",
            centered && "mx-auto text-center",
            animate && "transition-[opacity,transform] duration-700 ease-out",
            // The delay only applies on the way in, so leaving is immediate. The
            // departing slide keeps its copy: the exit animates the whole slide.
            animate &&
              (active || leaving
                ? "translate-y-0 opacity-100 delay-200"
                : "translate-y-4 opacity-0"),
          )}
        >
          {banner.eyebrow ? (
            <p
              className={cn(
                "text-2xs font-medium uppercase tracking-[0.16em]",
                light ? "text-bone-100/75" : "text-ink-700",
              )}
            >
              {banner.eyebrow}
            </p>
          ) : null}

          <h2
            className={cn(
              // Steps back down at `lg`: the band is short, and a 60px headline in
              // 28rem of height leaves no room for the image to read as a photograph.
              "mt-5 max-w-2xl text-balance font-display text-5xl font-medium leading-[0.96] tracking-[-0.04em] sm:text-6xl lg:text-7xl",
              light ? "text-bone-50" : "text-ink-950",
            )}
          >
            {banner.heading}
          </h2>

          {banner.body ? (
            <p
              className={cn(
                "mt-5 text-base leading-relaxed lg:mt-4 lg:text-sm",
                light ? "text-bone-100/85" : "text-ink-800",
              )}
            >
              {banner.body}
            </p>
          ) : null}

          {banner.ctaLabel && banner.ctaHref ? (
            <Link
              href={banner.ctaHref}
              className={cn(
                "group/cta mt-9 inline-flex h-12 items-center gap-3 rounded-full px-7 text-2xs font-semibold uppercase tracking-[0.14em] shadow-lg transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:shadow-xl lg:mt-8 lg:h-12 lg:px-7",
                light
                  ? "bg-bone-50 text-ink-950 hover:bg-bone-200"
                  : "bg-ink-950 text-bone-50 hover:bg-ink-800",
              )}
            >
              {banner.ctaLabel}
              {/* Named group — the section is also a `group` (it reveals the arrows
                  on hover), and an unnamed one here would be ambiguous to read. */}
              <ArrowRight
                size={14}
                aria-hidden
                className="transition-transform duration-300 group-hover/cta:translate-x-1"
              />
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
