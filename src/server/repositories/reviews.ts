import { randomUUID } from "node:crypto";
import type { SubmittedReview } from "@/lib/types";
import {
  fitFromReasons,
  OTHER_REASON,
  reasonsForRating,
  type Rating,
} from "@/lib/review-reasons";
import { callRpc, db, unwrap } from "../supabase";
import type { SubmittedReviewRow } from "../database.types";
import { listOrdersForCustomer } from "./orders";

/**
 * Customer reviews.
 *
 * A row exists only for a verified purchase: it is created from a delivered order the
 * reviewing account placed, and that check lives in `submitReview` rather than being
 * trusted from the client.
 *
 * One review per account per product — enforced by the `unique (customer_id,
 * product_slug)` constraint on `submitted_reviews` (see
 * `supabase/migrations/00000000000001_schema.sql`) and the race-safe
 * `submit_review_once` RPC (see `00000000000003_functions.sql`), which is
 * what the JSON store's serialised `mutateStore` queue used to guarantee for
 * free.
 */

function fromRow(row: SubmittedReviewRow): SubmittedReview {
  return {
    id: row.id,
    productSlug: row.product_slug,
    customerId: row.customer_id,
    orderId: row.order_id,
    author: row.author,
    rating: row.rating as 1 | 2 | 3 | 4 | 5,
    fit: row.fit,
    reasons: row.reasons,
    body: row.body,
    createdAt: row.created_at,
  };
}

export interface PendingReviewItem {
  productSlug: string;
  productName: string;
  colorName: string;
  orderId: string;
  deliveredAt: string;
}

/** Product slugs a customer has already reviewed. */
async function reviewedSlugs(customerId: string): Promise<Set<string>> {
  const rows = unwrap(
    await db()
      .from("submitted_reviews")
      .select("product_slug")
      .eq("customer_id", customerId)
      .overrideTypes<Array<Pick<SubmittedReviewRow, "product_slug">>, { merge: false }>(),
  );
  return new Set(rows.map((row) => row.product_slug));
}

/**
 * The products this customer can still review.
 *
 * Every distinct product across their delivered orders, minus the ones they have already
 * reviewed. Deduplicated by slug — buying two colourways of the same coat is one review,
 * not two — keeping the earliest delivered order as the one that entitles it, so the
 * "verified purchase" it produces points at a real delivery.
 *
 * Built on `listOrders()` (an in-memory filter over every order) rather than
 * a scoped query, mirroring the JSON store's own approach — `Order` has no
 * `customerId` index worth adding for what is, in practice, one customer
 * paging their own account, not an admin-scale query.
 */
export async function listPendingReviewItems(
  customerId: string,
): Promise<PendingReviewItem[]> {
  const reviewed = await reviewedSlugs(customerId);
  const bySlug = new Map<string, PendingReviewItem>();
  // This customer's orders only. It used to be `listOrders()` — the whole order book,
  // with every line and note — filtered in memory, on every page view of every
  // signed-in shopper.
  const orders = await listOrdersForCustomer(customerId);

  for (const order of orders) {
    if (order.status !== "delivered") continue;
    const deliveredAt = order.deliveredAt ?? order.placedAt;

    for (const line of order.lines) {
      if (reviewed.has(line.slug)) continue;

      const existing = bySlug.get(line.slug);
      if (!existing || deliveredAt < existing.deliveredAt) {
        bySlug.set(line.slug, {
          productSlug: line.slug,
          productName: line.name,
          colorName: line.colorName,
          orderId: order.id,
          deliveredAt,
        });
      }
    }
  }

  return [...bySlug.values()].sort((a, b) => a.deliveredAt.localeCompare(b.deliveredAt));
}

/** Published reviews for one product, newest first. Hidden filtering is the caller's job. */
export async function listSubmittedReviewsForProduct(
  productSlug: string,
): Promise<SubmittedReview[]> {
  const rows = unwrap(
    await db()
      .from("submitted_reviews")
      .select("*")
      .eq("product_slug", productSlug)
      .order("created_at", { ascending: false })
      .overrideTypes<SubmittedReviewRow[], { merge: false }>(),
  );
  return rows.map(fromRow);
}

/** Every submitted review, newest first. For the admin moderation list. */
export async function listAllSubmittedReviews(): Promise<SubmittedReview[]> {
  const rows = unwrap(
    await db()
      .from("submitted_reviews")
      .select("*")
      .order("created_at", { ascending: false })
      .overrideTypes<SubmittedReviewRow[], { merge: false }>(),
  );
  return rows.map(fromRow);
}

export interface SubmitReviewInput {
  productSlug: string;
  customerId: string;
  /** Display name snapshotted onto the review. */
  author: string;
  rating: Rating;
  reasons: string[];
  body: string;
}

export type SubmitReviewResult =
  | { ok: true; review: SubmittedReview }
  | { ok: false; error: string };

function reasonsAreValid(rating: Rating, reasons: string[]): boolean {
  const offered = new Set([...reasonsForRating(rating), OTHER_REASON]);
  return reasons.every((reason) => offered.has(reason));
}

/**
 * Record a review.
 *
 * The trust boundary for reviews. The client sends a rating, some tapped reasons and
 * optional prose; this function proves the account is entitled to review the product at
 * all, that the rating is in range, and that every reason was one actually offered for
 * that rating. A crafted request that asserts a five-star reason on a one-star review, or
 * reviews a product the account never had delivered, is rejected rather than stored.
 */
export async function submitReview(input: SubmitReviewInput): Promise<SubmitReviewResult> {
  const rating = input.rating;
  if (![1, 2, 3, 4, 5].includes(rating)) {
    return { ok: false, error: "Choose a rating from one to five stars." };
  }

  const reasons = input.reasons.map((reason) => reason.trim()).filter(Boolean);
  if (!reasonsAreValid(rating, reasons)) {
    return { ok: false, error: "That is not a valid selection." };
  }

  const body = input.body.trim().slice(0, 2000);
  if (reasons.length === 0 && body.length === 0) {
    return {
      ok: false,
      error: "Pick a reason or write a few words before submitting.",
    };
  }

  // Entitlement: a delivered order for this account containing this product.
  const pending = await listPendingReviewItems(input.customerId);
  const entitlement = pending.find((item) => item.productSlug === input.productSlug);
  if (!entitlement) {
    return {
      ok: false,
      error: "You can only review a piece from an order that has been delivered.",
    };
  }

  const { data, error } = await callRpc(db(), "submit_review_once", {
    p_id: `rev_${randomUUID().slice(0, 12)}`,
    p_product_slug: input.productSlug,
    p_customer_id: input.customerId,
    p_order_id: entitlement.orderId,
    p_author: input.author.trim() || "Verified buyer",
    p_rating: rating,
    p_fit: fitFromReasons(reasons),
    p_reasons: reasons,
    p_body: body,
  });

  if (error) throw new Error(error.message);
  if (!data) {
    // submit_review_once() always returns a row — either the one just
    // inserted, or (on the losing side of a race against a concurrent
    // submission for the same customer+product) the one that won. A null
    // here means the RPC itself is broken, not a normal outcome.
    throw new Error("Could not record the review.");
  }

  return { ok: true, review: fromRow(data) };
}
