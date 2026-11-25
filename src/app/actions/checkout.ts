"use server";

import { randomInt } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  MAX_LINE_QUANTITY,
  codAvailability,
  merchandiseSubtotal,
  orderSummary,
  type PricingRules,
} from "@/lib/cart-math";
import type { Address, CartLine, Order, OrderRef, PaymentMethod } from "@/lib/types";
import { address as validateAddress, email as validateEmail } from "@/lib/validation";
import {
  CashfreeApiError,
  cashfreeAmountMatches,
  cashfreeConfig,
  createCashfreeOrder,
  fetchCashfreeOrder,
  terminateCashfreeOrder,
} from "@/server/cashfree";
import { announce } from "@/server/notifications";
import { settleCashfreePayment } from "@/server/payment-settlement";
import { checkPincode } from "@/server/delhivery";
import { afterResponse } from "@/server/email/after-response";
import { dispatchOrderConfirmation } from "@/server/email/dispatch";
import { manifestShipmentForOrder } from "@/server/shipping-service";
import {
  createOrder,
  getOrder,
  setOrderPaymentAttempt,
} from "@/server/repositories/orders";
import { lookupOrder } from "./orders";
import { listActiveProducts } from "@/server/repositories/products";
import {
  getSettings,
  listPromoCodes,
} from "@/server/repositories/settings";
import { currentCustomer } from "@/server/customer-session";
import { LIMITS, consumeIpRateLimit, rateLimitMessage } from "@/server/rate-limit";
import {
  firstOrderUnavailableMessage,
  identityKeys,
  type FirstOrderStatus,
} from "@/lib/first-order";
import { claimFirstOrder, firstOrderStatus, releaseFirstOrder } from "@/server/first-order";

/**
 * Order placement.
 *
 * This is the trust boundary. The browser sends *what* the shopper wants — product
 * id, colour, size, quantity — and nothing about what it costs. Prices, discounts,
 * shipping and tax are all recomputed here from the store, so a tampered request
 * cannot buy a coat for a dollar. The same recomputed total — never anything the
 * browser asserts — is the figure sent to Cashfree.
 *
 * There is no inventory to check. The shop does not track stock, so every line is
 * always fulfillable and an order can never fail for availability — fulfilment is
 * manual, and the same piece can be ordered any number of times.
 *
 * ## Payment
 *
 * This function records the order and opens a Cashfree payment session in the same
 * call, but it does **not** take money itself — Cashfree does, on its own hosted
 * checkout page, after this returns. The order is written with `paymentStatus:
 * "pending"` and stays that way until the Cashfree webhook (or a reconciliation
 * fetch) confirms the payment, at which point `markOrderPaid` flips it and the
 * confirmation email goes out. See `src/app/api/payments/cashfree/webhook/route.ts`.
 *
 * A pending order that is never paid is not cleaned up here. It simply never
 * receives a confirmation email and never becomes visible as "paid" anywhere in
 * admin reporting that cares about revenue — see `paymentStatus` on `Order`.
 */


/** Guards against a request asking for thousands of distinct lines. */
const MAX_LINES = 50;

export interface PlaceOrderItem {
  productId: string;
  colorId: string;
  size: string;
  quantity: number;
}

/*
 * No `shippingMethod`. There is one shipping arrangement, so there is nothing for the
 * client to assert and nothing for the server to validate — which also closes the small
 * hole where a crafted request could name a cheaper method than the one it paid for.
 */
