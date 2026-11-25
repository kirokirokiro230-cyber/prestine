import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  listPendingReviewItems,
  listSubmittedReviewsForProduct,
  submitReview,
} from "@/server/repositories/reviews";
import { createCustomer } from "@/server/customers";
import { createOrder } from "@/server/repositories/orders";
import { createProduct, setProductStatus } from "@/server/repositories/products";
import { db } from "@/server/supabase";
import type { Order } from "@/lib/types";
import { checkSupabaseDatabase, testRunTag } from "./supabase-test-helpers";

/**
 * The review repository, exercised against a real Supabase project.
 *
 * Integration test — see `supabase-test-helpers.ts`. What matters here is the
 * trust boundary: a review can only exist for a delivered order the reviewing
 * account placed, the same piece cannot be reviewed twice (`submit_review_once`'s
 * `on conflict` — see `supabase/migrations/00000000000003_functions.sql`), and a
 * crafted request that asserts a reason never offered for its rating is rejected
 * rather than stored.
 *
 * There is no seeded catalogue any more (this store is built from a fresh
 * migration, not from demo data), so — unlike the JSON-store version of this
 * file — the product these tests review is created here, not assumed to exist.
 */

const { configured, reason } = checkSupabaseDatabase();
const tag = testRunTag();

const createdOrderIds: string[] = [];
const createdCustomerIds: string[] = [];
let productSlug: string;
let productId: string;

