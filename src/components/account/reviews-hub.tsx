"use client";

import { useState } from "react";
import { Star } from "@phosphor-icons/react";
import { ReviewForm } from "@/components/product/review-form";
import { Modal } from "@/components/ui/modal";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/format";
import type { PendingReviewItem } from "@/server/repositories/reviews";

/**
 * Every piece a signed-in shopper can review, on demand.
 *
 * Unlike `ReviewPrompt` (the storefront-wide popup), nothing here times out, snoozes or
 * disappears after one visit — it is a page, so it is exactly as available as any other
 * account screen. Submitting one review removes just that item from the list, in place,
 * so a shopper working through several pieces never loses their spot to a full reload.
 */
export function ReviewsHub({ items }: { items: PendingReviewItem[] }) {
  const [pending, setPending] = useState(items);
  const [open, setOpen] = useState<PendingReviewItem | null>(null);

  const dismiss = (productSlug: string) => {
    setPending((current) => current.filter((item) => item.productSlug !== productSlug));
    setOpen(null);
  };

  if (pending.length === 0) {
    return (
      <EmptyState
        icon={<Star size={22} aria-hidden />}
        title="Nothing waiting on you"
        description="Every piece you have received has either been reviewed or is still on its way. Once an order is marked delivered, it will appear here."
      >
        <ButtonLink href="/account/orders" size="md">
          View your orders
        </ButtonLink>
      </EmptyState>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-3">
        {pending.map((item) => (
          <li
            key={item.productSlug}
            className="flex flex-wrap items-center justify-between gap-4 border border-line bg-surface p-5"
          >
            <div className="min-w-0">
              <h2 className="font-sans text-sm font-medium">{item.productName}</h2>
              <p className="mt-1 text-xs text-content-muted">
                {item.colorName} · Delivered {formatDate(item.deliveredAt, "short")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(item)}
              className="inline-flex shrink-0 items-center gap-1.5 border border-line-strong px-4 py-2 text-2xs uppercase tracking-[0.1em] text-content transition-colors hover:bg-inverse hover:text-on-inverse"
            >
              <Star size={13} aria-hidden />
              Write a review
            </button>
          </li>
        ))}
      </ul>

      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        title="Write a review"
        size="md"
      >
        {open ? (
          <ReviewForm
            key={open.productSlug}
            productSlug={open.productSlug}
            productName={open.productName}
            onSuccess={() => dismiss(open.productSlug)}
          />
        ) : null}
      </Modal>
    </>
  );
}
