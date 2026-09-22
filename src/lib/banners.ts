import type { Banner } from "./types";

/**
 * What a banner is doing right now.
 *
 * One definition, used in two places: the repository filters the storefront on it,
 * and the admin list labels each row with it. Without a shared function the panel
 * could confidently say "On the site" about a slide the storefront was filtering out.
 *
 * Pure and time-injected on purpose. Reading the clock inside a React component makes
 * the render impure and produces a server/client hydration mismatch, so the caller
 * passes `now` — on the server, where there is one answer.
 */
export type BannerState = "live" | "scheduled" | "expired" | "hidden";

export function bannerState(banner: Banner, now: number): BannerState {
  if (!banner.active) return "hidden";
  // `startsAt` inclusive, `endsAt` exclusive: an end date of the 30th means the
  // slide is gone at 00:00 on the 30th, which is what a merchant expects.
  if (banner.startsAt && now < Date.parse(banner.startsAt)) return "scheduled";
  if (banner.endsAt && now >= Date.parse(banner.endsAt)) return "expired";
  return "live";
}

export const BANNER_STATE_LABEL: Record<BannerState, string> = {
  live: "On the site",
  scheduled: "Scheduled",
  expired: "Expired",
  hidden: "Hidden",
};

/**
 * Which banner the hero carousel is showing, and which one is on its way out.
 *
 * The slides are stacked rather than laid out in a row, so a change of banner is an
 * exit animation on the one leaving — it slides off and fades, revealing the next,
 * which is already sitting underneath at full opacity. Nothing is ever "scrolled to",
 * which is why wrapping from the last banner to the first cannot rewind: there is no
 * track to travel back along.
 *
 * `leaving` is null when the carousel is at rest. `direction` only describes how that
 * departing banner exits — left when moving forwards, right when going back — so the
 * motion always agrees with the visitor's intent.
 */
export type SlideTransition = {
  current: number;
  leaving: number | null;
  direction: "forward" | "backward";
};

export const FIRST_SLIDE: SlideTransition = {
  current: 0,
  leaving: null,
  direction: "forward",
};

/** Move to the next banner, sending the current one out to the left. */
export function nextSlide(state: SlideTransition, count: number): SlideTransition {
  if (count < 2) return state;

  return {
    current: (state.current + 1) % count,
    leaving: state.current,
    direction: "forward",
  };
}

/** Move to the previous banner, sending the current one out to the right. */
export function previousSlide(state: SlideTransition, count: number): SlideTransition {
  if (count < 2) return state;

  return {
    current: (state.current - 1 + count) % count,
    leaving: state.current,
    direction: "backward",
  };
}

/**
 * Jump straight to a banner, as the dots do.
 *
 * Choosing the banner already on screen returns the state unchanged — identical
 * object, so React skips the render — rather than restarting an exit animation on a
 * banner that is not going anywhere.
 *
 * The exit direction follows the shorter reading of the move: picking a later banner
 * behaves like pressing next, an earlier one like pressing back.
 */
export function goToSlide(
  state: SlideTransition,
  target: number,
  count: number,
): SlideTransition {
  if (count < 2) return state;
  if (target === state.current) return state;

  return {
    current: target,
    leaving: state.current,
    direction: target > state.current ? "forward" : "backward",
  };
}

/**
 * Come to rest once the exit animation has finished.
 *
 * Until this runs, the departed banner is still marked as leaving and holds the end
 * frame of its animation. Clearing it puts the carousel back to a single visible
 * banner, so the next move starts from a clean state.
 */
export function settleSlide(state: SlideTransition): SlideTransition {
  if (state.leaving === null) return state;
  return { ...state, leaving: null };
}
