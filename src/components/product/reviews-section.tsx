"use client";

import { useMemo, useState } from "react";
import { CheckCircle, Star } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Rating } from "@/components/ui/rating";
import { formatDate } from "@/lib/format";
import type { Review } from "@/lib/types";
import { cn } from "@/lib/utils";

type ReviewSort = "recent" | "highest" | "lowest";

const PAGE = 4;

const FIT_LABELS: Array<{ fit: Review["fit"]; label: string }> = [
  { fit: "runs-small", label: "Runs small" },
  { fit: "true-to-size", label: "True to size" },
  { fit: "runs-large", label: "Runs large" },
];

/**
 * Reviews block: aggregate summary, fit meter, star filter, and a paged list.
 *
 * The fit meter is the part shoppers actually use on a clothing site — it answers
 * "should I size up?" without reading twenty reviews.
 *
 * Reviews arrive as a prop from the server rather than being looked up here, and
 * the two distributions are derived locally, so none of the review-generation
 * module reaches the client bundle.
 */
export function ReviewsSection({
  reviews,
  rating,
}: {
  reviews: Review[];
  rating: number;
}) {
  const [starFilter, setStarFilter] = useState<number | null>(null);
  const [sort, setSort] = useState<ReviewSort>("recent");
  const [visible, setVisible] = useState(PAGE);

  const breakdown = useMemo(() => {
    const total = reviews.length || 1;
    return [5, 4, 3, 2, 1].map((stars) => {
      const count = reviews.filter((review) => review.rating === stars).length;
      return { stars, count, percent: Math.round((count / total) * 100) };
    });
  }, [reviews]);

  const fits = useMemo(() => {
    const total = reviews.length || 1;
    return FIT_LABELS.map(({ fit, label }) => ({
      fit,
      label,
      percent: Math.round(
        (reviews.filter((review) => review.fit === fit).length / total) * 100,
      ),
    }));
  }, [reviews]);

  const filtered = useMemo(() => {
    const list = starFilter
      ? reviews.filter((r) => r.rating === starFilter)
      : [...reviews];

    switch (sort) {
      case "highest":
        return list.sort((a, b) => b.rating - a.rating || (a.date < b.date ? 1 : -1));
      case "lowest":
        return list.sort((a, b) => a.rating - b.rating || (a.date < b.date ? 1 : -1));
      default:
        return list.sort((a, b) => (a.date < b.date ? 1 : -1));
    }
  }, [reviews, sort, starFilter]);

  const shown = filtered.slice(0, visible);

  return (
    <section id="reviews" className="scroll-mt-28">
      <div className="grid gap-10 lg:grid-cols-[20rem_1fr] lg:gap-16">
        {/* Summary */}
        <div className="lg:sticky lg:top-28 lg:self-start">
          <h2 className="text-2xl leading-tight sm:text-3xl">Reviews</h2>

          <div className="mt-5 flex items-end gap-4">
            <p data-numeric className="font-display text-5xl leading-none">
              {rating.toFixed(1)}
            </p>
            <div className="pb-1">
              <Rating value={rating} size={15} hideCount />
              <p data-numeric className="mt-1.5 text-xs text-content-muted">
                {reviews.length} verified reviews
              </p>
            </div>
          </div>

          {/* Histogram — each row filters the list */}
          <ul className="mt-6 flex flex-col gap-1.5">
            {breakdown.map((row) => {
              const active = starFilter === row.stars;
              return (
                <li key={row.stars}>
                  <button
                    type="button"
                    onClick={() => {
                      setStarFilter(active ? null : row.stars);
                      setVisible(PAGE);
                    }}
                    aria-pressed={active}
                    className="flex w-full items-center gap-3 py-1 text-left"
                  >
                    <span className="flex w-10 shrink-0 items-center gap-1 text-xs text-content-muted">
                      {row.stars}
                      <Star size={10} weight="fill" aria-hidden />
                    </span>

                    <span
                      aria-hidden
                      className="h-1.5 flex-1 overflow-hidden bg-surface-sunken"
                    >
                      <span
                        className={cn(
                          "block h-full transition-colors",
                          active ? "bg-accent" : "bg-ink-300 dark:bg-ink-600",
                        )}
                        style={{ width: `${row.percent}%` }}
                      />
                    </span>

                    <span
                      data-numeric
                      className={cn(
                        "w-8 shrink-0 text-right text-xs",
                        active ? "text-content" : "text-content-subtle",
                      )}
                    >
                      {row.count}
                    </span>
                    <span className="sr-only">
                      {row.stars} star reviews: {row.count} ({row.percent}%). Select to
                      filter.
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Fit meter */}
          <div className="mt-8 border-t border-line pt-6">
            <h3 className="eyebrow mb-4">How it fits</h3>
            <div aria-hidden className="flex h-1.5 overflow-hidden bg-surface-sunken">
              {fits.map((fit) => (
                <span
                  key={fit.fit}
                  className={cn(
                    fit.fit === "true-to-size" ? "bg-success-500" : "bg-ink-300 dark:bg-ink-600",
                  )}
                  style={{ width: `${fit.percent}%` }}
                />
              ))}
            </div>
            <ul className="mt-3 flex flex-col gap-1.5">
              {fits.map((fit) => (
                <li key={fit.fit} className="flex justify-between text-xs">
                  <span className="text-content-muted">{fit.label}</span>
                  <span data-numeric className="text-content">
                    {fit.percent}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* List */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
            <p data-numeric className="text-xs text-content-muted" aria-live="polite">
              Showing {shown.length} of {filtered.length}
              {starFilter ? ` ${starFilter}-star` : ""} reviews
            </p>

            <div className="flex items-center gap-2">
              <label htmlFor="review-sort" className="sr-only">
                Sort reviews
              </label>
              <select
                id="review-sort"
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value as ReviewSort);
                  setVisible(PAGE);
                }}
                className="h-10 cursor-pointer border border-line-strong bg-surface px-3 text-xs text-content focus:border-accent focus:outline-none"
              >
                <option value="recent">Most recent</option>
                <option value="highest">Highest rated</option>
                <option value="lowest">Lowest rated</option>
              </select>

              {starFilter ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStarFilter(null);
                    setVisible(PAGE);
                  }}
                >
                  Clear filter
                </Button>
              ) : null}
            </div>
          </div>

          {shown.length === 0 ? (
            <p className="py-12 text-sm text-content-muted">
              No {starFilter}-star reviews yet.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {shown.map((review) => (
                <ReviewCard key={review.id} review={review} />
              ))}
            </ul>
          )}

          {visible < filtered.length ? (
            <div className="pt-8">
              <Button
                variant="outline"
                size="md"
                onClick={() => setVisible((v) => v + PAGE)}
              >
                Show {Math.min(PAGE, filtered.length - visible)} more reviews
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ReviewCard({ review }: { review: Review }) {
  return (
    <li className="py-7 first:pt-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Rating value={review.rating} size={12} hideCount />
        <h3 className="font-sans text-sm font-medium text-content">{review.title}</h3>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-content-muted">{review.body}</p>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-content-subtle">
        <span className="text-content-muted">{review.author}</span>

        {review.verified ? (
          <span className="inline-flex items-center gap-1 text-success-700 dark:text-success-500">
            <CheckCircle size={12} weight="fill" aria-hidden />
            Verified purchase
          </span>
        ) : null}

        <span>{formatDate(review.date, "short")}</span>

        {review.sizePurchased ? <span>Bought size {review.sizePurchased}</span> : null}
        {review.height ? <span>Height {review.height}</span> : null}
      </div>
    </li>
  );
}
