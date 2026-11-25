import "./env";
import { cashfreeConfig, fetchCashfreeOrder } from "../src/server/cashfree";
import { getOrder, markOrderPaid, markOrderPaymentFailed } from "../src/server/repositories/orders";

/**
 * One-off manual reconciliation for an order stuck `pending` after the confirmation
 * page's own polling window gave up before Cashfree actually settled the payment.
 *
 * Usage:
 *   npx tsx scripts/reconcile-order.ts PR-260925-D4JC
 *
 * Safe to run against any order id — it only ever moves a `pending` order forward
 * based on what Cashfree's API reports right now, the same check
 * `reconcilePayment` (src/app/actions/orders.ts) performs from the confirmation
 * page. Does nothing to an order that is already `paid` or `failed`.
 */
async function main() {
  const orderId = process.argv[2];
  if (!orderId) {
    console.error("Usage: npx tsx scripts/reconcile-order.ts <order-id>");
    process.exit(1);
  }

  const order = await getOrder(orderId);
  if (!order) {
    console.error(`No such order: ${orderId}`);
    process.exit(1);
  }

  console.log(`Order ${orderId}: paymentStatus=${order.paymentStatus}`);

  if (order.paymentStatus !== "pending") {
    console.log("Nothing to do — already resolved.");
    return;
  }

  const config = cashfreeConfig();
  if (!config) {
    console.error("Cashfree is not configured (CASHFREE_APP_ID/CASHFREE_SECRET_KEY missing).");
    process.exit(1);
  }
  // Query by this app's own order id, which is what Cashfree's /pg/orders/{order_id}
  // actually expects — some orders placed before the checkout.ts fix have the wrong
  // value (cf_order_id, Cashfree's internal numeric id) stored in cashfreeOrderId, so
  // this deliberately does not read that column.
  const remote = await fetchCashfreeOrder(config, order.id);
  console.log(`Cashfree reports order_status=${remote.orderStatus}`);

  if (remote.orderStatus === "PAID") {
    const paid = await markOrderPaid(order.id, remote.orderId);
    console.log(paid ? "Marked paid." : "Already marked paid by another process.");
  } else if (remote.orderStatus === "EXPIRED" || remote.orderStatus === "TERMINATED") {
    const failed = await markOrderPaymentFailed(order.id);
    console.log(failed ? "Marked failed." : "Already resolved by another process.");
  } else {
    console.log(`Still ${remote.orderStatus} on Cashfree's side — no change made.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
