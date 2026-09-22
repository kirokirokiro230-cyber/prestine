import type { Metadata } from "next";
import { AccountShell } from "@/components/account/account-shell";
import { ReviewsHub } from "@/components/account/reviews-hub";
import { requireCustomer } from "@/server/customer-session";
import { listPendingReviewItems } from "@/server/repositories/reviews";

export const metadata: Metadata = {
  title: "Write a review",
  description: "Review the pieces you have bought, whenever you are ready.",
  robots: { index: false, follow: false },
};

/**
 * A standing place to write a review.
 *
 * The post-delivery popup (`ReviewPrompt`, mounted in the storefront layout) is the
 * *nudge* — it opens once, on its own schedule, and can be snoozed. This page is the
 * fallback for everyone that nudge misses: a shopper who dismissed it, who wants to
 * review something from months ago, or who simply prefers to do it here rather than in
 * a dialog that appeared uninvited. Both read from the same `listPendingReviewItems`, so
 * neither can disagree with the other about what is still owed.
 *
 * Requires a signed-in account, unlike the rest of `/account/orders`: a review is
 * attributed to a customer id, not to a guest's claim ticket, so there is no page to
 * show without one.
 */
export default async function ReviewsPage() {
  const customer = await requireCustomer("/account/reviews");
  const pending = await listPendingReviewItems(customer.id);

  return (
    <AccountShell
      title="Write a review"
      description="Every piece you have received and not yet reviewed, in one place. Come back any time — nothing here expires."
    >
      <ReviewsHub items={pending} />
    </AccountShell>
  );
}
