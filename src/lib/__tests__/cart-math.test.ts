import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  applyPromo,
  defaultPricingRules,
  cartLineId,
  freeShippingShortfall,
  itemCount,
  merchandiseSubtotal,
  orderSummary,
  savingsFromMarkdowns,
  shippingCost,
} from "@/lib/cart-math";
import { site } from "@/lib/config";
import type { CartLine } from "@/lib/types";

const line = (overrides: Partial<CartLine> = {}): CartLine => ({
  id: "p-001:camel:M",
  productId: "p-001",
  slug: "atelier-double-faced-overcoat",
  name: "Atelier Double-Faced Overcoat",
  colorId: "camel",
  colorName: "Camel",
  colorHex: "#B08D63",
  size: "M",
  unitPrice: 10000,
  quantity: 1,
  category: "outerwear",
  ...overrides,
});

describe("cart totals", () => {
  it("multiplies unit price by quantity", () => {
    assert.equal(merchandiseSubtotal([line({ quantity: 3 })]), 30000);
  });

  it("sums across lines", () => {
    const lines = [line({ quantity: 2 }), line({ id: "b", unitPrice: 2550, quantity: 1 })];
    assert.equal(merchandiseSubtotal(lines), 22550);
    assert.equal(itemCount(lines), 3);
  });

  it("reports markdown savings only when compare-at is higher", () => {
    assert.equal(
      savingsFromMarkdowns([line({ unitPrice: 8000, compareAtPrice: 10000, quantity: 2 })]),
      4000,
    );
    // A compare-at below the selling price is bad data and must not create a credit.
    assert.equal(
      savingsFromMarkdowns([line({ unitPrice: 10000, compareAtPrice: 8000 })]),
      0,
    );
  });

  it("builds a stable variant id", () => {
    assert.equal(cartLineId("p-001", "camel", "M"), "p-001:camel:M");
  });
});

describe("promotion codes", () => {
  it("applies a percentage discount", () => {
    const result = applyPromo("WELCOME10", 20000);
    assert.ok(result.ok);
    assert.equal(result.discount, 2000);
  });

  it("is case and whitespace insensitive", () => {
    const result = applyPromo("  welcome10 ", 20000);
    assert.ok(result.ok);
  });

  it("rejects an unknown code", () => {
    const result = applyPromo("NOPE", 20000);
    assert.equal(result.ok, false);
  });

  it("enforces the minimum spend", () => {
    const below = applyPromo("ATELIER25", 30000);
    assert.equal(below.ok, false);

    const above = applyPromo("ATELIER25", 40000);
    assert.ok(above.ok);
    assert.equal(above.discount, 10000);
  });

  it("never discounts more than the subtotal", () => {
    // STUDIO50 is a flat $50 off; on a $250 subtotal it must not exceed it.
    const result = applyPromo("STUDIO50", 25000);
    assert.ok(result.ok);
    assert.ok(result.discount <= 25000);
  });
});

describe("shipping", () => {
  it("is complimentary above the threshold", () => {
    assert.equal(shippingCost(site.freeShippingThreshold), 0);
  });

  it("is charged below the threshold", () => {
    assert.equal(shippingCost(site.freeShippingThreshold - 1), 900);
  });

  it("is complimentary exactly at the threshold, not just above it", () => {
    // The boundary is the part a merchant will be asked about.
    assert.equal(shippingCost(site.freeShippingThreshold), 0);
    assert.equal(shippingCost(site.freeShippingThreshold - 1), 900);
  });

  it("reports the shortfall to free shipping", () => {
    assert.equal(freeShippingShortfall(site.freeShippingThreshold), 0);
    assert.equal(freeShippingShortfall(0), site.freeShippingThreshold);
  });
});

