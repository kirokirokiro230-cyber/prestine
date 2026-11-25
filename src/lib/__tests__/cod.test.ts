import { describe, expect, it } from "vitest";
import {
  codAvailability,
  defaultPricingRules,
  orderSummary,
  type PricingRules,
} from "../cart-math";
import type { CartLine } from "../types";

/**
 * Cash on delivery maths.
 *
 * `orderSummary` is the single source of truth both the cart and `placeOrder`
 * compute from, so the COD fee has to behave identically in the browser and on
 * the server. These cover the arithmetic; the pincode question is Delhivery's
 * and is checked server-side.
 */

function line(unitPrice: number, quantity = 1): CartLine {
  return {
    id: `l-${unitPrice}-${quantity}`,
    productId: "p-1",
    slug: "merino-crew",
    name: "Merino Crew",
    colorId: "oat",
    colorName: "Oat",
    colorHex: "#ddd",
    size: "M",
    quantity,
    unitPrice,
    category: "knitwear",
  };
}

/** COD on, Rs 40 fee, no thresholds, no free shipping, no tax. */
const rules: PricingRules = {
  ...defaultPricingRules,
  taxRate: 0,
  freeShippingThreshold: 0,
  standardShippingRate: 0,
  promoCodes: [],
  codEnabled: true,
  codFee: 4000,
  codMinOrder: 0,
  codMaxOrder: 0,
};

describe("orderSummary COD fee", () => {
  it("charges nothing extra on a prepaid order", () => {
    const summary = orderSummary({ lines: [line(50000)], rules });
    expect(summary.codFee).toBe(0);
    expect(summary.total).toBe(50000);
  });

  it("defaults to prepaid when no method is given", () => {
    // Every pre-existing caller omits the argument, so the default decides
    // whether they suddenly start quoting a fee.
    expect(orderSummary({ lines: [line(50000)], rules }).codFee).toBe(0);
  });

  it("adds the fee on a COD order", () => {
    const summary = orderSummary({
      lines: [line(50000)],
      rules,
      paymentMethod: "cod",
    });
    expect(summary.codFee).toBe(4000);
    expect(summary.total).toBe(54000);
  });

  it("keeps the parts summing to the total", () => {
    const withTax: PricingRules = { ...rules, taxRate: 0.05, standardShippingRate: 3000 };
    const summary = orderSummary({
      lines: [line(50000), line(12000, 2)],
      rules: withTax,
      paymentMethod: "cod",
    });

    expect(
      summary.subtotal -
        summary.discount +
        summary.shipping +
        summary.tax +
        summary.codFee,
    ).toBe(summary.total);
  });

  /** An empty bag has no order to charge a fee on. */
  it("charges no fee on an empty bag", () => {
    const summary = orderSummary({ lines: [], rules, paymentMethod: "cod" });
    expect(summary.codFee).toBe(0);
    expect(summary.total).toBe(0);
  });

  it("is not added to the tax base", () => {
    const taxed: PricingRules = { ...rules, taxRate: 0.1 };
    const prepaid = orderSummary({ lines: [line(10000)], rules: taxed });
    const cod = orderSummary({
      lines: [line(10000)],
      rules: taxed,
      paymentMethod: "cod",
    });

    // The fee moves the total, never the tax.
    expect(cod.tax).toBe(prepaid.tax);
    expect(cod.total - prepaid.total).toBe(4000);
  });

  it("treats a negative configured fee as zero", () => {
    const broken: PricingRules = { ...rules, codFee: -500 };
    expect(
      orderSummary({ lines: [line(10000)], rules: broken, paymentMethod: "cod" }).codFee,
    ).toBe(0);
  });
});

describe("codAvailability", () => {
  it("refuses when COD is switched off", () => {
    const off: PricingRules = { ...rules, codEnabled: false };
    expect(codAvailability(50000, off).available).toBe(false);
  });

  it("allows an order inside the window", () => {
    expect(codAvailability(50000, rules).available).toBe(true);
  });

  it("refuses below the minimum", () => {
    const floored: PricingRules = { ...rules, codMinOrder: 100000 };
    const verdict = codAvailability(50000, floored);
    expect(verdict.available).toBe(false);
    expect(verdict.reason).toBeTruthy();
  });

  it("allows exactly the minimum", () => {
    const floored: PricingRules = { ...rules, codMinOrder: 50000 };
    expect(codAvailability(50000, floored).available).toBe(true);
  });

  it("refuses above the maximum", () => {
    const capped: PricingRules = { ...rules, codMaxOrder: 40000 };
    expect(codAvailability(50000, capped).available).toBe(false);
  });

  it("allows exactly the maximum", () => {
    const capped: PricingRules = { ...rules, codMaxOrder: 50000 };
    expect(codAvailability(50000, capped).available).toBe(true);
  });

  /** Zero is "no limit", not "limit of nothing". */
  it("treats a zero maximum as no ceiling", () => {
    expect(codAvailability(10_000_000, { ...rules, codMaxOrder: 0 }).available).toBe(true);
  });

  it("treats a zero minimum as no floor", () => {
    expect(codAvailability(1, { ...rules, codMinOrder: 0 }).available).toBe(true);
  });

  it("gives a reason whenever it refuses", () => {
    for (const broken of [
      { ...rules, codEnabled: false },
      { ...rules, codMinOrder: 999999 },
      { ...rules, codMaxOrder: 1 },
    ]) {
      const verdict = codAvailability(50000, broken);
      expect(verdict.available).toBe(false);
      expect(verdict.reason).toBeTruthy();
    }
  });
});
