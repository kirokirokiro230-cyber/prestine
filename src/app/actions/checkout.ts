"use server";

import { revalidatePath } from "next/cache";
import { MAX_LINE_QUANTITY, orderSummary, type PricingRules } from "@/lib/cart-math";
import type { Address, CartLine, Order } from "@/lib/types";
import { address as validateAddress, email as validateEmail } from "@/lib/validation";
import { afterResponse } from "@/server/email/after-response";
import { dispatchOrderConfirmation } from "@/server/email/dispatch";
import { createOrder, getOrder } from "@/server/repositories/orders";
import { listActiveProducts } from "@/server/repositories/products";
import {
  getSettings,
  listPromoCodes,
} from "@/server/repositories/settings";
import { currentCustomer } from "@/server/customer-session";

/**
 * Order placement.
 *
 * This is the trust boundary. The browser sends *what* the shopper wants — product
 * id, colour, size, quantity — and nothing about what it costs. Prices, discounts,
 * shipping and tax are all recomputed here from the store, so a tampered request
 * cannot buy a coat for a dollar.
 *
 * There is no inventory to check. The shop does not track stock, so every line is
 * always fulfillable and an order can never fail for availability — fulfilment is
 * manual, and the same piece can be ordered any number of times.
 *
 * What this deliberately does not do is take money. There is no PSP wired up: the
 * card is validated in the browser, only the last four digits reach this function,
 * and nothing is captured. Before going live, authorise the payment *before*
 * `createOrder`, and return the failure to the shopper if it is declined.
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
}

export type PlaceOrderResult =
  | { ok: true; orderId: string }
  | { ok: false; error: string };



export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
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
  };

  const summary = orderSummary({
    lines,
    promoCode: input.promoCode ?? null,
    chargeTax: true,
    rules,
  });

  /* ---- Record the order ---------------------------------------------- */

  /*
   * Checkout is gated behind sign-in, so there is normally a customer here — stamping
   * their id is what lets the order be tied back to them for the post-delivery review
   * prompt, rather than relying on an email match that two people can share. Guarded with
   * `?.` so the action still records an order if the session has lapsed between the gate
   * and the submit; the order simply falls back to email-only linkage in that case.
   */
  const customer = await currentCustomer();

  const order: Order = {
    id: await nextOrderId(),
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
      total: summary.total,
    },
    shippingAddress: normaliseAddress(input.address),
  };

  try {
    await createOrder(order);
  } catch (error) {
    console.error("[checkout] could not record order:", error);
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

  /**
   * Confirmation email, after the response.
   *
   * `after()` rather than an awaited call, because the order is already recorded and the
   * shopper is entitled to their confirmation page now. Awaiting a mail provider here
   * would put its latency — and its bad days — directly in front of the one screen that
   * tells someone their money went somewhere sensible.
   *
   * `dispatchOrderConfirmation` never rejects; see the note in `server/email/dispatch.ts`
   * on why the failure path records rather than throws.
   */
  afterResponse(() => dispatchOrderConfirmation(order));

  return { ok: true, orderId: order.id };
}

/**
 * Human-readable reference: `PR-YYMMDD-XXXX`.
 *
 * Generated server-side and checked against existing orders, so two shoppers
 * cannot be handed the same reference on a busy day.
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
      tail += alphabet[Math.floor(Math.random() * alphabet.length)];
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
  };
}
