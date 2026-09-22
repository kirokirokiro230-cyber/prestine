import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  BANNER_STATE_LABEL,
  FIRST_SLIDE,
  bannerState,
  goToSlide,
  nextSlide,
  previousSlide,
  settleSlide,
  type SlideTransition,
} from "@/lib/banners";
import type { Banner } from "@/lib/types";

/**
 * Banner scheduling and hero-carousel movement.
 *
 * Both are things you cannot see are broken by reading the page. A scheduling bug
 * shows a promotion a week early — or hides one the admin panel insists is live. A
 * movement bug sends the banner out the wrong way, or leaves a departed banner marked
 * as departing so it never retires.
 */

const BASE: Banner = {
  id: "banner-test",
  eyebrow: "",
  heading: "A test banner.",
  body: "",
  ctaLabel: "",
  ctaHref: "",
  imageUrl: "",
  imageAlt: "",
  accentHex: "#B08D63",
  textTone: "light",
  align: "left",
  active: true,
  position: 0,
  startsAt: "",
  endsAt: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const JUNE = Date.parse("2026-06-15T12:00:00.000Z");

describe("bannerState", () => {
  it("is live when active and unscheduled", () => {
    assert.equal(bannerState(BASE, JUNE), "live");
  });

  it("is hidden when switched off, whatever the dates say", () => {
    const banner = { ...BASE, active: false, startsAt: "", endsAt: "" };
    assert.equal(bannerState(banner, JUNE), "hidden");
  });

  it("is scheduled before its start date", () => {
    const banner = { ...BASE, startsAt: "2026-07-01T00:00:00.000Z" };
    assert.equal(bannerState(banner, JUNE), "scheduled");
  });

  it("is live once the start date has passed", () => {
    const banner = { ...BASE, startsAt: "2026-06-01T00:00:00.000Z" };
    assert.equal(bannerState(banner, JUNE), "live");
  });

  it("treats the start date as inclusive", () => {
    // A merchant setting a start of the 15th expects it live at midnight on the 15th.
    const startsAt = "2026-06-15T00:00:00.000Z";
    assert.equal(bannerState({ ...BASE, startsAt }, Date.parse(startsAt)), "live");
  });

  it("treats the end date as exclusive", () => {
    // ...and an end of the 30th means gone at 00:00 on the 30th, not during it.
    const endsAt = "2026-06-30T00:00:00.000Z";
    assert.equal(bannerState({ ...BASE, endsAt }, Date.parse(endsAt)), "expired");
    assert.equal(bannerState({ ...BASE, endsAt }, Date.parse(endsAt) - 1), "live");
  });

  it("reports scheduled rather than expired when both dates are in the future", () => {
    const banner = {
      ...BASE,
      startsAt: "2026-07-01T00:00:00.000Z",
      endsAt: "2026-07-31T00:00:00.000Z",
    };
    assert.equal(bannerState(banner, JUNE), "scheduled");
  });

  it("has a label for every state", () => {
    for (const state of ["live", "scheduled", "expired", "hidden"] as const) {
      assert.ok(BANNER_STATE_LABEL[state].length > 0, state);
    }
  });
});

describe("carousel movement — forward", () => {
  it("starts on the first banner with nothing leaving", () => {
    assert.deepEqual(FIRST_SLIDE, { current: 0, leaving: null, direction: "forward" });
  });

  it("moves on and sends the old banner out to the left", () => {
    assert.deepEqual(nextSlide(FIRST_SLIDE, 3), {
      current: 1,
      leaving: 0,
      direction: "forward",
    });
  });

  it("wraps from the last banner to the first, still exiting leftwards", () => {
    // The whole point of stacking the slides: wrapping is the same operation as any
    // other move, so the loop cannot rewind. Direction must stay forward here.
    assert.deepEqual(nextSlide({ current: 2, leaving: null, direction: "forward" }, 3), {
      current: 0,
      leaving: 2,
      direction: "forward",
    });
  });

  it("keeps exiting leftwards over several full loops", () => {
    let state = FIRST_SLIDE;

    for (let step = 0; step < 12; step += 1) {
      const expected = (state.current + 1) % 3;
      const previousCurrent = state.current;

      state = settleSlide(nextSlide(state, 3));

      assert.equal(state.current, expected, `step ${step}: landed on the wrong banner`);
      assert.equal(
        nextSlide(state, 3).direction,
        "forward",
        `step ${step}: exit direction flipped`,
      );
      assert.notEqual(state.current, previousCurrent, `step ${step}: did not move`);
    }
  });

  it("replaces the departing banner when moved again mid-exit", () => {
    // Rapid clicks: the previously departing banner is dropped rather than two exits
    // running at once. It is already invisible at that point.
    const midExit: SlideTransition = { current: 1, leaving: 0, direction: "forward" };
    assert.deepEqual(nextSlide(midExit, 3), {
      current: 2,
      leaving: 1,
      direction: "forward",
    });
  });
});

describe("carousel movement — backward", () => {
  it("sends the old banner out to the right", () => {
    assert.deepEqual(previousSlide({ current: 2, leaving: null, direction: "forward" }, 3), {
      current: 1,
      leaving: 2,
      direction: "backward",
    });
  });

  it("wraps back from the first banner to the last", () => {
    assert.deepEqual(previousSlide(FIRST_SLIDE, 3), {
      current: 2,
      leaving: 0,
      direction: "backward",
    });
  });
});

describe("carousel movement — dots", () => {
  it("jumps to a later banner as though next had been pressed", () => {
    assert.deepEqual(goToSlide(FIRST_SLIDE, 2, 3), {
      current: 2,
      leaving: 0,
      direction: "forward",
    });
  });

  it("jumps to an earlier banner as though back had been pressed", () => {
    assert.deepEqual(goToSlide({ current: 2, leaving: null, direction: "forward" }, 0, 3), {
      current: 0,
      leaving: 2,
      direction: "backward",
    });
  });

  it("ignores the banner already on screen", () => {
    // Identical object, so React skips the render rather than restarting an exit
    // animation on a banner that is not going anywhere.
    const state: SlideTransition = { current: 1, leaving: null, direction: "forward" };
    assert.equal(goToSlide(state, 1, 3), state);
  });
});

describe("carousel movement — coming to rest", () => {
  it("clears the departing banner", () => {
    assert.deepEqual(settleSlide({ current: 1, leaving: 0, direction: "forward" }), {
      current: 1,
      leaving: null,
      direction: "forward",
    });
  });

  it("is a no-op when nothing is leaving", () => {
    assert.equal(settleSlide(FIRST_SLIDE), FIRST_SLIDE);
  });

  it("leaves the exit direction alone, so it cannot flicker on retirement", () => {
    const settled = settleSlide({ current: 0, leaving: 2, direction: "backward" });
    assert.equal(settled.direction, "backward");
  });
});

describe("carousel movement — degenerate inputs", () => {
  it("does nothing with no banners", () => {
    assert.equal(nextSlide(FIRST_SLIDE, 0), FIRST_SLIDE);
    assert.equal(previousSlide(FIRST_SLIDE, 0), FIRST_SLIDE);
    assert.equal(goToSlide(FIRST_SLIDE, 0, 0), FIRST_SLIDE);
  });

  it("does nothing with a single banner", () => {
    // There is nowhere to go, and an exit animation with no replacement underneath
    // would slide the only banner off and leave the hero empty.
    assert.equal(nextSlide(FIRST_SLIDE, 1), FIRST_SLIDE);
    assert.equal(previousSlide(FIRST_SLIDE, 1), FIRST_SLIDE);
  });
});
