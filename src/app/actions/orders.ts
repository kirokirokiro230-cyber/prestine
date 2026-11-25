"use server";

import type { Order, OrderRef } from "@/lib/types";
import { cashfreeConfig } from "@/server/cashfree";
import { clientIp } from "@/server/client-ip";
import { loginLockout, recordFailedLogin } from "@/server/login-attempts";
import { LIMITS, consumeRateLimit, rateLimitMessage } from "@/server/rate-limit";
import { afterResponse } from "@/server/email/after-response";
import { dispatchStatusEmail } from "@/server/email/dispatch";
import { announce } from "@/server/notifications";
import { cancelCourierBooking, checkCancellable } from "@/server/order-cancellation";
import { closePaymentIfOpen, settleCashfreePayment } from "@/server/payment-settlement";
import { cancelOrderAsCustomer, getOrder } from "@/server/repositories/orders";
import { getReturnsForOrders } from "@/server/repositories/shipping";

/**
 * Customer-facing order lookup.
 *
 * There is no customer login in this build, so guests hold a claim ticket instead:
 * the browser stores the order reference and the email it was placed with, and both
 * must match for the record to come back. That matters because references are short
 * and enumerable — `PR-260806-K4TQ` is guessable in a way an email pairing is not.
 *
 * Only ever returns the customer's own order, with the admin-only fields removed.
 * When real accounts arrive, replace the `refs` argument with the session's customer
 * id and delete the email check; nothing above this function changes shape.
 */

/** Stops a request from asking the server to walk the whole order table. */
const MAX_REFS = 50;

export async function lookupOrders(refs: OrderRef[]): Promise<Order[]> {
  if (!Array.isArray(refs) || refs.length === 0) return [];

  /*
   * Bounded, but only on lookups that find nothing.
   *
   * This was deliberately unlimited, on the grounds that the confirmation page
   * polls it and a counter would eventually lock a shopper out of their own
   * receipt. That reasoning holds for *hits* and not for misses. A reference is
   * four characters from a 32-letter alphabet within a given day — about 1.05M
   * combinations — and a single call may carry fifty of them, so an unlimited
   * endpoint is a guessing oracle that returns a stranger's name, address, phone
   * and order contents on a hit, to anyone who already knows their email.
   *
   * Charging misses keeps both properties: a shopper reading their receipts
   * matches every reference and is never counted, no matter how hard the
   * confirmation page polls, while an enumerator pays for every attempt.
   *
   * One unit per *call*, not per miss. A browser replaying references for an
   * order that has since been removed misses on every page load through no fault
   * of the shopper's, and charging per reference would lock such a visitor out of
   * their own history on the first request.
   */
  const lockKey = `order-lookup:ip:${await clientIp()}`;
  const limited = await loginLockout(lockKey, { maxAttempts: LIMITS.orderLookup });

  /*
   * Returning what we can rather than refusing outright. There is no error
   * channel on this signature, and an empty array would tell a signed-in shopper
   * their orders had vanished. A locked-out caller still gets nothing new, since
   * the lookups below are skipped.
   */
  if (limited.locked) {
    console.warn(`[orders] lookup allowance exhausted for ${lockKey}; refusing.`);
    return [];
  }

  const found: Order[] = [];
  let missed = false;

  for (const ref of refs.slice(0, MAX_REFS)) {
    if (typeof ref?.id !== "string" || typeof ref?.email !== "string") {
      missed = true;
      continue;
    }

    const order = await getOrder(ref.id.trim().toUpperCase());
    if (!order || !order.email) {
      missed = true;
      continue;
    }
    if (order.email.toLowerCase() !== ref.email.trim().toLowerCase()) {
      missed = true;
      continue;
    }

    found.push(forCustomer(order));
  }

  if (missed) await recordFailedLogin(lockKey);

  /*
   * Attach each order's return, so the page can say "Return requested" instead of offering
   * the button again. One query for all of them. `getReturnsForOrders` selects named
   * columns and never the full UPI ID, so only the masked hint can reach the browser.
   */
  if (found.length > 0) {
    const returns = await getReturnsForOrders(found.map((order) => order.id));

    for (const order of found) {
      const entry = returns.get(order.id);
      if (!entry) continue;

      order.returnRequest = {
        id: entry.id,
        status: entry.status,
        requestedAt: entry.requested_at,
        refundHint: entry.refund_upi_hint ?? undefined,
      };
    }
  }

  return found.sort((a, b) => b.placedAt.localeCompare(a.placedAt));
}

/** Single lookup, used by the confirmation page. */
export async function lookupOrder(ref: OrderRef): Promise<Order | null> {
  const [order] = await lookupOrders([ref]);
  return order ?? null;
}

/**
 * Reconcile a pending order's payment status directly with Cashfree.
 *
 * The webhook (`src/app/api/payments/cashfree/webhook/route.ts`) is the primary path
 * to `markOrderPaid`, but the shopper can land back on the confirmation page before
 * it arrives — Cashfree's redirect and its webhook are two independent deliveries,
 * and nothing guarantees the webhook wins the race. Rather than show "payment
 * failed" on a page that just has not heard the good news yet, the confirmation
 * view calls this to ask Cashfree directly. Safe to call repeatedly: it re-checks
 * `getOrder` for the same claim-ticket ownership `lookupOrder` requires, and
 * `markOrderPaid`/`markOrderPaymentFailed` are themselves idempotent — a webhook
 * that lands moments later or moments earlier reaches the same result either way.
 */
