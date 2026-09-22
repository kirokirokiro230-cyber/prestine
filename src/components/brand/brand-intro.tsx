"use client";

import { useEffect, useRef, useState } from "react";
import { TurtleMark, Wordmark } from "@/components/brand/brand-mark";

/**
 * The opening logo animation.
 *
 * The mark assembles in the middle of the screen, then **flies into the header** and
 * becomes the site logo — so the splash resolves into the page instead of merely
 * disappearing off it.
 *
 * A splash screen is a tax on the visitor, so this one is built to charge as little as
 * possible:
 *
 * - **It never blocks the page.** The shop renders underneath from the first byte, and
 *   the panel stops intercepting input the moment the flight starts — the shop is
 *   usable while the logo is still travelling.
 * - **It plays once per session.** Not once per page view; clicking into a product must
 *   not replay it.
 * - **Any input ends it.** A click, key, scroll or touch cuts to a short fade.
 * - **It is skipped entirely under `prefers-reduced-motion`**, in CSS, so it is never
 *   painted for those visitors.
 * - **It is invisible to assistive technology.** `aria-hidden`, no focusable children.
 *
 * ## Why an inline script
 *
 * Whether to play is a client-only question — the answer is in `sessionStorage`, which
 * the server cannot see. Deciding in React would mean one of two visible bugs: render
 * the panel and it flashes for returning visitors before an effect removes it, or skip
 * it and it appears *after* hydration, on top of a page already being read.
 *
 * So the same approach as the theme is used. `introInitScript` runs in `<head>` before
 * anything paints and marks the document, and CSS keys off that attribute. The assembly
 * is pure CSS and starts at first paint with no JavaScript involved.
 *
 * ## Why the flight is not
 *
 * The flight is the one part that cannot be CSS. Where the header logo sits depends on
 * the viewport, the header's own layout and the scroll position, so the distance has to
 * be measured at the moment of travel. Hard-coding it would put the mark in the wrong
 * place on every screen size but one.
 *
 * If that measurement fails — no header on the page, or JavaScript disabled entirely —
 * the mark fades out on a CSS timer instead and the header logo appears on the same
 * schedule. Nothing is left stranded mid-screen.
 */

const STORAGE_KEY = "prestine:intro-seen";
const VARIANT_KEY = "prestine:intro-variant";

/**
 * Which entrance plays.
 *
 * - `assemble` — **in use.** The shell arrives, the plates cut in from the centre, the
 *   limbs radiate outward, then the name rises letter by letter.
 * - `draw` — kept as an alternative. The mark traces its own outline, then the solid
 *   form inks in as the outline fades, and the name is wiped in left to right.
 *
 * Both end at `--intro-form` and hand over to the same flight, so they differ only in
 * the entrance and either can be made current by changing this one constant. `draw` is
 * deliberately retained rather than deleted: its CSS block is self-contained, it costs
 * about 1KB, and the alternative is re-deriving it later from scratch.
 *
 * `?intro=draw` previews it without a code change — see `introInitScript`.
 */
type IntroVariant = "assemble" | "draw";

const DEFAULT_VARIANT: IntroVariant = "assemble";

/**
 * Runs before first paint.
 *
 * Sets two attributes on `<html>`:
 *
 * - `data-intro` — `playing` on a first view, which is what hides the header logo so the
 *   flying mark has an empty slot to land in, or `seen` on a repeat view, which hides the
 *   whole thing with no flash.
 * - `data-intro-variant` — which entrance the CSS should run.
 *
 * `?intro=assemble` or `?intro=draw` overrides the variant *and* forces a replay, which
 * is the only practical way to look at either one: the intro is otherwise once per
 * session, so a second viewing would need storage cleared by hand. The choice is
 * remembered for the rest of the session, so it survives navigating around the site.
 *
 * Harmless to leave in public: the worst a visitor can do with it is watch a splash
 * screen again.
 *
 * Deliberately tiny, and wrapped in a try/catch because Safari in private mode throws on
 * `sessionStorage` — a decorative animation must never take the page down with it.
 */
export const introInitScript = `(function(){
var d=document.documentElement,v="${DEFAULT_VARIANT}",p="playing";
try{
var q=new URLSearchParams(location.search).get("intro");
if(q==="assemble"||q==="draw"){v=q;sessionStorage.setItem("${VARIANT_KEY}",q);}
else{
var s=sessionStorage.getItem("${VARIANT_KEY}");
if(s==="assemble"||s==="draw")v=s;
if(sessionStorage.getItem("${STORAGE_KEY}"))p="seen";
}
}catch(e){}
d.setAttribute("data-intro-variant",v);
d.setAttribute("data-intro",p);
})();`;

/**
 * Timings, mirroring the tokens in globals.css.
 *
 * `FORM_MS` is when the mark has finished assembling and the flight begins; the CSS
 * token `--intro-form` must match it, and `--intro-flight` must match `FLIGHT_MS`. They
 * are duplicated because JavaScript needs the numbers before the element exists.
 */
const FORM_MS = 1150;
const FLIGHT_MS = 620;

/** Length of the shortened fade when the visitor cuts the animation short. */
const DISMISS_MS = 220;

