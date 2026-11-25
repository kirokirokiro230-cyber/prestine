import { promoCodes, site } from "./config";
import { firstOrderAmount } from "./first-order";
import type {
  CartLine,
  OrderSummary,
  PaymentMethod,
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
  /** Whether cash on delivery is offered at all. */
  codEnabled: boolean;
  /** Minor units added to a COD order. Zero means the merchant absorbs it. */
  codFee: number;
  /** Minor units. Zero means no floor. */
  codMinOrder: number;
  /** Minor units. Zero means no ceiling. */
  codMaxOrder: number;
  /**
   * Percentage off a customer's first order. Zero means the offer is off.
   *
   * This is the OFFER. Whether a particular customer still has it to use is a separate
   * question the server answers (`first_order_discount_status`), and is passed to
   * `orderSummary` as `firstOrder`.
   */
  firstOrderPercent: number;
}

/**
 * Seed rules from `config.ts`.
 *
 * Used by the browser only. It can be a snapshot because it drives display, and
 * anything it gets wrong is corrected by the server before money moves.
 *
 * COD defaults to unavailable here. The browser learns the real answer from the
 * live rules the cart provider is given, and defaulting to "off" means a
 * mis-wired page offers fewer options rather than offering one the server will
 * then refuse.
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
  codEnabled: false,
  codFee: 0,
  codMinOrder: 0,
  codMaxOrder: 0,
  firstOrderPercent: 0,
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
  /**
   * Which method the total is being quoted for. Defaults to prepaid, so every
   * existing caller keeps its current behaviour and no COD fee appears until a
   * shopper actually chooses COD.
   */
  paymentMethod?: PaymentMethod;
  /**
   * The customer is eligible for the first-order discount. Decided by the server, never
   * inferred here: eligibility depends on order history, which this file cannot see. The
   * browser passes what the server last told it; `placeOrder` passes what the database says
   * at the moment of ordering.
   */
  firstOrder?: boolean;
}

/**
 * Totals plus what was applied, if anything.
 *
 * At most one of `promo` and `firstOrder` is set: the first-order discount does not stack
 * with a promotion code, and the larger of the two applies.
 */
export type ResolvedOrderSummary = OrderSummary & {
  promo?: PromoCode;
  firstOrder?: { percent: number };
};

/** The single source of truth for order totals. */
export function orderSummary({
  lines,
  promoCode,
  chargeTax = true,
  rules = defaultPricingRules,
  paymentMethod = "prepaid",
  firstOrder = false,
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

  /*
   * One discount, the better one. Stacking would let a 25% code and the first-order
   * discount combine into a margin nobody chose, and picking the larger means a customer is
   * never worse off for having a code. On a tie the code wins, which leaves the
   * single-use first-order discount unspent for their next order.
   */
  let firstOrderApplied: { percent: number } | undefined;
  if (firstOrder && rules.firstOrderPercent > 0) {
    const offered = firstOrderAmount(subtotal, rules.firstOrderPercent);

    if (offered > discount) {
      discount = offered;
      promo = undefined;
      firstOrderApplied = { percent: rules.firstOrderPercent };
    }
  }

  const discounted = Math.max(0, subtotal - discount);
  const shipping = lines.length === 0 ? 0 : shippingCost(discounted, rules);
  const tax = chargeTax ? Math.round(discounted * rules.taxRate) : 0;

  /*
   * Added after tax and not included in the tax base, matching how shipping is
   * already treated here. It is a handling charge on the payment method, not on
   * the goods.
   */
  const codFee =
    paymentMethod === "cod" && lines.length > 0 ? Math.max(0, rules.codFee) : 0;

  return {
    subtotal,
    discount,
    shipping,
    tax,
    codFee,
    total: discounted + shipping + tax + codFee,
    promo,
    firstOrder: firstOrderApplied,
  };
}

/**
 * Whether COD may be offered for a given basket, on the merchant's own rules.
 *
 * Pincode serviceability is a separate question answered by Delhivery and
 * checked server-side in `placeOrder` — this covers only what the shop decides.
 * Shared so the checkout UI and the server reach the same verdict rather than
 * each implementing the thresholds.
 */
export function codAvailability(
  subtotalAfterDiscount: number,
  rules: PricingRules = defaultPricingRules,
): { available: boolean; reason?: string } {
  if (!rules.codEnabled) {
    return { available: false, reason: "Cash on delivery is not available." };
  }

  const money = (minor: number) =>
    (minor / 100).toLocaleString(rules.locale, {
      style: "currency",
      currency: rules.currency,
      maximumFractionDigits: 0,
    });

  if (rules.codMinOrder > 0 && subtotalAfterDiscount < rules.codMinOrder) {
    return {
      available: false,
      reason: `Cash on delivery needs an order of ${money(rules.codMinOrder)} or more.`,
    };
  }

  // Zero means no ceiling. A cap exists because the cost of a refused COD
  // parcel scales with its value.
  if (rules.codMaxOrder > 0 && subtotalAfterDiscount > rules.codMaxOrder) {
    return {
      available: false,
      reason: `Cash on delivery is not available above ${money(rules.codMaxOrder)}.`,
    };
  }

  return { available: true };
}

/** Stable identity for a variant in the cart. */
export function cartLineId(productId: string, colorId: string, size: string): string {
  return `${productId}:${colorId}:${size}`;
}
