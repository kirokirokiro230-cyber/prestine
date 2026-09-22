import { promoCodes, site } from "./config";
import type {
  CartLine,
  OrderSummary,
  PromoCode,
} from "./types";

/**
 * Order maths. Kept pure and framework-free so the same functions run in the
 * cart drawer, the cart page, checkout and on the server.
 *
 * Rounding rule: discount and tax are rounded to whole minor units once, at the
 * point they are calculated, so the displayed lines always add up to the
 * displayed total.
 *
 * Every function takes an optional `PricingRules`. Client components omit it and
 * get the compile-time values from `config.ts`, which keeps the cart instant with
 * no server round trip. `placeOrder` passes the live rules read from the store, so
 * the amount actually charged is computed from settings a merchant controls — and
 * from one implementation, not two that can drift apart.
 */

/**
 * Most units of one size allowed in a single order.
 *
 * Lives here because all three places that need it must agree: the cart stepper, the
 * quantity clamp when a line is edited, and the server's own check in `placeOrder`. It
 * is not an inventory limit — the shop does not track stock — it is what stops one
 * order asking for four hundred of the same jumper.
 *
 * The browser copy is a convenience. The server enforces it regardless.
 */
export const MAX_LINE_QUANTITY = 10;

export interface PricingRules {
  /** Fractional, e.g. 0.08 for 8%. */
  taxRate: number;
  /** Minor units. At or above this, standard shipping is free. */
  freeShippingThreshold: number;
  /** Minor units charged for shipping below the threshold. */
  standardShippingRate: number;
  /**
   * The delivery promise in business days, carried here so client components can state
   * it without a second round trip. Display only — nothing prices off it.
   */
  deliveryDaysMin: number;
  deliveryDaysMax: number;
  promoCodes: PromoCode[];
  locale: string;
  currency: string;
}

/**
 * Seed rules from `config.ts`.
 *
 * Used by the browser only. It can be a snapshot because it drives display, and
 * anything it gets wrong is corrected by the server before money moves.
 */
export const defaultPricingRules: PricingRules = {
  taxRate: site.taxRate,
  freeShippingThreshold: site.freeShippingThreshold,
  standardShippingRate: 900,
  deliveryDaysMin: 3,
  deliveryDaysMax: 5,
  promoCodes,
  locale: site.locale,
  currency: site.currency,
};

export function lineSubtotal(line: CartLine): number {
  return line.unitPrice * line.quantity;
}

export function merchandiseSubtotal(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + lineSubtotal(line), 0);
}

export function itemCount(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

/** Total the shopper saved against compare-at prices, before promo codes. */
export function savingsFromMarkdowns(lines: CartLine[]): number {
  return lines.reduce((sum, line) => {
    if (!line.compareAtPrice || line.compareAtPrice <= line.unitPrice) return sum;
    return sum + (line.compareAtPrice - line.unitPrice) * line.quantity;
  }, 0);
}

export function findPromoCode(
  code: string,
  rules: PricingRules = defaultPricingRules,
): PromoCode | undefined {
  const normalised = code.trim().toUpperCase();
  return rules.promoCodes.find((p) => p.code === normalised);
}

export type PromoResult =
  | { ok: true; promo: PromoCode; discount: number }
  | { ok: false; reason: string };

/** Validate a promo code against the current subtotal. */
export function applyPromo(
  code: string,
  subtotal: number,
  rules: PricingRules = defaultPricingRules,
): PromoResult {
  const promo = findPromoCode(code, rules);
  if (!promo) {
    return { ok: false, reason: "That code isn’t recognised. Check for typos." };
  }
  if (promo.minSubtotal && subtotal < promo.minSubtotal) {
    const shortfall = promo.minSubtotal - subtotal;
    return {
      ok: false,
      reason: `Spend ${(shortfall / 100).toLocaleString(rules.locale, {
        style: "currency",
        currency: rules.currency,
        maximumFractionDigits: 0,
      })} more to use this code.`,
    };
  }

  const discount = promo.percentOff
    ? Math.round((subtotal * promo.percentOff) / 100)
    : Math.min(promo.amountOff ?? 0, subtotal);

  return { ok: true, promo, discount };
}

/**
 * What shipping costs.
 *
 * One shipping option, so there is no method to pass. The shopper does not choose how a
 * parcel travels — that is the merchant's arrangement with the courier — they are told
 * how long it takes. Complimentary at or above the threshold, the flat rate below it.
 */
export function shippingCost(
  subtotalAfterDiscount: number,
  rules: PricingRules = defaultPricingRules,
): number {
  return subtotalAfterDiscount >= rules.freeShippingThreshold
    ? 0
    : rules.standardShippingRate;
}

/** How much more the shopper needs to spend to unlock free standard shipping. */
export function freeShippingShortfall(
  subtotal: number,
  rules: PricingRules = defaultPricingRules,
): number {
  return Math.max(0, rules.freeShippingThreshold - subtotal);
}

export function freeShippingProgress(
  subtotal: number,
  rules: PricingRules = defaultPricingRules,
): number {
  if (rules.freeShippingThreshold <= 0) return 1;
  return Math.min(1, subtotal / rules.freeShippingThreshold);
}

export interface SummaryInput {
  lines: CartLine[];
  promoCode?: string | null;
  /** Set false before an address is entered, so tax reads as "calculated at next step". */
  chargeTax?: boolean;
  /** Live rules from the store. Omit in the browser to use the seeded values. */
  rules?: PricingRules;
}

/** Totals plus the promotion that was actually applied, if any. */
export type ResolvedOrderSummary = OrderSummary & { promo?: PromoCode };

/** The single source of truth for order totals. */
export function orderSummary({
  lines,
  promoCode,
  chargeTax = true,
  rules = defaultPricingRules,
}: SummaryInput): ResolvedOrderSummary {
  const subtotal = merchandiseSubtotal(lines);

  let discount = 0;
  let promo: PromoCode | undefined;
  if (promoCode) {
    const result = applyPromo(promoCode, subtotal, rules);
    if (result.ok) {
      discount = result.discount;
      promo = result.promo;
    }
  }

  const discounted = Math.max(0, subtotal - discount);
  const shipping = lines.length === 0 ? 0 : shippingCost(discounted, rules);
  const tax = chargeTax ? Math.round(discounted * rules.taxRate) : 0;

  return {
    subtotal,
    discount,
    shipping,
    tax,
    total: discounted + shipping + tax,
    promo,
  };
}

/** Stable identity for a variant in the cart. */
export function cartLineId(productId: string, colorId: string, size: string): string {
  return `${productId}:${colorId}:${size}`;
}