export interface PlaceOrderInput {
  email: string;
  address: Address;
  promoCode?: string | null;
  /** Last four digits of the card, for the receipt. Never the full number. */
  cardLast4?: string;
  items: PlaceOrderItem[];
  /**
   * How the shopper wants to pay. Defaults to prepaid.
   *
   * Unlike the absent `shippingMethod` above, this genuinely is the shopper's
   * choice — so it is accepted, and then re-checked server-side against the
   * merchant's settings, the basket value and Delhivery's per-pincode COD
   * serviceability. A crafted request asking for COD on an ineligible order is
   * refused rather than trusted.
   */
  paymentMethod?: PaymentMethod;
  /**
   * The total the shopper was shown included the first-order discount.
   *
   * Not a request for it, which is ignored: whether the discount applies is decided here,
   * from order history, whatever this says. It is the shopper's consent to the PRICE. If
   * they were shown a discounted total and the server cannot give the discount (they used
   * it in another tab a moment ago, say), charging the higher price anyway would be a
   * surprise at the worst moment, so the order is refused and the page re-quotes.
   */
  expectFirstOrder?: boolean;
}

/**
 * Prepaid orders come back with a Cashfree session to hand to their SDK. A COD
 * order is already final, so it has none — the discriminant is what stops the
 * client reaching for a `paymentSessionId` that was never going to exist.
 */
export type PlaceOrderResult =
  | {
      ok: true;
      paymentMethod: "prepaid";
      orderId: string;
      paymentSessionId: string;
      environment: "sandbox" | "production";
    }
  | { ok: true; paymentMethod: "cod"; orderId: string }
  | { ok: false; error: string };



