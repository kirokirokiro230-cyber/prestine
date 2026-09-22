/**
 * Art-directed image.
 *
 * ## The problem this solves
 *
 * `next/image` resizes **one** source. It cannot switch between sources, so a hero that
 * is a 3.2:1 strip on desktop and a tall block on a phone gets the same file at both,
 * and `object-cover` discards whatever does not fit — usually most of the width. That is
 * what "stretched" and "cut" actually look like.
 *
 * Different shapes need different crops, and choosing between crops is what `<picture>`
 * and `<source media>` exist for. The browser evaluates the media queries itself and
 * fetches exactly one file, before any JavaScript runs.
 *
 * ## What it costs
 *
 * Going around `/_next/image` means no automatic AVIF/WebP conversion. That is a real
 * cost on a hero, which is usually the LCP element — so this only wins if the uploaded
 * files are already close to the size they render at. The admin slots carry recommended
 * dimensions for exactly that reason, and `loading="eager"` plus `fetchPriority="high"`
 * on the priority slide recovers the head start `next/image`'s `priority` used to give.
 *
 * ## Why not two `<Image>`s toggled with `hidden`
 *
 * Nothing in the spec stops a browser fetching an image inside a `display:none`
 * container, and most do. That downloads both files to show one — worse than the
 * optimisation this gives up.
 */

interface ResponsiveImageProps {
  /** Desktop crop, and the fallback for every breakpoint that has none of its own. */
  src: string;
  /** Optional crops. Each falls back up the chain when absent. */
  mobileSrc?: string;
  tabletSrc?: string;
  /** Empty string marks the image decorative, which is right when copy sits over it. */
  alt: string;
  /** Skip lazy-loading. Set on the first hero slide, never on the rest. */
  priority?: boolean;
  className?: string;
}

/**
 * Breakpoints match Tailwind's `sm` (640px) and `lg` (1024px), so the crop switches at
 * the same widths the layout does. Hard-coding them here rather than reading the theme
 * because a `<source media>` attribute cannot contain a CSS variable.
 */
const MOBILE_MAX = 639;
const TABLET_MAX = 1023;

export function ResponsiveImage({
  src,
  mobileSrc,
  tabletSrc,
  alt,
  priority = false,
  className,
}: ResponsiveImageProps) {
  /*
   * Resolved upward so a merchant can upload one file and add the others later: a
   * missing mobile crop uses the tablet one, and a missing tablet crop uses desktop.
   * Emitting a `<source>` that points at the same file as the fallback would be
   * harmless but noisy, so those are simply left out.
   */
  const mobile = mobileSrc ?? tabletSrc;
  const tablet = tabletSrc;

  return (
    <picture>
      {mobile ? <source media={`(max-width: ${MOBILE_MAX}px)`} srcSet={mobile} /> : null}
      {tablet ? (
        <source
          media={`(min-width: ${MOBILE_MAX + 1}px) and (max-width: ${TABLET_MAX}px)`}
          srcSet={tablet}
        />
      ) : null}

      {/*
         A plain `<img>`, deliberately. `next/image` inside `<picture>` would render its
         own `<img>` with a `srcset` of its own, and the two selection mechanisms would
         compete for which file wins.
      */}
      <img
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        className={className}
      />
    </picture>
  );
}
