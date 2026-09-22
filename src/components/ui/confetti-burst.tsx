"use client";

import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/use-store";
import { cn } from "@/lib/utils";

/**
 * A party-popper burst, for the moment a promotion code lands.
 *
 * ## Usage
 *
 * Fires once per mount, so re-firing is a remount driven by a changing `key`:
 *
 * ```tsx
 * {celebrations > 0 ? <ConfettiBurst key={celebrations} /> : null}
 * ```
 *
 * A `key` rather than a prop the component watches. Restarting a CSS animation on an
 * element that already ran it needs a forced reflow between removing and re-adding the
 * class; a remount gives the same thing for free, and it means this component holds no
 * state about how many times it has gone off.
 *
 * Requires a positioned ancestor — it covers `inset-0` of the nearest one.
 *
 * ## Why this is CSS and not a library
 *
 * `canvas-confetti` and friends are 5–10KB gzipped plus a `requestAnimationFrame` loop, to
 * animate forty rectangles. This project has six runtime dependencies and a CI check on
 * client bundle contents, and CSS transforms on forty absolutely-positioned elements are
 * composited off the main thread — the same work the canvas version does, without the
 * JavaScript and without the frame loop.
 *
 * Each particle's trajectory is randomised into inline custom properties which the
 * `confetti-fly` keyframe reads. That is the only way to parameterise a keyframe; the
 * alternative is forty near-identical `@keyframes` blocks.
 *
 * ## Reduced motion
 *
 * Renders nothing. The global `prefers-reduced-motion` rule in `globals.css` clamps every
 * animation to 0.01ms, which here would mean forty particles snapping to their end state
 * and flashing — worse than the celebration it replaced. Anyone who asked for less motion
 * gets the toast and the chip, which carry the actual information.
 */

/**
 * Particle count.
 *
 * Forty reads as a burst. A hundred reads as a screensaver and starts to cost real layout
 * work on a mid-range phone, on the page immediately before checkout.
 */
const PARTICLE_COUNT = 40;

/** Longest particle, plus its stagger and a margin, in milliseconds. */
const DURATION_MS = 1500;

interface Particle {
  id: number;
  style: React.CSSProperties;
  /** Some rectangles, some circles — a single shape looks mechanical. */
  round: boolean;
}

/**
 * Build the particles.
 *
 * Colours are theme tokens rather than literals, so a merchant who changes the accent gets
 * confetti that matches instead of confetti that clashes. Five of them, so the burst reads
 * as intentional rather than as a bag of sweets.
 */
function makeParticles(): Particle[] {
  const palette = [
    "var(--color-accent)",
    "var(--color-success-500)",
    "var(--color-warning-500)",
    "var(--color-clay-300)",
    "var(--color-clay-500)",
  ];

  return Array.from({ length: PARTICLE_COUNT }, (_, id) => {
    /*
     * Angles are biased upward — roughly a 140° fan centred above the origin. A full 360°
     * spread sends a third of the confetti straight down, where it is clipped by the panel
     * and never seen, which reads as half the particles failing to render.
     */
    const angle = (-160 + Math.random() * 140) * (Math.PI / 180);
    const distance = 70 + Math.random() * 130;

    return {
      id,
      round: id % 3 === 0,
      style: {
        left: `${44 + Math.random() * 12}%`,
        top: `${52 + Math.random() * 8}%`,
        width: `${5 + Math.random() * 5}px`,
        height: `${7 + Math.random() * 7}px`,
        background: palette[id % palette.length],
        "--fly-x": `${Math.cos(angle) * distance}px`,
        "--fly-y": `${Math.sin(angle) * distance}px`,
        "--fall": `${120 + Math.random() * 110}px`,
        "--spin": `${Math.random() * 900 - 450}deg`,
        // Staggered, so the burst has a leading edge instead of firing as one block.
        animationDelay: `${Math.random() * 120}ms`,
      } as React.CSSProperties,
    };
  });
}

export function ConfettiBurst({ className }: { className?: string }) {
  const reducedMotion = usePrefersReducedMotion();

  /*
   * Lazy initialiser, so the trajectories are randomised once per mount rather than on
   * every render — without it each parent render would reshuffle the particles mid-flight.
   */
  const [particles] = useState(makeParticles);

  /*
   * Removed once the animation is over rather than left at `opacity: 0`. Forty stale
   * absolutely-positioned nodes would otherwise sit in the layer tree for the rest of the
   * session, inside the panel the shopper is about to check out from.
   */
  const [done, setDone] = useState(false);

  useEffect(() => {
    // setState from a timer, not synchronously during the effect, so this schedules one
    // extra render at the end rather than a cascade on mount.
    const timer = setTimeout(() => setDone(true), DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  if (reducedMotion || done) return null;

  return (
    <div
      // Purely decorative, and it sits over interactive controls.
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 z-10 overflow-hidden",
        className,
      )}
    >
      {particles.map((particle) => (
        <span
          key={particle.id}
          style={particle.style}
          className={cn(
            "absolute block animate-confetti-fly",
            particle.round && "rounded-full",
          )}
        />
      ))}
    </div>
  );
}