export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  /* ---- Abuse limit ----------------------------------------------------- */

  /*
   * Every call writes an order row and opens a Cashfree session, so this is
   * bounded per caller. Checked before any validation so a malformed payload
   * cannot be used to probe the catalogue for free, and set generously because
   * locking a real shopper out of checkout costs more than the abuse does.
   */
  const limited = await consumeIpRateLimit("checkout", LIMITS.checkout);
  if (limited) return { ok: false, error: rateLimitMessage(limited) };

  /* ---- Shape and contact validation ----------------------------------- */

  if (!Array.isArray(input?.items) || input.items.length === 0) {
    return { ok: false, error: "Your bag is empty." };
  }
  if (input.items.length > MAX_LINES) {
    return { ok: false, error: "That is too many separate items for one order." };
  }

  const emailError = validateEmail(input.email);
  if (emailError) return { ok: false, error: emailError };

  const addressError = validateAddress(input.address);
  if (addressError) return { ok: false, error: addressError };

  /* ---- Resolve the cart against the live catalogue -------------------- */

  const [products, settings, promoCodes] = await Promise.all([
    listActiveProducts(),
    getSettings(),
    listPromoCodes(),
  ]);

  const lines: CartLine[] = [];
  // Merge duplicate variants so a request cannot slip past the per-line cap by
  // sending the same variant twice.
  const merged = new Map<string, PlaceOrderItem>();

  for (const item of input.items) {
    // Reject rather than round. Flooring 1.5 to 1 quietly charges for something the
    // shopper did not ask for, and a fractional quantity only arrives from a
    // tampered request in the first place.
    const quantity = Number(item?.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      return { ok: false, error: "One of the quantities is not a whole number." };
    }

    const key = `${item.productId}:${item.colorId}:${item.size}`;
    const existing = merged.get(key);
    if (existing) existing.quantity += quantity;
    else merged.set(key, { ...item, quantity });
  }

  for (const item of merged.values()) {
    const product = products.find((entry) => entry.id === item.productId);
    if (!product) {
      return { ok: false, error: "One of the pieces in your bag is no longer available." };
    }

    const color = product.colors.find((entry) => entry.id === item.colorId);
    if (!color) {
      return {
        ok: false,
        error: `That colourway of the ${product.name} is no longer available.`,
      };
    }

    const size = product.sizes.find((entry) => entry.label === item.size);
    if (!size) {
      return { ok: false, error: `Size ${item.size} is no longer offered in the ${product.name}.` };
    }

    if (item.quantity > MAX_LINE_QUANTITY) {
      return {
        ok: false,
        error: `A maximum of ${MAX_LINE_QUANTITY} of any one size can be ordered at a time.`,
      };
    }

    lines.push({
      id: `${product.id}:${color.id}:${size.label}`,
      productId: product.id,
      slug: product.slug,
      name: product.name,
      colorId: color.id,
      colorName: color.name,
      colorHex: color.hex,
      size: size.label,
      // Server-side price. Whatever the browser thought is ignored.
      unitPrice: product.price,
      compareAtPrice: product.compareAtPrice,
      quantity: item.quantity,
      category: product.category,
    });
  }

  /* ---- Recompute the money ------------------------------------------- */

  const rules: PricingRules = {
    taxRate: settings.taxRate,
    freeShippingThreshold: settings.freeShippingThreshold,
    standardShippingRate: settings.standardShippingRate,
    deliveryDaysMin: settings.deliveryDaysMin,
    deliveryDaysMax: settings.deliveryDaysMax,
    promoCodes,
    locale: settings.locale,
    currency: settings.currency,
    codEnabled: settings.codEnabled,
    codFee: settings.codFee,
    codMinOrder: settings.codMinOrder,
    codMaxOrder: settings.codMaxOrder,
    firstOrderPercent: settings.firstOrderDiscountPercent,
  };

  /* ---- The first-order discount --------------------------------------- */

  /*
   * Checkout is gated behind sign-in, so there is normally a customer here — stamping
   * their id is what lets the order be tied back to them for the post-delivery review
   * prompt, rather than relying on an email match that two people can share. Guarded with
   * `?.` so the action still records an order if the session has lapsed between the gate
   * and the submit; the order simply falls back to email-only linkage in that case.
   *
   * The first-order discount needs the account, and is simply not given without one: it
   * is attached to a person, and a lapsed session has none to attach it to.
   */
  const customer = await currentCustomer();

  /*
   * Who this is, for the purpose of "one discount per person". Includes the email and the
   * delivery number typed at checkout as well as the account, so a second account made
   * with the same email or phone is recognised as the same customer.
   */
  const identity = customer
    ? identityKeys({
        customerId: customer.id,
        accountPhone: customer.phone,
        email: input.email,
        shippingPhone: input.address.phone,
      })
    : [];

  let firstOrderState: FirstOrderStatus = { kind: "unavailable" };
  if (customer && rules.firstOrderPercent > 0) {
    firstOrderState = await firstOrderStatus(identity);
  }
  const firstOrderEligible = firstOrderState.kind === "available";

  /* ---- Payment method, re-checked rather than trusted ----------------- */

  const wantsCod = input.paymentMethod === "cod";

  if (wantsCod) {
    /*
     * Thresholds are tested against the discounted merchandise subtotal, the
     * same basis `codAvailability` uses in the browser, so the shopper is never
     * refused for a reason the page did not show them.
     */
    const discounted = Math.max(
      0,
      merchandiseSubtotal(lines) -
        orderSummary({
          lines,
          promoCode: input.promoCode ?? null,
          rules,
          firstOrder: firstOrderEligible,
        }).discount,
    );

    const allowed = codAvailability(discounted, rules);
    if (!allowed.available) {
      return { ok: false, error: allowed.reason ?? "Cash on delivery is not available." };
    }

    /*
     * Delhivery's own answer, which can be no even where the shop allows it.
     * Checked here rather than only in the browser because this is the point
     * where the order becomes real, and a COD order to a prepaid-only pincode
     * cannot be manifested at all.
     *
     * Fails open on an outage: `checkPincode` returns `"unknown"` rather than
     * `false` when it cannot reach Delhivery, and refusing a legitimate order
     * because a courier API was briefly down costs more than accepting one
     * parcel that may need a call to arrange.
     */
    const pincode = input.address.postalCode?.trim();
    if (!pincode) {
      return { ok: false, error: "Enter a PIN code to pay on delivery." };
    }

    const service = await checkPincode(pincode);
    if (service.configured && service.serviceable === true && service.cashOnDelivery === false) {
      return {
        ok: false,
        error:
          "Cash on delivery is not offered at that PIN code. Please pay online to have it delivered there.",
      };
    }
  }

  const paymentMethod: PaymentMethod = wantsCod ? "cod" : "prepaid";

  const summary = orderSummary({
    lines,
    promoCode: input.promoCode ?? null,
    chargeTax: true,
    rules,
    paymentMethod,
    firstOrder: firstOrderEligible,
  });

  /*
   * The shopper was shown a total with the discount in it, and it is not available. Refuse
   * rather than quietly charge more than they agreed to; the page re-quotes on this error.
   */
  if (input.expectFirstOrder && !summary.firstOrder) {
    return {
      ok: false,
      error:
        firstOrderUnavailableMessage(firstOrderState) ??
        "Your first-order discount is no longer available, so your total has changed. Please review it and place the order again.",
    };
  }

  /* ---- Payment must be configured before an order is ever recorded ---- */

  /*
   * Checked before anything is written. Recording an order that can never be paid for
   * — because nobody set up Cashfree — would leave a `pending` row with no way
   * forward, and the shopper would see a confirmation-shaped failure instead of a
   * clear "payment is not available right now".
   */
  const cashfree = cashfreeConfig();
  if (!cashfree && !wantsCod) {
    console.error("[checkout] Cashfree is not configured — refusing to place an order.");
    return {
      ok: false,
      error: "Payment is not available right now. Please try again shortly.",
    };
  }

  /* ---- Record the order, pending payment ------------------------------ */

  const orderId = await nextOrderId();

  /*
   * Claim the first-order discount for this order, before anything is charged or written.
   *
   * The check above was a read. Two checkouts by the same person can both pass it, so the
   * claim is what actually grants the discount: it runs in the database under a lock, and
   * only one of two simultaneous claims can succeed. Done now, before the Cashfree session
   * exists, so a refused claim leaves nothing behind to clean up.
   *
   * From here, every way out that does not record the order must release the claim, or the
   * customer's discount is stuck behind an order that never existed (it frees itself after
   * ten minutes, but nobody should wait ten minutes for a card error).
   */
  if (summary.firstOrder) {
    const claimed = await claimFirstOrder(identity, orderId, summary.discount);

    if (claimed.kind !== "available") {
      return {
        ok: false,
        error:
          firstOrderUnavailableMessage(claimed) ??
          "We could not apply your first-order discount just now, so your total has changed. Please review it and place the order again.",
      };
    }
  }

  const releaseClaim = async () => {
    if (summary.firstOrder) await releaseFirstOrder(orderId);
  };

  const order: Order = {
    id: orderId,
    placedAt: new Date().toISOString(),
    status: "processing",
    customerId: customer?.id,
    email: input.email.trim().toLowerCase(),
    // Only record the code if it actually discounted something.
    promoCode: summary.promo?.code,
    cardLast4: sanitiseLast4(input.cardLast4),
    lines: lines.map((line) => ({
      productId: line.productId,
      slug: line.slug,
      name: line.name,
      colorId: line.colorId,
      colorName: line.colorName,
      colorHex: line.colorHex,
      size: line.size,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      category: line.category,
    })),
    totals: {
      subtotal: summary.subtotal,
      discount: summary.discount,
      shipping: summary.shipping,
      tax: summary.tax,
      codFee: summary.codFee,
      total: summary.total,
    },
    shippingAddress: normaliseAddress(input.address),
    /*
     * Pending for both methods. A COD order has not been paid for either — the
     * cash arrives with the courier, and `markCodOrderCollected` moves it to
     * paid when the tracking sweep sees the delivery.
     */
    paymentStatus: "pending",
    paymentMethod,
  };

  /* ---- Cash on delivery: no payment session, order is final now ------- */

  if (wantsCod) {
    try {
      await createOrder(order, { provider: "cod" });
    } catch (error) {
      console.error("[checkout] could not record COD order:", error);
      await releaseClaim();
      return { ok: false, error: "We could not record your order. Please try again." };
    }

    revalidatePath("/admin/orders");

    /*
     * The confirmation email goes out here, unlike a prepaid order where it
     * waits for the webhook. There is nothing left to confirm — the shopper has
     * committed and the parcel will be sent, so "your order is confirmed" is
     * honest at this moment and would never become more so.
     */
    afterResponse(() => dispatchOrderConfirmation(order));

    // Tell staff now: a COD order is final, so this is the only moment it is "placed".
    afterResponse(() => announce.orderPlacedCod(order));

    /*
     * Manifest straight away, for the same reason: no payment event is coming
     * that could trigger it later. Detached so a Delhivery outage, or an empty
     * wallet, cannot fail an order the shopper has already placed — the admin
     * panel offers a manual retry for exactly that case.
     */
    afterResponse(async () => {
      try {
        const shipment = await manifestShipmentForOrder(order.id);
        if (shipment.ok) {
          console.log(
            `[delhivery] COD shipment created for order ${order.id}: ${shipment.waybill}`,
          );
        } else {
          console.error(
            `[delhivery] Failed to create COD shipment for order ${order.id}:`,
            shipment.error,
          );
        }
      } catch (error) {
        console.error(
          `[delhivery] Error creating COD shipment for order ${order.id}:`,
          error,
        );
      }
    });

    return { ok: true, paymentMethod: "cod", orderId: order.id };
  }

  /* ---- Prepaid: open a Cashfree session ------------------------------- */

  // Narrowed by the guard above, which only tolerates a missing config for COD.
  if (!cashfree) {
    await releaseClaim();
    return { ok: false, error: "Payment is not available right now." };
  }

  /*
   * Cashfree first, then the order write. The order id is only ever used once it can
   * actually be paid for — an order recorded before the Cashfree call could exist with
   * no way to complete payment if that call then failed, which is a worse state than
   * this function simply returning an error and the shopper resubmitting.
   */
  let session: { paymentSessionId: string };
  try {
    const origin = await siteOrigin();
    const created = await createCashfreeOrder(cashfree, {
      orderId,
      amountMinorUnits: summary.total,
      customer: {
        customerId: customer?.id ?? orderId,
        customerName: normaliseAddress(input.address).name,
        customerEmail: order.email!,
        customerPhone: sanitisePhoneForCashfree(input.address.phone),
      },
      returnUrl: `${origin}/checkout/confirmation?order=${encodeURIComponent(orderId)}`,
    });
    session = { paymentSessionId: created.paymentSessionId };
  } catch (error) {
    const detail = error instanceof CashfreeApiError ? error.message : String(error);
    console.error("[checkout] could not create Cashfree order:", detail);
    await releaseClaim();
    return {
      ok: false,
      error: "We could not start your payment. Nothing has been charged — please try again.",
    };
  }

  try {
    await createOrder(order, {
      provider: "cashfree",
      // Cashfree's *order id*, not their internal numeric `cf_order_id` — the two are
      // easy to confuse (both come back from Create Order) but only `order_id` is what
      // `/pg/orders/{order_id}` accepts, which is what `fetchCashfreeOrder` and the
      // webhook handler both query by. It always equals this function's own `orderId`
      // (Cashfree just echoes back whatever id it was given), stored explicitly rather
      // than assumed so a future change to how ids are generated cannot silently break
      // reconciliation.
      cashfreeOrderId: orderId,
      cashfreePaymentSessionId: session.paymentSessionId,
    });
  } catch (error) {
    console.error("[checkout] could not record order:", error);
    await releaseClaim();
    return {
      ok: false,
      error: "We could not record your order. Nothing has been charged — please try again.",
    };
  }

  /**
   * The order itself changes admin listings and the customer's own order history.
   * Nothing on the storefront depends on it — with no inventory, placing an order does
   * not alter what any other shopper sees.
   */
  revalidatePath("/admin/orders");

  /*
   * No confirmation email here. Nothing has been paid for yet — the shopper is about
   * to be sent to Cashfree's hosted checkout, and the email that says "thank you, your
   * order is confirmed" is only honest once the webhook (or a reconciliation fetch)
   * reports the payment actually succeeded. See `markOrderPaid` and
   * `src/app/api/payments/cashfree/webhook/route.ts`.
   */

  return {
    ok: true,
    paymentMethod: "prepaid",
    orderId: order.id,
    paymentSessionId: session.paymentSessionId,
    environment: cashfree.environment,
  };
}

