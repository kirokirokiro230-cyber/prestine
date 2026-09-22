"use client";

import { useActionState, useEffect, useState } from "react";
import { Star } from "@phosphor-icons/react";
import {
  submitReviewAction,
  type SubmitReviewState,
} from "@/app/actions/reviews";
import { OTHER_REASON, reasonsForRating, type Rating } from "@/lib/review-reasons";
import { SubmitButton, FormFeedback } from "@/components/ui/form-primitives";
import { cn } from "@/lib/utils";

/**
 * The rating-first review form.
 *
 * Nothing is asked until a star count is chosen — the reasons that appear are the ones
 * that fit that score, so a five-star review is offered praise and a two-star one is
 * offered the honest complaints. Reasons are tapped, not typed; "Other" reveals a text
 * box for anyone who wants to say more. That is the whole point of the flow: a review
 * most people can finish in two taps, with prose available to the few who want it.
 *
 * Submits through `submitReviewAction`, which re-checks everything server-side — the
 * rating range, that each reason was one actually offered, and that the account is
 * entitled to review the product at all. This component's job is only to make the
 * common answer fast.
 */
export function ReviewForm({
  productSlug,
  productName,
  onSuccess,
}: {
  productSlug: string;
  productName: string;
  /** Called once the review is recorded, so a host can advance to the next item. */
  onSuccess?: () => void;
}) {
  const [state, action] = useActionState<SubmitReviewState, FormData>(
    submitReviewAction,
    { status: "idle" },
  );

  const [rating, setRating] = useState<Rating | 0>(0);
  const [hovered, setHovered] = useState<Rating | 0>(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [wantsOther, setWantsOther] = useState(false);

  useEffect(() => {
    if (state.status === "success") onSuccess?.();
  }, [state.status, onSuccess]);

  const toggle = (reason: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(reason)) next.delete(reason);
      else next.add(reason);
      return next;
    });
  };

  // Changing the rating changes which reasons are on offer, so reset them in the
  // interaction that changes the rating rather than in an effect after the render. A
  // selection made under the old rating must never ride along as an invalid choice.
  const chooseRating = (value: Rating) => {
    if (value !== rating) {
      setSelected(new Set());
      setWantsOther(false);
    }
    setRating(value);
  };

  const shownStars = hovered || rating;
  const reasons = rating ? reasonsForRating(rating) : [];

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="productSlug" value={productSlug} />
      <input type="hidden" name="rating" value={rating || ""} />
      {[...selected].map((reason) => (
        <input key={reason} type="hidden" name="reasons" value={reason} />
      ))}

      <FormFeedback
        error={state.status === "error" ? state.error : undefined}
        success={
          state.status === "success" ? "Thank you — your review is posted." : undefined
        }
      />

      {/* Star picker */}
      <div>
        <p className="text-sm text-content-muted">
          How was the <span className="text-content">{productName}</span>?
        </p>
        <div
          className="mt-3 flex items-center gap-1.5"
          role="radiogroup"
          aria-label="Rating"
          onMouseLeave={() => setHovered(0)}
        >
          {([1, 2, 3, 4, 5] as const).map((value) => {
            const filled = value <= shownStars;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={rating === value}
                aria-label={`${value} star${value === 1 ? "" : "s"}`}
                onClick={() => chooseRating(value)}
                onMouseEnter={() => setHovered(value)}
                onFocus={() => setHovered(value)}
                onBlur={() => setHovered(0)}
                className="p-1 transition-transform hover:scale-110"
              >
                <Star
                  size={30}
                  weight={filled ? "fill" : "regular"}
                  className={filled ? "text-clay-500 dark:text-clay-300" : "text-ink-300 dark:text-ink-600"}
                  aria-hidden
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Reason chips — only once a rating is chosen */}
      {rating ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm text-content-muted">
            What stood out? Tap all that apply.
          </legend>
          <div className="flex flex-wrap gap-2">
            {reasons.map((reason) => {
              const active = selected.has(reason);
              return (
                <button
                  key={reason}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggle(reason)}
                  className={cn(
                    "border px-3 py-2 text-sm transition-colors",
                    active
                      ? "border-line-strong bg-inverse text-on-inverse"
                      : "border-line text-content-muted hover:border-line-strong hover:text-content",
                  )}
                >
                  {reason}
                </button>
              );
            })}

            <button
              type="button"
              aria-pressed={wantsOther}
              onClick={() => setWantsOther((value) => !value)}
              className={cn(
                "border px-3 py-2 text-sm transition-colors",
                wantsOther
                  ? "border-line-strong bg-inverse text-on-inverse"
                  : "border-line text-content-muted hover:border-line-strong hover:text-content",
              )}
            >
              {OTHER_REASON}…
            </button>
          </div>

          {wantsOther ? (
            <textarea
              name="body"
              rows={4}
              maxLength={2000}
              autoFocus
              placeholder="Tell other shoppers what you thought."
              className="mt-1 w-full resize-y border border-line bg-surface px-3 py-2 text-sm text-content outline-none focus:border-line-strong"
            />
          ) : null}
        </fieldset>
      ) : null}

      <SubmitButton pendingLabel="Posting…" disabled={rating === 0}>
        Post review
      </SubmitButton>
    </form>
  );
}
