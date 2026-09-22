import type { Review } from "../types";
import { rollReviews } from "./review-stats";

/**
 * Review prose.
 *
 * Imported only by the product page, never by the catalogue — see the note in
 * `review-stats.ts`. Swap `buildReviews` for a call to a reviews provider when one
 * is wired up; the returned shape is already the provider-agnostic `Review` type.
 */

const AUTHORS = [
  "Marguerite L.",
  "Daniel O.",
  "Priya R.",
  "Tomas B.",
  "Hana K.",
  "Elliot W.",
  "Sofia A.",
  "Noor H.",
  "Jasper M.",
  "Camille D.",
  "Ravi S.",
  "Ingrid T.",
  "Mateo F.",
  "Yuki N.",
  "Adaeze O.",
  "Felix G.",
  "Clara V.",
  "Idris A.",
];

const FITS: ReadonlyArray<Review["fit"]> = [
  "runs-small",
  "true-to-size",
  "true-to-size",
  "true-to-size",
  "runs-large",
];

const HEIGHTS = ["5'4\"", "5'6\"", "5'8\"", "5'9\"", "5'11\"", "6'0\"", "6'2\""];

const FIVE_STAR: Array<{ title: string; body: string }> = [
  {
    title: "Worth the wait",
    body: "I sized up on the advice of client care and it was the right call. The fabric has a dry, substantial hand that softens after the first wash without losing its shape. Third piece I have bought here and the finishing is consistently better than things I own at twice the price.",
  },
  {
    title: "Quietly excellent",
    body: "No logos, no fuss — just a very well cut garment. The seams are clean inside and out, and the buttons are actually sewn on properly with a shank. It has become the thing I reach for when I want to look considered without trying.",
  },
  {
    title: "Exactly as described",
    body: "The colour on screen matched what arrived, which is rare. Wore it four days running on a work trip and it did not bag out at the elbows or seat. Packaging was recyclable and the invoice was in the box rather than emailed as an afterthought.",
  },
  {
    title: "Holds up to real wear",
    body: "Six months in, washed cold roughly twenty times, hung to dry. No pilling, no twisted side seams, hem still straight. That is the whole review really — it just keeps working.",
  },
  {
    title: "Better in person",
    body: "The photographs undersell the texture. There is a subtle depth to the weave that you only notice in daylight. Fits true to size with a little room through the body, which is what I wanted for layering over a fine knit.",
  },
  {
    title: "My default now",
    body: "Bought one, wore it for a month, came back for the second colour. The shoulder sits properly, the sleeve length is right for someone with long arms, and it does not look tired at the end of a long day.",
  },
  {
    title: "Thoughtful details",
    body: "Interior seams are taped, the care label is printed rather than a scratchy tag, and there is a spare button sewn discreetly into the placket. Small things, but they signal that someone was paying attention.",
  },
];

const FOUR_STAR: Array<{ title: string; body: string }> = [
  {
    title: "Lovely, but check the length",
    body: "Quality is genuinely high and I am keeping it. My only note is that the body runs a little longer than I expected from the measurements, so if you are shorter than 5'5\" you may want to try the size below and accept a slimmer fit through the chest.",
  },
  {
    title: "Great fabric, snug shoulders",
    body: "The cloth is superb — heavier than I expected in the best way. The shoulders are cut close though, so if you carry any width there, size up. Client care answered within a couple of hours and the exchange was free, which softened the inconvenience.",
  },
  {
    title: "Very good, slight colour variance",
    body: "The shade reads a touch warmer than the studio images on my screen. Not a problem for me and arguably nicer, but worth knowing if you are matching it to something specific. Construction is faultless.",
  },
];

const THREE_STAR: Array<{ title: string; body: string }> = [
  {
    title: "Beautiful but I needed a different size",
    body: "No complaints about how it is made — the finishing is genuinely excellent. It simply did not work for my proportions and the size I needed was out of stock. Return was collected the next day and refunded in three, so the experience was still a good one.",
  },
  {
    title: "Runs small through the waist",
    body: "The measurements on the size guide were accurate but the cut is close through the waist and I would have preferred the next size up. Exchanging rather than returning as the fabric is worth persisting with.",
  },
];

/** Fixed reference date so generated dates never shift between builds. */
const REFERENCE_DATE = Date.UTC(2026, 6, 20);

const pick = <T,>(pool: readonly T[], draw: number): T =>
  pool[Math.min(pool.length - 1, Math.floor(draw * pool.length))];

/**
 * Build a product's review set.
 *
 * @param slug   Product slug — seeds the sequence.
 * @param count  How many reviews to synthesise.
 * @param sizes  Size labels a reviewer could have bought.
 */
export function buildReviews(slug: string, count: number, sizes: string[]): Review[] {
  return rollReviews(slug, count)
    .map((roll, index) => {
      const pool = roll.rating === 5 ? FIVE_STAR : roll.rating === 4 ? FOUR_STAR : THREE_STAR;
      const copy = pick(pool, roll.pickCopy);
      const date = new Date(REFERENCE_DATE - roll.dayOffset * 86_400_000);

      return {
        id: `${slug}-r${index + 1}`,
        author: pick(AUTHORS, roll.pickAuthor),
        date: date.toISOString().slice(0, 10),
        rating: roll.rating,
        title: copy.title,
        body: copy.body,
        verified: roll.verified,
        fit: pick(FITS, roll.pickFit),
        height: pick(HEIGHTS, roll.pickHeight),
        sizePurchased: sizes.length > 0 ? pick(sizes, roll.pickSize) : undefined,
      } satisfies Review;
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Count of each star value, highest first — powers the ratings histogram. */
export function ratingBreakdown(
  reviews: Review[],
): Array<{ stars: number; count: number; percent: number }> {
  const total = reviews.length || 1;
  return [5, 4, 3, 2, 1].map((stars) => {
    const count = reviews.filter((review) => review.rating === stars).length;
    return { stars, count, percent: Math.round((count / total) * 100) };
  });
}

/** Aggregate fit feedback into the three-segment fit meter. */
export function fitBreakdown(
  reviews: Review[],
): Array<{ fit: Review["fit"]; label: string; percent: number }> {
  const total = reviews.length || 1;
  const segments: Array<{ fit: Review["fit"]; label: string }> = [
    { fit: "runs-small", label: "Runs small" },
    { fit: "true-to-size", label: "True to size" },
    { fit: "runs-large", label: "Runs large" },
  ];

  return segments.map(({ fit, label }) => ({
    fit,
    label,
    percent: Math.round((reviews.filter((review) => review.fit === fit).length / total) * 100),
  }));
}