export type ResumePaymentResult =
  | {
      ok: true;
      paymentSessionId: string;
      environment: "sandbox" | "production";
    }
  | { ok: false; error: string };

/**
 * Open a fresh payment session for an order that was never paid.
 *
 * ## Why this exists
 *
 * A shopper who abandons or fails Cashfree's hosted page lands back here with a
 * real, recorded, unpaid order. Sending them to `/checkout` to "try again" would
 * build a second order for the same basket and leave the first stranded as
 * `pending` forever. This retries the one they already have.
 *
 * A *new* session rather than the one stored on the order: Cashfree sessions
 * expire, and the common case for reaching this is a shopper who sat on the
 * payment page for a while. Reusing a dead session fails in the browser with
 * nothing useful to say, so a fresh one is requested and the order updated to
 * point at it.
 *
 * Authorised by the same claim ticket as everything else customer-facing — the
 * reference and the email it was placed with must both match.
 */
export async function resumePayment(ref: OrderRef): Promise<ResumePaymentResult> {
  const limited = await consumeIpRateLimit("checkout", LIMITS.checkout);
  if (limited) return { ok: false, error: rateLimitMessage(limited) };

  const order = await lookupOrder(ref);
  if (!order) return { ok: false, error: "We could not find that order." };

  if (order.paymentMethod === "cod") {
    return { ok: false, error: "That is a cash-on-delivery order — there is nothing to pay now." };
  }

  if (order.paymentStatus === "paid") {
    return { ok: false, error: "That order is already paid." };
  }

  // A cancelled order must not become payable again. Without this a shopper could
  // cancel, then "retry payment" from the same page, and be charged for nothing.
  if (order.status === "cancelled") {
    return { ok: false, error: "That order was cancelled, so it can no longer be paid." };
  }

  const config = cashfreeConfig();
  if (!config) {
    return { ok: false, error: "Payment is not available right now. Please try again shortly." };
  }

  try {
    /*
     * Ask Cashfree about the attempt we already have before opening another.
     *
     * Every retry used to register a brand new Cashfree order and leave the old one
     * ACTIVE for its full day. Two payable orders for one purchase is a double
     * charge waiting to happen — a shopper who reopens a tab they thought was dead
     * can pay both — and the second was invisible to the webhook besides.
     *
     * So: a PAID attempt settles the order; a live one is handed straight back (the
     * same session, nothing new to pay); and one that is still open but cannot be
     * reused is closed before its replacement exists. A 404 means Cashfree has never
     * heard of that id, which is safe to replace. Any other failure aborts, because
     * guessing "probably dead" is how the double charge happens.
     */
    if (order.cashfreeOrderId) {
      let existing: Awaited<ReturnType<typeof fetchCashfreeOrder>> | null = null;
      try {
        existing = await fetchCashfreeOrder(config, order.cashfreeOrderId);
      } catch (error) {
        if (!(error instanceof CashfreeApiError && error.status === 404)) throw error;
      }

      if (existing?.orderStatus === "PAID") {
        await settleCashfreePayment(config, order, order.cashfreeOrderId);
        return { ok: false, error: "That order has already been paid." };
      }

      if (existing?.orderStatus === "ACTIVE") {
        if (existing.paymentSessionId && cashfreeAmountMatches(existing, order.totals.total)) {
          return {
            ok: true,
            paymentSessionId: existing.paymentSessionId,
            environment: config.environment,
          };
        }

        const closed = await terminateCashfreeOrder(config, order.cashfreeOrderId);
        if (!closed) {
          console.error(
            `[checkout] could not close ${order.cashfreeOrderId}; refusing to open a second payment.`,
          );
          return {
            ok: false,
            error: "We could not safely reopen the payment page. Nothing has been charged — please try again.",
          };
        }
      }
    }

    const origin = await siteOrigin();

    /*
     * Cashfree rejects a Create Order call that reuses an existing order id, so
     * the retry is registered under a suffixed id. `cashfree_order_id` on our
     * row is updated to match, which is what `fetchCashfreeOrder` and the
     * webhook both query by — otherwise a successful retry would report against
     * an id nothing is watching.
     */
    const attempt = `${order.id}-R${Date.now().toString(36).slice(-4).toUpperCase()}`;

    const created = await createCashfreeOrder(config, {
      orderId: attempt,
      amountMinorUnits: order.totals.total,
      customer: {
        customerId: order.customerId ?? order.id,
        customerName: order.shippingAddress.name,
        customerEmail: order.email ?? "",
        customerPhone: sanitisePhoneForCashfree(order.shippingAddress.phone),
      },
      returnUrl: `${origin}/checkout/confirmation?order=${encodeURIComponent(order.id)}`,
    });

    await setOrderPaymentAttempt(order.id, attempt, created.paymentSessionId);

    return {
      ok: true,
      paymentSessionId: created.paymentSessionId,
      environment: config.environment,
    };
  } catch (error) {
    const detail = error instanceof CashfreeApiError ? error.message : String(error);
    console.error(`[checkout] could not resume payment for ${order.id}:`, detail);
    return {
      ok: false,
      error: "We could not reopen the payment page. Nothing has been charged — please try again.",
    };
  }
}

