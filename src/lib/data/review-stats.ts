import type { Review } from "../types";

/**
 * Deterministic review *statistics*, with none of the review prose.
 *
 * The catalogue imports this module to compute each product's star average, so it
 * has to stay tiny. The long-form review copy lives in `reviews.ts`, which only
 * the product page pulls in — that split is what keeps thousands of characters of
 * review text out of every listing page's payload.
 *
 * Both modules consume the same seeded sequence, so the rating on a product card
 * can never disagree with the reviews listed on the product page.
 */

/** xmur3 string hash → 32-bit seed. */
function hashSeed(input: string): number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i += 1) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, deterministic PRNG. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One review's numeric shape. The `pick*` fields are raw 0–1 draws; the consumer
 * turns them into indices against whatever pool it holds.
 */
export interface ReviewRoll {
  rating: Review["rating"];
  pickCopy: number;
  pickAuthor: number;
  pickFit: number;
  pickHeight: number;
  pickSize: number;
  verified: boolean;
  /** Days back from the catalogue reference date. */
  dayOffset: number;
}

export function rollReviews(slug: string, count: number): ReviewRoll[] {
  const next = rng(hashSeed(slug));
  const rolls: ReviewRoll[] = [];

  for (let i = 0; i < count; i += 1) {
    const distribution = next();
    // Weighted to mirror a real distribution on a premium catalogue: mostly
    // fives, a meaningful band of fours, a few threes.
    const rating: Review["rating"] = distribution > 0.34 ? 5 : distribution > 0.06 ? 4 : 3;

    rolls.push({
      rating,
      pickCopy: next(),
      dayOffset: Math.floor(next() * 24) + i * 11,
      pickAuthor: next(),
      verified: next() > 0.12,
      pickFit: next(),
      pickHeight: next(),
      pickSize: next(),
    });
  }

  return rolls;
}

/** Mean rating, rounded to one decimal. */
export function averageOf(rolls: ReviewRoll[]): number {
  if (rolls.length === 0) return 0;
  const sum = rolls.reduce((total, roll) => total + roll.rating, 0);
  return Math.round((sum / rolls.length) * 10) / 10;
}
