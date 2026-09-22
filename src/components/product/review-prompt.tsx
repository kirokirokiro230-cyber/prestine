"use client";

import { useCallback, useEffect, useState } from "react";
import { pendingReviews } from "@/app/actions/reviews";
import { ReviewForm } from "@/components/product/review-form";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useBrowserStore, useIsHydrated } from "@/hooks/use-store";
import { reviewPromptSnoozeStore } from "@/lib/stores";
import type { PendingReviewItem } from "@/server/repositories/reviews";

/**
 * The "how was it?" prompt.
 *
 * Mounted once in the storefront chrome. On a visit it asks the server whether the
 * signed-in shopper has anything delivered-and-unreviewed; if so, it opens a dialog for
 * the first item and steps through the rest as each is reviewed. A guest, or a customer
 * with nothing to say, gets nothing — the check returns an empty list and the dialog
 * never mounts.
 *
 * "Not now" snoozes the whole prompt for a few days rather than dismissing one item, so a
 * shopper who is not in the mood is not asked again on the next page. The server remains
 * the authority on *what* is owed; this only paces *when* to ask.
 */

const SNOOZE_DAYS = 3;

export function ReviewPrompt() {
  const hydrated = useIsHydrated();
  const [snoozeUntil, setSnoozeUntil] = useBrowserStore(reviewPromptSnoozeStore);

  const [items, setItems] = useState<PendingReviewItem[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Wait for hydration so the snooze read is the real localStorage value. There is no
    // separate "checked" state here: setting one synchronously would rerender, run this
    // effect's cleanup and discard the pending server result before it can open the modal.
    // React may replay the effect once in development; the cleanup cancels that first
    // result and the replay starts a fresh authoritative check.
    if (!hydrated || Date.now() < snoozeUntil) return;

    let cancelled = false;
    pendingReviews()
      .then((pending) => {
        if (cancelled || pending.length === 0) return;
        setItems(pending);
        setOpen(true);
      })
      .catch((error) => {
        // The prompt remains non-blocking for shoppers, but leave a useful diagnostic for
        // development instead of making a failed eligibility check completely invisible.
        console.error("[reviews] could not check pending reviews:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [hydrated, snoozeUntil]);

  const current = items[0];

  const advance = useCallback(() => {
    setItems((rest) => {
      const next = rest.slice(1);
      if (next.length === 0) setOpen(false);
      return next;
    });
  }, []);

  const snooze = useCallback(() => {
    setSnoozeUntil(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000);
    setOpen(false);
  }, [setSnoozeUntil]);

  if (!current) return null;

  const remaining = items.length - 1;

  return (
    <Modal
      open={open}
      onClose={snooze}
      title="How was your order?"
      description={
        remaining > 0
          ? `You have ${remaining + 1} pieces to review.`
          : "Your feedback helps other shoppers."
      }
      size="md"
      footer={
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-content-subtle">
            Only shown for delivered orders.
          </p>
          <Button variant="ghost" size="sm" onClick={snooze}>
            Not now
          </Button>
        </div>
      }
    >
      {/*
        Keyed by slug so moving to the next item remounts the form — the star picker and
        chip selection reset cleanly rather than carrying the previous piece's answers.
      */}
      <ReviewForm
        key={current.productSlug}
        productSlug={current.productSlug}
        productName={current.productName}
        onSuccess={advance}
      />
    </Modal>
  );
}