export type CodEligibility =
  | { available: true; fee: number }
  | { available: false; reason: string };

/**
 * Whether cash on delivery can reach a pincode.
 *
 * Advisory, for the payment step: it lets the shopper see "not available at your
 * PIN code" before committing rather than being refused after pressing the
 * button. `placeOrder` re-checks all of this regardless — this is a courtesy,
 * never the gate.
 *
 * Deliberately does not test the basket thresholds. The browser already has
 * those in its pricing rules and can answer them without a round trip; this
 * answers only the question that needs Delhivery.
 */
export async function codEligibility(pincode: string): Promise<CodEligibility> {
  const settings = await getSettings();

  if (!settings.codEnabled) {
    return { available: false, reason: "Cash on delivery is not available." };
  }

  const trimmed = pincode.trim();
  if (!/^[1-9][0-9]{5}$/.test(trimmed)) {
    return { available: false, reason: "Enter a valid 6-digit PIN code." };
  }

  // Shares the pincode allowance with the delivery estimator, since both spend
  // the same Delhivery quota.
  const limited = await consumeIpRateLimit("pincode", LIMITS.pincodeLookup);
  if (limited) return { available: false, reason: rateLimitMessage(limited) };

  const service = await checkPincode(trimmed);

  /*
   * Only a definite "no" refuses. An unreachable courier API reports
   * `"unknown"`, and telling a shopper COD is unavailable because of our own
   * outage would lose an order we could have taken — the same fail-open
   * reasoning `src/server/delhivery.ts` documents for serviceability itself.
   */
  if (service.configured && service.serviceable === true && service.cashOnDelivery === false) {
    return {
      available: false,
      reason: "Cash on delivery is not offered at this PIN code.",
    };
  }

  return { available: true, fee: settings.codFee };
}