describe.skipIf(!configured)("reviews", () => {
  if (!configured) {
    it.skip(reason, () => {});
    return;
  }

  let CUSTOMER: string;
  let OTHER_CUSTOMER: string;

  beforeEach(async () => {
    // submitted_reviews.customer_id is a hard foreign key into customers (see
    // supabase/migrations/00000000000001_schema.sql), so a review test needs a
    // real row there, not just a string used as an id.
    const customer = await createCustomer({
      phone: `+9199${tag.padEnd(8, "0").slice(0, 8)}`,
      name: "Ada Lovelace",
      passwordHash: "x",
      passwordSalt: "y",
      phoneVerifiedAt: new Date().toISOString(),
    });
    createdCustomerIds.push(customer.id);
    CUSTOMER = customer.id;

    const other = await createCustomer({
      phone: `+9198${tag.padEnd(8, "0").slice(0, 8)}`,
      name: "Someone Else",
      passwordHash: "x",
      passwordSalt: "y",
      phoneVerifiedAt: new Date().toISOString(),
    });
    createdCustomerIds.push(other.id);
    OTHER_CUSTOMER = other.id;

    const product = await createProduct({
      slug: `test-review-piece-${tag}`,
      name: `Test Review Piece ${tag}`,
      tagline: "A test piece.",
      department: "unisex",
      category: "knitwear",
      collections: [],
      price: 12000,
      sizeSystem: "alpha",
      colors: [{ id: "bone", name: "Bone", hex: "#EFEAE0" }],
      sizes: [{ label: "M" }],
      description: "Test description.",
      details: [],
      composition: "100% test",
      care: [],
      fitNote: "True to size.",
      origin: "Made in a test.",
      releasedAt: new Date().toISOString(),
      popularity: 1,
    } as Parameters<typeof createProduct>[0]);
    await setProductStatus([product.id], "active");
    productSlug = product.slug;
    productId = product.id;
  });

  /** Seed one order for the test customer, at a chosen status. */
  async function seedOrder(
    overrides: Partial<Order> & { id: string; status: Order["status"] },
  ): Promise<Order> {
    const order = await createOrder({
      placedAt: "2026-01-01T00:00:00.000Z",
      customerId: CUSTOMER,
      email: "buyer@example.com",
      paymentStatus: "pending",
      lines: [
        {
          productId,
          slug: productSlug,
          name: `Test Review Piece ${tag}`,
          colorId: "bone",
          colorName: "Bone",
          colorHex: "#EFEAE0",
          size: "M",
          quantity: 1,
          unitPrice: 12000,
          category: "knitwear",
        },
      ],
      totals: { subtotal: 12000, discount: 0, shipping: 0, tax: 0, total: 12000 },
      shippingAddress: {
        name: "Ada Lovelace",
        line1: "1 Test Street",
        city: "London",
        region: "England",
        phone: "+447700900123",
      },
      ...overrides,
    } as Order);
    createdOrderIds.push(order.id);
    return order;
  }

  describe("pending review items", () => {
    it("offers a delivered order's pieces", async () => {
      await seedOrder({ id: `PR-REV-${tag}-1`, status: "delivered", deliveredAt: "2026-01-10T00:00:00.000Z" });

      const pending = await listPendingReviewItems(CUSTOMER);
      expect(pending.map((item) => item.productSlug)).toEqual([productSlug]);
    });

    it("ignores orders that have not been delivered", async () => {
      await seedOrder({ id: `PR-REV-${tag}-2`, status: "shipped" });

      expect(await listPendingReviewItems(CUSTOMER)).toEqual([]);
    });

    it("ignores another customer's delivered order", async () => {
      await seedOrder({
        id: `PR-REV-${tag}-3`,
        status: "delivered",
        customerId: OTHER_CUSTOMER,
        deliveredAt: "2026-01-10T00:00:00.000Z",
      });

      expect(await listPendingReviewItems(CUSTOMER)).toEqual([]);
    });
  });

  describe("submitting a review", () => {
    it("records a review for a delivered piece and clears it from the pending list", async () => {
      const order = await seedOrder({
        id: `PR-REV-${tag}-4`,
        status: "delivered",
        deliveredAt: "2026-01-10T00:00:00.000Z",
      });

      const result = await submitReview({
        customerId: CUSTOMER,
        author: "Ada L.",
        productSlug,
        rating: 5,
        reasons: ["Excellent quality", "True to size"],
        body: "",
      });

      expect(result.ok).toBe(true);

      const stored = await listSubmittedReviewsForProduct(productSlug);
      expect(stored).toHaveLength(1);
      expect(stored[0].rating).toBe(5);
      expect(stored[0].orderId).toBe(order.id);

      // Reviewed, so it is no longer offered.
      expect(await listPendingReviewItems(CUSTOMER)).toEqual([]);
    });

    it("derives runs-small from a sizing reason", async () => {
      await seedOrder({ id: `PR-REV-${tag}-5`, status: "delivered", deliveredAt: "2026-01-10T00:00:00.000Z" });

      await submitReview({
        customerId: CUSTOMER,
        author: "Ada L.",
        productSlug,
        rating: 3,
        reasons: ["Ran small"],
        body: "",
      });

      const [review] = await listSubmittedReviewsForProduct(productSlug);
      expect(review.fit).toBe("runs-small");
    });

    it("refuses a product the customer never had delivered", async () => {
      await seedOrder({ id: `PR-REV-${tag}-6`, status: "delivered", deliveredAt: "2026-01-10T00:00:00.000Z" });

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
      await seedOrder({ id: `PR-REV-${tag}-7`, status: "delivered", deliveredAt: "2026-01-10T00:00:00.000Z" });

      const result = await submitReview({
        customerId: CUSTOMER,
        author: "Ada L.",
        productSlug,
        rating: 1,
        // "Excellent quality" is a five-star reason, not a one-star one.
        reasons: ["Excellent quality"],
        body: "",
      });

      expect(result.ok).toBe(false);
    });

    it("refuses an empty review with neither reason nor prose", async () => {
      await seedOrder({ id: `PR-REV-${tag}-8`, status: "delivered", deliveredAt: "2026-01-10T00:00:00.000Z" });

      const result = await submitReview({
        customerId: CUSTOMER,
        author: "Ada L.",
        productSlug,
        rating: 4,
        reasons: [],
        body: "   ",
      });

      expect(result.ok).toBe(false);
    });

    it("does not let the same piece be reviewed twice", async () => {
      await seedOrder({ id: `PR-REV-${tag}-9`, status: "delivered", deliveredAt: "2026-01-10T00:00:00.000Z" });

      const first = await submitReview({
        customerId: CUSTOMER,
        author: "Ada L.",
        productSlug,
        rating: 5,
        reasons: ["Excellent quality"],
        body: "",
      });
      expect(first.ok).toBe(true);

      const second = await submitReview({
        customerId: CUSTOMER,
        author: "Ada L.",
        productSlug,
        rating: 1,
        reasons: ["Very poor quality"],
        body: "",
      });
      expect(second.ok).toBe(false);

      expect(await listSubmittedReviewsForProduct(productSlug)).toHaveLength(1);
    });
  });

  afterAll(async () => {
    /*
     * submitted_reviews cascades from BOTH orders and customers (`on delete
     * cascade` on each FK — see supabase/migrations/00000000000001_schema.sql),
     * so deleting the orders first and the customers after removes every review
     * this file wrote without needing to delete submitted_reviews directly.
     */
    if (createdOrderIds.length > 0) {
      await db().from("orders").delete().in("id", createdOrderIds);
    }
    if (createdCustomerIds.length > 0) {
      await db().from("customers").delete().in("id", createdCustomerIds);
    }
    await db().from("products").delete().eq("slug", `test-review-piece-${tag}`);
  });
});
