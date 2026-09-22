"use server";

import { revalidatePath } from "next/cache";
import type { Rating } from "@/lib/review-reasons";
import { currentCustomer } from "@/server/customer-session";
import {
  listPendingReviewItems,
  submitReview,
  type PendingReviewItem,
} from "@/server/repositories/reviews";

/**
 * Customer review actions.
 *
 * The one write path for a shopper's own review, and the read the post-delivery prompt
 * uses to decide whether it has anything to ask about. Both resolve the account from the
 * session rather than trusting a customer id from the client — a review is attributed to
 * whoever is signed in, and nobody can submit one as someone else.
 */

export type SubmitReviewState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; error: string };

/**
 * The pieces the signed-in shopper still owes a review on.
 *
 * Empty for a guest, and empty for a customer with nothing delivered-and-unreviewed —
 * which is the signal the prompt uses to stay closed.
 */
export async function pendingReviews(): Promise<PendingReviewItem[]> {
  const customer = await currentCustomer();
  if (!customer) return [];
  return listPendingReviewItems(customer.id);
}

/**
 * Submit a review for a product.
 *
 * `useActionState`-shaped, so the form can render the error inline and the success state
 * can advance the prompt to its next pending item. The heavy lifting — entitlement, the
 * rating range, that every reason was one actually offered — is in `submitReview`; this
 * only binds the session identity to the request and revalidates what the new review
 * changes.
 */
export async function submitReviewAction(
  _previous: SubmitReviewState,
  formData: FormData,
): Promise<SubmitReviewState> {
  const customer = await currentCustomer();
  if (!customer) {
    return { status: "error", error: "Please sign in to leave a review." };
  }

  const productSlug = String(formData.get("productSlug") ?? "").trim();
  const rating = Number(formData.get("rating")) as Rating;
  const body = String(formData.get("body") ?? "");
  // Reasons arrive as repeated form fields, one per tapped chip.
  const reasons = formData
    .getAll("reasons")
    .map((value) => String(value))
    .filter(Boolean);

  if (!productSlug) {
    return { status: "error", error: "That is not a valid selection." };
  }

  const result = await submitReview({
    customerId: customer.id,
    author: customer.name,
    productSlug,
    rating,
    reasons,
    body,
  });

  if (!result.ok) {
    return { status: "error", error: result.error };
  }

  // The review shows on the product page and in the admin moderation list.
  revalidatePath(`/product/${productSlug}`);
  revalidatePath("/admin/reviews");

  return { status: "success" };
}