/**
 * The origin to build Cashfree's return URL from.
 *
 * Prefers the request's own `Host`/`x-forwarded-host` header — this runs inside a
 * server action, so unlike the background email templates
 * (`src/server/email/templates.ts`'s `orderUrl`, which has no request to read) a
 * request is always present here. Falling back to the admin-configured
 * `settings.url` (and then to `NEXT_PUBLIC_SITE_URL`) covers a proxy that strips
 * forwarding headers rather than sending the shopper somewhere broken.
 */
async function siteOrigin(): Promise<string> {
  try {
    const requestHeaders = await headers();
    const forwardedHost = requestHeaders.get("x-forwarded-host");
    const host = (forwardedHost ?? requestHeaders.get("host"))?.split(",")[0]?.trim();
    const protocol = (requestHeaders.get("x-forwarded-proto") ?? "https")
      .split(",")[0]
      ?.trim()
      .toLowerCase();

    /*
     * These are request headers, so they are only as honest as whoever sent the
     * request. The URL built from them is where Cashfree returns the shopper, so a
     * value like `evil.example/phish?` or a `javascript` scheme would become a
     * redirect target. Insisting on a plain hostname (with optional port) and an
     * http(s) scheme closes that; it does not make the host trustworthy, but it
     * guarantees the result is a real origin and not a payload.
     */
    const validHost = host && /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/i.test(host);
    if (validHost && (protocol === "https" || protocol === "http")) {
      return `${protocol}://${host}`;
    }
  } catch {
    // No request scope (e.g. called from a script) — fall through to settings.
  }

  const settings = await getSettings();
  const configured = settings.url?.trim().replace(/\/+$/, "");
  if (configured) return configured;

  return process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") ?? "http://localhost:3000";
}

