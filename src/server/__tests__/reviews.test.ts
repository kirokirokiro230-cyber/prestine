import { rmSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Order } from "@/lib/types";
import {
  listPendingReviewItems,
  listSubmittedReviewsForProduct,
  submitReview,
} from "@/server/repositories/reviews";
import { mutateStore, resetStoreCache } from "@/server/store";

/**
 * The review repository, exercised against a scratch store.
 *
 * What matters here is the trust boundary: a review can only exist for a delivered order
 * the reviewing account placed, the same piece cannot be reviewed twice, and a crafted
 * request that asserts a reason never offered for its rating is rejected rather than
 * stored. The eligibility list and the write path both have to agree on those rules, so
 * they are tested together.
 */

beforeAll(() => {
  process.env.PRESTINE_STORE_PATH = ".test-store/reviews.json";
});

beforeEach(async () => {
  rmSync(".test-store/reviews.json", { force: true });
  resetStoreCache();
  // Start from a store with no orders and no reviews, so counts are unambiguous.
  await mutateStore((store) => {
    store.orders = [];
    store.submittedReviews = [];
  });
});

const CUSTOMER = "cust_review_1";

/** Seed one order for the test customer, at a chosen status. */
async function seedOrder(
  overrides: Partial<Order> & { id: string; status: Order["status"] },
): Promise<void> {
  await mutateStore((store) => {
    store.orders.unshift({
      placedAt: "2026-01-01T00:00:00.000Z",
      customerId: CUSTOMER,
      email: "buyer@example.com",
      lines: [
        {
          slug: "merino-crew",
          name: "Merino Crew",
          colorName: "Bone",
          colorHex: "#EFEAE0",
          size: "M",
          quantity: 1,
          unitPrice: 12000,
          category: "knitwear",
        },
      ],
      totals: {
        subtotal: 12000,
        discount: 0,
        shipping: 0,
        tax: 0,
        total: 12000,
      },
      shippingAddress: {
        name: "Ada Lovelace",
        line1: "1 Test Street",
        city: "London",
        region: "England",
        phone: "+447700900123",
      },
      ...overrides,
    } as Order);
  });
}

describe("pending review items", () => {
  it("offers a delivered order's pieces", async () => {
    await seedOrder({ id: "PR-1", status: "delivered", deliveredAt: "2026-01-10T00:00:00.000Z" });

    const pending = await listPendingReviewItems(CUSTOMER);
    expect(pending.map((item) => item.productSlug)).toEqual(["merino-crew"]);
  });

  it("ignores orders that have not been delivered", async () => {
    await seedOrder({ id: "PR-2", status: "shipped" });

    expect(await listPendingReviewItems(CUSTOMER)).toEqual([]);
  });

  it("ignores another customer's delivered order", async () => {
    await seedOrder({
      id: "PR-3",
      status: "delivered",
      customerId: "someone_else",
      deliveredAt: "2026-01-10T00:00:00.000Z",
    });

    expect(await listPendingReviewItems(CUSTOMER)).toEqual([]);
  });
});

describe("submitting a review", () => {
  it("records a review for a delivered piece and clears it from the pending list", async () => {
    await seedOrder({ id: "PR-4", status: "delivered", deliveredAt: "2026-01-10T00:00:00.000Z" });

    const result = await submitReview({
      customerId: CUSTOMER,
      author: "Ada L.",
      productSlug: "merino-crew",
      rating: 5,
      reasons: ["Excellent quality", "True to size"],
      body: "",
    });

    expect(result.ok).toBe(true);

    const stored = await listSubmittedReviewsForProduct("merino-crew");
    expect(stored).toHaveLength(1);
    expect(stored[0].rating).toBe(5);
    expect(stored[0].orderId).toBe("PR-4");

    // Reviewed, so it is no longer offered.
    expect(await listPendingReviewItems(CUSTOMER)).toEqual([]);
  });

  it("derives runs-small from a sizing reason", async () => {
    await seedOrder({ id: "PR-5", status: "delivered", deliveredAt: "2026-01-10T00:00:00.000Z" });

    await submitReview({
      customerId: CUSTOMER,
      author: "Ada L.",
      productSlug: "merino-crew",
      rating: 3,
      reasons: ["Ran small"],
      body: "",
    });

    const [review] = await listSubmittedReviewsForProduct("merino-crew");
    expect(review.fit).toBe("runs-small");
  });

  it("refuses a product the customer never had delivered", async () => {
    await seedOrder({ id: "PR-6", status: "delivered", deliveredAt: "2026-01-10T00:00:00.000Z" });

    const result = await submitReview({
      customerId: CUSTOMER,
      author: "Ada L.",
      productSlug: "a-piece-never-bought",
      rating: 5,
      reasons: ["Excellent quality"],
      body: "",
    });

    expect(result.ok).toBe(false);
  });

  it("refuses a reason that was never offered for the rating", async () => {
    await seedOrder({ id: "PR-7", status: "delivered", deliveredAt: "2026-01-10T00:00:00.000Z" });

    const result = await submitReview({
      customerId: CUSTOMER,
      author: "Ada L.",
      productSlug: "merino-crew",
      rating: 1,
      // "Excellent quality" is a five-star reason, not a one-star one.
      reasons: ["Excellent quality"],
      body: "",
    });

    expect(result.ok).toBe(false);
  });

  it("refuses an empty review with neither reason nor prose", async () => {
    await seedOrder({ id: "PR-8", status: "delivered", deliveredAt: "2026-01-10T00:00:00.000Z" });

    const result = await submitReview({
      customerId: CUSTOMER,
      author: "Ada L.",
      productSlug: "merino-crew",
      rating: 4,
      reasons: [],
      body: "   ",
    });

    expect(result.ok).toBe(false);
  });

  it("does not let the same piece be reviewed twice", async () => {
    await seedOrder({ id: "PR-9", status: "delivered", deliveredAt: "2026-01-10T00:00:00.000Z" });

    const first = await submitReview({
      customerId: CUSTOMER,
      author: "Ada L.",
      productSlug: "merino-crew",
      rating: 5,
      reasons: ["Excellent quality"],
      body: "",
    });
    expect(first.ok).toBe(true);

    const second = await submitReview({
      customerId: CUSTOMER,
      author: "Ada L.",
      productSlug: "merino-crew",
      rating: 1,
      reasons: ["Very poor quality"],
      body: "",
    });
    expect(second.ok).toBe(false);

    expect(await listSubmittedReviewsForProduct("merino-crew")).toHaveLength(1);
  });
});