export async function reconcilePayment(ref: OrderRef): Promise<Order | null> {
  const order = await lookupOrder(ref);
  if (!order) return order;

  // Nothing to ask about: already paid, or paid in cash on delivery by design.
  if (order.paymentStatus === "paid" || order.paymentMethod === "cod") return order;

  const config = cashfreeConfig();
  if (!config || !order.cashfreeOrderId) return order;

  try {
    /*
     * `pending` and `failed` both reach Cashfree. A `failed` order is not final: an
     * earlier attempt expiring marks it failed while a retry may be mid-payment, and
     * returning early for anything but `pending` meant a shopper who then paid was
     * shown "payment failed" forever. The shared settle logic is the same one the
     * webhook runs, so the two paths cannot disagree about what counts as paid.
     */
    await settleCashfreePayment(config, order, order.cashfreeOrderId);
    return (await lookupOrder(ref)) ?? order;
  } catch (error) {
    console.error(`[checkout] reconciliation fetch failed for ${order.id}:`, error);
    return order;
  }
}

/**
 * Strip the fields a customer should never see.
 *
 * `notes` are internal fulfilment comments written by staff. Everything else on the
 * record is the customer's own data, including `cardLast4`, which a receipt needs.
 */
function forCustomer(order: Order): Order {
  const visible: Order = { ...order };
  delete visible.notes;
  return visible;
}

export interface CancelOrderState {
  error?: string;
  success?: string;
}

/**
 * Cancel an order the customer holds the claim ticket for.
 *
 * Authorisation is the same pairing `lookupOrders` requires: the reference **and** the
 * email it was placed with. Deliberately not `requirePermission` — this is the
 * customer's own order, and there is no staff session to check. Equally deliberately
 * not reference-only: references are short and enumerable, so without the email a
 * stranger could cancel a shop's orders by guessing.
 *
 * The reason is required. An order that says only "cancelled" generates the support
 * conversation the reason exists to prevent.
 */
export async function cancelOrderAction(
  _previous: CancelOrderState,
  formData: FormData,
): Promise<CancelOrderState> {
  const id = String(formData.get("id") ?? "")
    .trim()
    .toUpperCase();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!id || !email) return { error: "We could not identify that order." };
  if (!reason) return { error: "Tell us why you are cancelling." };
  if (reason.length > 300) return { error: "Please keep the reason under 300 characters." };

  /*
   * The reference and email arrive as raw form input, which makes this the
   * guessing target among the customer actions — and a hit cancels an order and
   * sends mail. Counted after the shape checks so a missing reason does not
   * consume the allowance.
   *
   * `lookupOrders` and `reconcilePayment` are deliberately left unlimited: both
   * are polled by the confirmation page while it waits for a payment to settle,
   * both are idempotent, and both are already gated on the same pairing. A
   * counter there would eventually lock a shopper out of their own receipt.
   */
  const limited = await consumeRateLimit(
    [`order-cancel:ip:${await clientIp()}`, `order-cancel:ref:${id}`],
    LIMITS.orderCancel,
  );
  if (limited) return { error: rateLimitMessage(limited) };

  const order = await getOrder(id);

  /*
   * One message for "no such order" and for "wrong email". Distinguishing them would
   * confirm that a guessed reference exists, which is the enumeration this guards.
   */
  if (!order || !order.email || order.email.toLowerCase() !== email) {
    return { error: "We could not find that order." };
  }

  /*
   * Ask the courier, not just the database. The stored status is only as fresh as the last
   * tracking sweep, so a parcel the driver collected an hour ago can still read
   * "processing" here. See `checkCancellable` for why this fails closed.
   */
  const cancellable = await checkCancellable(order);
  if (!cancellable.ok) return { error: cancellable.error };

  let cancelled: Order;
  try {
    cancelled = await cancelOrderAsCustomer(id, reason);
  } catch (error) {
    return { error: (error as Error).message };
  }

  /*
   * Stop the courier booking too, or the waybill stays live and the driver can still
   * collect a parcel for an order that no longer exists. Best effort and after the
   * cancel: a courier hiccup must not undo it, and a failure leaves a note for staff.
   */
  await cancelCourierBooking(id, cancellable.waybill);

  /*
   * Close the payment page too. Cancelling the order here leaves its Cashfree order
   * ACTIVE for up to a day, and a shopper still holding that page can pay it — a charge
   * against an order that was cancelled and will never ship. Done after the cancel
   * succeeds, and best effort: it must not turn a successful cancellation into an error.
   */
  await closePaymentIfOpen(cashfreeConfig(), order);

  /*
   * The account page reads orders through a server action rather than a cached route
   * segment, so there is no path to revalidate — the client refetches. Kept explicit
   * here so the omission reads as a decision rather than a gap.
   */

  /*
   * Confirm the cancellation by email even though the customer just did it themselves.
   * It is the only durable record they have that it went through, and "I cancelled but
   * never heard anything" is otherwise indistinguishable from a cancellation that failed.
   */
  afterResponse(() => dispatchStatusEmail(cancelled));

  // Tell staff. Critical when the customer had already paid, because a refund is then owed.
  afterResponse(() => announce.orderCancelledByCustomer(cancelled, reason));

  return { success: "Your order has been cancelled." };
}