export function BrandIntro() {
  /**
   * `true` until the animation has finished and the panel has left the tree.
   *
   * Starts `true` so the server markup and the first client render agree. Returning
   * visitors are handled by the attribute the inline script sets, in CSS — rendering
   * something different here would be a hydration mismatch.
   */
  const [present, setPresent] = useState(true);
  const [flying, setFlying] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const flyerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Recorded immediately rather than at the end: someone who navigates away
    // mid-animation should still not see it again this session.
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Private browsing. It will play again next time, which is survivable.
    }
  }, []);

  /**
   * The flight.
   *
   * A reverse FLIP: the mark is already where it starts, so the header slot is measured
   * and the difference applied as a single transform. One composited transform on one
   * element, rather than animating width, height or position.
   */
  useEffect(() => {
    if (!present || dismissed) return;

    const skip =
      document.documentElement.dataset.intro === "seen" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (skip) {
      // Nothing is on screen — CSS has hidden it — so retire the node next tick
      // rather than leaving a full-screen overlay in the DOM.
      const now = setTimeout(() => setPresent(false), 0);
      return () => clearTimeout(now);
    }

    const launch = setTimeout(() => {
      const flyer = flyerRef.current;
      const target = document.querySelector("[data-brand-target]");

      // No landing spot: fall back to the CSS fade rather than flying nowhere.
      if (!flyer || !target) {
        setPresent(false);
        return;
      }

      const from = flyer.getBoundingClientRect();
      const to = target.getBoundingClientRect();

      // A zero-width target means the header has not laid out yet. Treat it as a
      // failed measurement instead of dividing by zero and scaling to infinity.
      if (from.width === 0 || to.width === 0) {
        setPresent(false);
        return;
      }

      flyer.style.setProperty(
        "--fly-x",
        `${to.left + to.width / 2 - (from.left + from.width / 2)}px`,
      );
      flyer.style.setProperty(
        "--fly-y",
        `${to.top + to.height / 2 - (from.top + from.height / 2)}px`,
      );
      flyer.style.setProperty("--fly-scale", String(to.width / from.width));

      setFlying(true);
    }, FORM_MS);

    return () => clearTimeout(launch);
  }, [dismissed, present]);

  /** Retire the panel once the mark has arrived. */
  useEffect(() => {
    if (!flying) return;

    const land = setTimeout(() => setPresent(false), FLIGHT_MS);
    return () => clearTimeout(land);
  }, [flying]);

  /**
   * Cut it short on any input — but only while the mark is still assembling. Once it is
   * flying the panel no longer takes pointer events and the shop is already usable, so
   * interrupting the last 620ms would just make the logo vanish mid-air.
   */
  useEffect(() => {
    if (!present || flying || dismissed) return;

    const cutShort = () => setDismissed(true);

    // `passive` so this can never delay a scroll; `once` so there is no state to
    // reason about after the first input.
    const options = { once: true, passive: true } as const;
    window.addEventListener("pointerdown", cutShort, options);
    window.addEventListener("keydown", cutShort, options);
    window.addEventListener("wheel", cutShort, options);
    window.addEventListener("touchstart", cutShort, options);

    return () => {
      window.removeEventListener("pointerdown", cutShort);
      window.removeEventListener("keydown", cutShort);
      window.removeEventListener("wheel", cutShort);
      window.removeEventListener("touchstart", cutShort);
    };
  }, [dismissed, flying, present]);

  useEffect(() => {
    if (!dismissed) return;

    const finish = setTimeout(() => setPresent(false), DISMISS_MS);
    return () => clearTimeout(finish);
  }, [dismissed]);

  /**
   * Hand the header its logo back on the way out.
   *
   * While `data-intro="playing"` the header's mark is hidden, so the flying one has an
   * empty slot to arrive in. CSS reveals it on a timer for the ordinary case; this
   * covers the two early exits — dismissal and a failed measurement — where that timer
   * would still be running and the header would be left blank.
   */
  useEffect(() => {
    if (present) return;

    document.documentElement.setAttribute("data-intro", "seen");
  }, [present]);

  if (!present) return null;

  return (
    <div
      className="intro"
      data-flying={flying ? "true" : undefined}
      data-dismissed={dismissed ? "true" : undefined}
      // Hidden from assistive technology entirely: the page underneath is the real
      // content, and it is already rendered and announced.
      aria-hidden
      // The backdrop swallows clicks rather than letting them reach a page the visitor
      // cannot see yet — mis-clicking an invisible "add to bag" is worse than the wait.
      onPointerDown={() => setDismissed(true)}
    >
      {/*
        The backdrop is a separate layer from the logo on purpose. Fading the panel
        itself would fade its children too, and the mark has to stay solid while it
        travels — a logo dissolving in mid-flight looks like a bug, not a transition.
      */}
      <div className="intro-veil" />

      <div ref={flyerRef} className="intro-flyer">
        <TurtleMark className="intro-mark" />
        {/*
          The wordmark is part of the opening lockup but not part of the flight: the
          header shows it beside the mark at a completely different size and
          orientation, so it fades out as the mark leaves and the header's own copy
          fades in. Trying to morph one into the other reads as a glitch.
        */}
        <Wordmark className="intro-word" />
      </div>
    </div>
  );
}
