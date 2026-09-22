import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { SubmittedReview } from "@/lib/types";
import {
  fitFromReasons,
  OTHER_REASON,
  reasonsForRating,
  type Rating,
} from "@/lib/review-reasons";
import { getDb, isDatabaseConfigured } from "../db/client";
import { fromSubmittedReview, toSubmittedReview } from "../db/mappers";
import { orders as ordersTable, orderLines, submittedReviews } from "../db/schema";
import { mutateStore, readStore } from "../store";

/**
 * Customer reviews.
 *
 * A row exists only for a verified purchase: it is created from a delivered order the
 * reviewing account placed, and that check lives in `submitReview` rather than being
 * trusted from the client.
 *
 * One review per account per product. A shopper who buys the same piece twice does not
 * get to review it twice.
 *
 * Two backends, chosen by whether a database is configured — see `login-attempts.ts`
 * for the precedent.
 */

export interface PendingReviewItem {
  productSlug: string;
  productName: string;
  colorName: string;
  orderId: string;
  deliveredAt: string;
}

/** Product slugs a customer has already reviewed. */
async function reviewedSlugs(customerId: string): Promise<Set<string>> {
  if (!isDatabaseConfigured()) {
    const store = await readStore();
    const set = new Set<string>();
    for (const review of store.submittedReviews) {
      if (review.customerId === customerId) set.add(review.productSlug);
    }
    return set;
  }

  const rows = await getDb()
    .select({ productSlug: submittedReviews.productSlug })
    .from(submittedReviews)
    .where(eq(submittedReviews.customerId, customerId));
  return new Set(rows.map((row) => row.productSlug));
}

/**
 * The products this customer can still review.
 *
 * Every distinct product across their delivered orders, minus the ones they have already
 * reviewed. Deduplicated by slug — buying two colourways of the same coat is one review,
 * not two — keeping the earliest delivered order as the one that entitles it, so the
 * "verified purchase" it produces points at a real delivery.
 */
export async function listPendingReviewItems(
  customerId: string,
): Promise<PendingReviewItem[]> {
  const reviewed = await reviewedSlugs(customerId);
  const bySlug = new Map<string, PendingReviewItem>();

  if (!isDatabaseConfigured()) {
    const store = await readStore();

    for (const order of store.orders) {
      if (order.customerId !== customerId) continue;
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

  const db = getDb();
  const deliveredOrders = await db
    .select({
      id: ordersTable.id,
      deliveredAt: ordersTable.deliveredAt,
      placedAt: ordersTable.placedAt,
    })
    .from(ordersTable)
    .where(and(eq(ordersTable.customerId, customerId), eq(ordersTable.status, "delivered")));

  if (deliveredOrders.length === 0) return [];

  const lines = await db.select().from(orderLines);

  for (const order of deliveredOrders) {
    const deliveredAt = (order.deliveredAt ?? order.placedAt).toISOString();

    for (const line of lines.filter((l) => l.orderId === order.id)) {
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
  if (!isDatabaseConfigured()) {
    const store = await readStore();
    return store.submittedReviews
      .filter((review) => review.productSlug === productSlug)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const rows = await getDb()
    .select()
    .from(submittedReviews)
    .where(eq(submittedReviews.productSlug, productSlug));
  return rows.map(toSubmittedReview).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Every submitted review, newest first. For the admin moderation list. */
export async function listAllSubmittedReviews(): Promise<SubmittedReview[]> {
  if (!isDatabaseConfigured()) {
    const store = await readStore();
    return [...store.submittedReviews].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const rows = await getDb().select().from(submittedReviews);
  return rows.map(toSubmittedReview).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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

  const review: SubmittedReview = {
    id: `rev_${randomUUID().slice(0, 12)}`,
    productSlug: input.productSlug,
    customerId: input.customerId,
    orderId: entitlement.orderId,
    author: input.author.trim() || "Verified buyer",
    rating,
    fit: fitFromReasons(reasons),
    reasons,
    body,
    createdAt: new Date().toISOString(),
  };

  if (!isDatabaseConfigured()) {
    await mutateStore((store) => {
      /*
       * Guard the one-per-account-per-product rule inside the serialised mutation, so
       * two concurrent submissions cannot both pass the entitlement check above and
       * write two rows. The reasoning mirrors the OTP attempt counter.
       */
      const already = store.submittedReviews.some(
        (existing) =>
          existing.customerId === review.customerId &&
          existing.productSlug === review.productSlug,
      );
      if (!already) store.submittedReviews.unshift(review);
    });

    return { ok: true, review };
  }

  const db = getDb();
  await db.transaction(async (tx) => {
    /*
     * Guard the one-per-account-per-product rule inside the transaction, so two
     * concurrent submissions cannot both pass the entitlement check above and write
     * two rows. The reasoning mirrors the OTP attempt counter and the JSON-store branch
     * above.
     */
    const [existing] = await tx
      .select({ id: submittedReviews.id })
      .from(submittedReviews)
      .where(
        and(
          eq(submittedReviews.customerId, review.customerId),
          eq(submittedReviews.productSlug, review.productSlug),
        ),
      );

    if (!existing) {
      await tx.insert(submittedReviews).values(fromSubmittedReview(review));
    }
  });

  return { ok: true, review };
}
