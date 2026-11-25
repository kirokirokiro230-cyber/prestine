import type { Order } from "@/lib/types";
import {
  cashfreeAmountMatches,
  fetchCashfreeOrder,
  terminateCashfreeOrder,
  type CashfreeConfig,
} from "./cashfree";
import { afterResponse } from "./email/after-response";
import { dispatchOrderConfirmation } from "./email/dispatch";
import { announce } from "./notifications";
import {
  addOrderNote,
  markOrderPaid,
  markOrderPaymentFailed,
  recordPaidCashfreeOrder,
} from "./repositories/orders";
import { manifestShipmentForOrder } from "./shipping-service";

/**
 * The one place a Cashfree result becomes an order state.
 *
 * ## Why this exists
 *
 * Two callers decide whether an order is paid: the Cashfree webhook, and
 * `reconcilePayment`, which the confirmation page polls. Each used to carry its own
 * copy of the logic, and the copies had drifted apart in ways that cost money:
 *
 * - The webhook ignored any order that was not `pending`, so a payment that arrived
 *   after the order had been marked `failed` (an earlier attempt expiring while a retry
 *   was still live) was never recorded. The customer was charged and the order stayed
 *   unpaid.
 * - Neither checked that the amount Cashfree reported was the amount the order cost.
 * - The webhook looked the order up by Cashfree's id as if it were ours, so a payment
 *   made through a retry session (whose id carries a suffix) matched nothing and was
 *   silently dropped.
 *
 * One function, one set of rules, called from both.
 *
 * ## The rules
 *
 * 1. **Cashfree is asked, not told.** Nothing in a webhook body or a browser request is
 *    trusted for status or amount; `fetchCashfreeOrder` is the source of truth.
 * 2. **Paid means the right amount, in rupees, in INR.** A PAID order for any other
 *    figure is held and flagged on the order rather than released.
 * 3. **`failed` is only ever recorded for the order's current attempt.** An older attempt
 *    expiring says nothing about a newer one that may be mid-payment.
 * 4. **Money received always wins.** A genuine payment moves an order to `paid` even from
 *    `failed`, and even if the customer cancelled in the meantime — in which case it is
 *    flagged for a refund, and nothing is shipped.
 */

export type SettleOutcome =
  | {
      kind: "paid";
      order: Order;
      /** True only for the call that made the transition, so side effects run once. */
      fresh: boolean;
    }
  | { kind: "failed" }
  | { kind: "pending" }
  | { kind: "held"; reason: string };

export async function settleCashfreePayment(
  config: CashfreeConfig,
  order: Order,
  /** The Cashfree order id to ask about — which may be an earlier attempt's. */
  cashfreeOrderId: string,
  /** Cashfree's payment id, when the caller has one (the webhook does). */
  cashfreePaymentId?: string,
): Promise<SettleOutcome> {
  // Already settled: nothing to ask. A repeat delivery lands here.
  if (order.paymentStatus === "paid") {
    return { kind: "paid", order, fresh: false };
  }

  const remote = await fetchCashfreeOrder(config, cashfreeOrderId);

  if (remote.orderStatus === "PAID") {
    if (!cashfreeAmountMatches(remote, order.totals.total)) {
      const reason =
        `Cashfree reports ${remote.orderStatus} for ₹${remote.orderAmount} ` +
        `(${remote.orderCurrency ?? "no currency"}), but the order total is ` +
        `₹${(order.totals.total / 100).toFixed(2)}. Not marked paid; check Cashfree.`;

      console.error(`[payment] amount mismatch on ${order.id} (${cashfreeOrderId}): ${reason}`);
      afterResponse(() => announce.paymentHeld(order, reason));
      // Visible to staff on the order itself, because a log line nobody reads is
      // how a short payment ships.
      await addOrderNote(order.id, `Payment held — ${reason}`).catch((error) =>
        console.error("[payment] could not record the mismatch note:", error),
      );

      return { kind: "held", reason };
    }

    const paid = await markOrderPaid(order.id, cashfreePaymentId ?? remote.orderId);

    // `null`: another delivery already made the transition. Not an error.
    if (!paid) {
      return { kind: "paid", order, fresh: false };
    }

    // The attempt that took the money is the one a refund must be made against, and it is
    // not always the one the order currently points at.
    if (paid.cashfreeOrderId !== cashfreeOrderId) {
      await recordPaidCashfreeOrder(paid.id, cashfreeOrderId);
    }

    if (paid.status === "cancelled") {
      /*
       * The customer cancelled while a payment was in flight, or paid from an old tab
       * afterwards. The money is real, so the order is recorded as paid — hiding it
       * would make the books wrong — but it must not ship, and it needs a refund.
       */
      await addOrderNote(
        paid.id,
        "Payment received AFTER this order was cancelled. Do not ship. Refund in Cashfree.",
      ).catch((error) => console.error("[payment] could not record the refund note:", error));

      console.error(`[payment] ${paid.id} was paid after cancellation; refund needed.`);
      afterResponse(() => announce.paidAfterCancellation(paid));
      return { kind: "paid", order: paid, fresh: false };
    }

    afterResponse(() => dispatchOrderConfirmation(paid));
    // The moment a prepaid order becomes real. Not earlier: an unpaid one is mostly an
    // abandoned basket, and alerting on those would teach staff to ignore the bell.
    afterResponse(() => announce.orderPaid(paid));
    afterResponse(async () => {
      try {
        const shipment = await manifestShipmentForOrder(paid.id);
        if (shipment.ok) {
          console.log(`[delhivery] Shipment created for order ${paid.id}: ${shipment.waybill}`);
        } else {
          console.error(`[delhivery] Failed to create shipment for order ${paid.id}:`, shipment.error);
        }
      } catch (error) {
        console.error(`[delhivery] Error creating shipment for order ${paid.id}:`, error);
      }
    });

    return { kind: "paid", order: paid, fresh: true };
  }

  if (remote.orderStatus === "EXPIRED" || remote.orderStatus === "TERMINATED") {
    // Rule 3: only the order's current attempt can fail the order.
    if (cashfreeOrderId === order.cashfreeOrderId) {
      await markOrderPaymentFailed(order.id);
      return { kind: "failed" };
    }
    return { kind: "pending" };
  }

  // ACTIVE: no transaction has settled yet.
  return { kind: "pending" };
}

/**
 * Stop an unpaid prepaid order from being payable.
 *
 * Called when an order is cancelled. Cashfree keeps an order ACTIVE for a day after it
 * is created, and the shopper may still hold the payment page — so without this, a
 * cancelled order can be paid, and the first the shop learns of it is a charge with
 * nothing to ship against.
 *
 * Does nothing for COD, for an already-paid order, or when Cashfree is not configured.
 * Never throws: it accompanies a cancellation that must go through regardless.
 */
export async function closePaymentIfOpen(
  config: CashfreeConfig | null,
  order: Order,
): Promise<void> {
  if (!config) return;
  if (order.paymentMethod === "cod") return;
  if (order.paymentStatus === "paid") return;
  if (!order.cashfreeOrderId) return;

  const closed = await terminateCashfreeOrder(config, order.cashfreeOrderId);
  if (!closed) {
    console.warn(
      `[payment] could not terminate Cashfree order ${order.cashfreeOrderId} for ${order.id}; ` +
        "a late payment would be flagged for refund.",
    );
  }
}