describe("order summary", () => {
  it("adds up to the displayed total", () => {
    const summary = orderSummary({
      lines: [line({ unitPrice: 30000, quantity: 1 })],
      promoCode: "WELCOME10",
    });

    assert.equal(summary.subtotal, 30000);
    assert.equal(summary.discount, 3000);
    // 27000 after the discount, which is above the threshold — so complimentary.
    assert.equal(summary.shipping, 0);
    assert.equal(summary.tax, Math.round(27000 * site.taxRate));
    // The invariant that matters: the lines shown must reconcile to the total.
    assert.equal(
      summary.total,
      summary.subtotal - summary.discount + summary.shipping + summary.tax,
    );
  });

  it("charges no shipping on an empty bag", () => {
    const summary = orderSummary({ lines: [] });
    assert.equal(summary.total, 0);
    assert.equal(summary.shipping, 0);
  });

  it("defers tax until asked to charge it", () => {
    const summary = orderSummary({ lines: [line()], chargeTax: false });
    assert.equal(summary.tax, 0);
  });

  it("ignores an invalid promo code rather than throwing", () => {
    const summary = orderSummary({ lines: [line()], promoCode: "NOT-A-CODE" });
    assert.equal(summary.discount, 0);
    assert.equal(summary.promo, undefined);
  });

  it("produces integer minor units only", () => {
    // 7% of an odd subtotal would be fractional if rounding were missed.
    const summary = orderSummary({ lines: [line({ unitPrice: 3333, quantity: 3 })] });
    for (const value of Object.values(summary)) {
      if (typeof value === "number") assert.ok(Number.isInteger(value), `${value} is not an integer`);
    }
  });
});

describe("the first-order discount", () => {
  const rules = { ...defaultPricingRules, firstOrderPercent: 10, taxRate: 0, freeShippingThreshold: 0 };
  const basket = [line({ unitPrice: 100_000, quantity: 1 })];

  it("takes the percentage off when the customer is eligible", () => {
    const summary = orderSummary({ lines: basket, rules, firstOrder: true });

    assert.equal(summary.discount, 10_000);
    assert.equal(summary.total, 90_000);
    assert.deepEqual(summary.firstOrder, { percent: 10 });
    assert.equal(summary.promo, undefined);
  });

  it("does nothing unless the server says the customer is eligible", () => {
    const summary = orderSummary({ lines: basket, rules });

    assert.equal(summary.discount, 0);
    assert.equal(summary.firstOrder, undefined);
  });

  it("does nothing when the offer is switched off, even for an eligible customer", () => {
    const summary = orderSummary({
      lines: basket,
      rules: { ...rules, firstOrderPercent: 0 },
      firstOrder: true,
    });

    assert.equal(summary.discount, 0);
    assert.equal(summary.firstOrder, undefined);
  });

  it("does not stack with a code: the larger applies", () => {
    const bigger = orderSummary({
      lines: basket,
      rules: { ...rules, promoCodes: [{ code: "BIG", percentOff: 25, description: "" }] },
      promoCode: "BIG",
      firstOrder: true,
    });
    assert.equal(bigger.discount, 25_000);
    assert.equal(bigger.promo?.code, "BIG");
    assert.equal(bigger.firstOrder, undefined);

    const smaller = orderSummary({
      lines: basket,
      rules: { ...rules, promoCodes: [{ code: "SMALL", percentOff: 5, description: "" }] },
      promoCode: "SMALL",
      firstOrder: true,
    });
    assert.equal(smaller.discount, 10_000);
    assert.equal(smaller.promo, undefined);
    assert.deepEqual(smaller.firstOrder, { percent: 10 });
  });

  it("leaves the single-use discount unspent on a tie, so the code is used first", () => {
    const tie = orderSummary({
      lines: basket,
      rules: { ...rules, promoCodes: [{ code: "TEN", percentOff: 10, description: "" }] },
      promoCode: "TEN",
      firstOrder: true,
    });

    assert.equal(tie.promo?.code, "TEN");
    assert.equal(tie.firstOrder, undefined);
  });

  it("is worked out before tax and shipping, so the total adds up", () => {
    const summary = orderSummary({
      lines: basket,
      rules: { ...rules, taxRate: 0.18, freeShippingThreshold: 1_000_000, standardShippingRate: 9_900 },
      firstOrder: true,
    });

    assert.equal(summary.discount, 10_000);
    assert.equal(summary.tax, 16_200);
    assert.equal(summary.shipping, 9_900);
    assert.equal(summary.total, 90_000 + 16_200 + 9_900);
  });
});
