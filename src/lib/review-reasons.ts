import type { Review, SubmittedReview } from "./types";

/**
 * The canned phrases a shopper taps instead of writing a review from scratch.
 *
 * The prompt is rating-first: the star count is chosen, and only then do the reasons
 * that make sense for that score appear. A five-star review is offered praise; a
 * three-star one is offered the honest disappointments a three-star review is actually
 * about. Offering the same neutral list at every rating would produce reviews that read
 * like a form, which is exactly what this is trying not to feel like.
 *
 * Kept out of the component so the server can validate a submission against the same
 * list the client rendered — a reason that was never offered for a given rating is a
 * crafted request, not a tap, and is rejected rather than stored.
 */

export type Rating = 1 | 2 | 3 | 4 | 5;

/** The literal shown on the "write your own" chip, and the sentinel the form checks for. */
export const OTHER_REASON = "Other";

const REASONS: Record<Rating, readonly string[]> = {
  5: [
    "Excellent quality",
    "True to size",
    "Fast delivery",
    "Exactly as described",
    "Beautiful finish",
    "Great value",
  ],
  4: [
    "Good quality",
    "Comfortable",
    "As described",
    "Slightly off on fit",
    "Minor colour difference",
    "Would buy again",
  ],
  3: [
    "Quality was okay",
    "Fit wasn't right",
    "Ran small",
    "Ran large",
    "Colour differed from photos",
    "Delivery was slow",
  ],
  2: [
    "Poor quality",
    "Not as described",
    "Fit was wrong",
    "Arrived late",
    "Looked different in person",
    "Not worth the price",
  ],
  1: [
    "Very poor quality",
    "Nothing like the description",
    "Wrong item or size",
    "Arrived damaged",
    "Would not recommend",
  ],
};

/** The preset reasons offered for a given star rating, plus the "Other" escape hatch. */
export function reasonsForRating(rating: Rating): readonly string[] {
  return REASONS[rating];
}

/** True when every reason was one actually offered for that rating. Guards the write path. */
export function reasonsAreValid(rating: Rating, reasons: string[]): boolean {
  const allowed = new Set(REASONS[rating]);
  return reasons.every((reason) => allowed.has(reason));
}

/**
 * The fit signal a rating's reasons imply, for the product page's fit meter.
 *
 * The shopper is not asked a separate sizing question — a review flow that asks twice is
 * a review flow people abandon. Instead the sizing reasons carry it: tapping "Ran small"
 * is the fit answer. Anything without a sizing reason is treated as true to size, which
 * is what the overwhelming majority of reviews say anyway.
 */
export function fitFromReasons(reasons: string[]): SubmittedReview["fit"] {
  if (reasons.some((r) => r === "Ran small" || r === "Slightly off on fit")) {
    return "runs-small";
  }
  if (reasons.some((r) => r === "Ran large")) return "runs-large";
  return "true-to-size";
}

/** A rating-appropriate heading for a review that carries only tapped reasons. */
function fallbackTitle(rating: Rating): string {
  if (rating >= 4) return "Happy with this";
  if (rating === 3) return "It was okay";
  return "Not what I hoped for";
}

/**
 * Project a stored review into the display shape the product page renders.
 *
 * Both kinds of review — seeded editorial and real customer — flow through one `Review`
 * list and one card, so the storefront needs no branch for "was this typed or tapped".
 * A submitted review can carry no free text at all, so the title falls back to the first
 * reason and the body is composed from the reasons when the shopper wrote nothing.
 */
export function submittedToDisplayReview(review: SubmittedReview): Review {
  const title = review.reasons[0] ?? fallbackTitle(review.rating);
  const body =
    review.body.trim() ||
    (review.reasons.length > 0 ? `${review.reasons.join(" · ")}.` : "");

  return {
    id: review.id,
    author: review.author,
    date: review.createdAt.slice(0, 10),
    rating: review.rating,
    title,
    body,
    // A submitted review only exists for a delivered order the writer placed.
    verified: true,
    fit: review.fit,
  };
}