/** Cashfree expects a bare 10-digit Indian mobile number, not the `+91` prefix. */
function sanitisePhoneForCashfree(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * Human-readable reference: `PR-YYMMDD-XXXX`.
 *
 * Generated server-side and checked against existing orders, so two shoppers
 * cannot be handed the same reference on a busy day.
 *
 * ## Why the CSPRNG, for something that looks like a display string
 *
 * This reference is not only a label. Paired with the email, it is the entire
 * credential a guest presents to read an order and to cancel it — see the
 * claim-ticket note in `src/app/actions/orders.ts`. That makes it a secret, and
 * `Math.random`, which this used, is not built to produce secrets: V8 seeds
 * xorshift128+ per context and its internal state is recoverable from a short run
 * of outputs, so an attacker who places a few orders of their own can narrow what
 * the next references will be. Against a shopper whose email is already known —
 * the common case, emails are not secret — predicting the reference is the only
 * remaining barrier to their name, address, phone and order contents.
 *
 * `randomInt` is rejection-sampled and uniform, so it also removes the small
 * modulo bias `Math.floor(random() * 32)` carried. `src/server/otp.ts` made the
 * same call for the same reason; this is the codebase's standard, not a new rule.
 *
 * The alphabet omits I, O, 0 and 1 so a reference read aloud down a phone line
 * cannot be transcribed two ways. That leaves 32^4 ≈ 1.05M per day, which is the
 * real limit here rather than the generator — it is why `lookupOrders` is rate
 * limited rather than relying on the keyspace alone.
 */
async function nextOrderId(): Promise<string> {
  const now = new Date();
  const stamp = [
    now.getFullYear().toString().slice(-2),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");

  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 12; attempt += 1) {
    let tail = "";
    for (let i = 0; i < 4; i += 1) {
      tail += alphabet[randomInt(alphabet.length)];
    }
    const candidate = `PR-${stamp}-${tail}`;
    if (!(await getOrder(candidate))) return candidate;
  }

  // Astronomically unlikely; fall back to something that cannot collide.
  return `PR-${stamp}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

/** Keep four digits at most, and only digits. */
function sanitiseLast4(value: string | undefined): string | undefined {
  const digits = (value ?? "").replace(/\D/g, "").slice(-4);
  return digits.length === 4 ? digits : undefined;
}

/**
 * Trim every field so the order record stays clean.
 *
 * Only the five fields checkout collects are written. A crafted request carrying the
 * legacy `postalCode`/`country`/`firstName` keys has them dropped rather than trimmed
 * and stored: they are readable on historical orders, but nothing should be creating
 * new ones in that shape.
 */
function normaliseAddress(address: Address): Address {
  return {
    name: address.name.trim(),
    line1: address.line1.trim(),
    city: address.city.trim(),
    region: address.region.trim(),
    phone: address.phone.trim(),
    postalCode: address.postalCode?.trim(),
  };
}
