import {
  cashfreeConfig,
  parseCashfreeWebhook,
  verifyCashfreeWebhookSignature,
} from "@/server/cashfree";
import { settleCashfreePayment } from "@/server/payment-settlement";
import { findOrderByCashfreeId } from "@/server/repositories/orders";
import { getRefundByRefundId } from "@/server/repositories/refunds";
import { refreshFromCashfree } from "@/server/refunds";

/**
 * Cashfree payment webhook.
 *
 * ## Why this is the only path (besides reconciliation) that can mark an order paid
 *
 * `placeOrder` (`src/app/actions/checkout.ts`) records the order and opens a Cashfree
 * payment session, but the actual payment happens on Cashfree's own hosted page —
 * this app is never in the loop while a card, UPI or netbanking flow runs. This
 * endpoint is how Cashfree tells us the outcome. The shopper's browser returning to
 * `/checkout/confirmation` is not trusted for this: a closed tab, a network blip on
 * the redirect, or someone simply not coming back must not be the only way an order
 * is recognised as paid, and a return-URL hit is not proof of payment on its own
 * (Cashfree redirects back whether the payment succeeded or not).
 *
 * ## Signature verification, and why the raw body matters
 *
 * `request.text()` reads the exact bytes Cashfree sent, and the signature is verified
 * against that string before it is ever parsed as JSON — see
 * `verifyCashfreeWebhookSignature`'s own note on why re-serialising the parsed
 * payload would change the bytes being signed and break verification even for a
 * genuine request.
 *
 * ## Idempotency and retries
 *
 * Cashfree retries a delivery that does not return 2xx, and the same event can also
 * legitimately arrive more than once. `markOrderPaid` only transitions a `pending`
 * order once (see `mark_order_paid` in `00000000000006_payments.sql`) and returns
 * `null` on a repeat, which this handler treats as "already handled" — it still
 * returns 200 so Cashfree stops retrying, but does not send a second confirmation
 * email.
 *
 * ## Why a fetch-back rather than trusting the payload's own fields
 *
 * The signature proves the payload came from Cashfree unmodified; it does not
 * change the fact that trusting amount/status fields embedded in a webhook body is
 * one field name away from a costly mistake if this app's understanding of the
 * schema is ever slightly wrong. Once the signature is verified, this handler only
 * reads the order id out of the payload and re-fetches that order's real status
 * directly from the Cashfree API (`fetchCashfreeOrder`) — the same call a
 * reconciliation sweep would make — before deciding anything. This mirrors the
 * project's existing "recompute from the source of truth, never trust what arrived"
 * convention (`placeOrder` does the same for price).
 */

export const dynamic = "force-dynamic";

/**
 * A refund event.
 *
 * Like a payment event, the payload says WHICH refund to look at and nothing more: the
 * status is read back from Cashfree before anything changes here, so a payload field this
 * app misunderstands cannot mark money as sent. Refunds this app did not create (issued in
 * the Cashfree dashboard, or Cashfree's own automatic refunds) are acknowledged and left
 * alone; they are not in the ledger and not this app's to account for.
 */
async function handleRefundEvent(
  config: NonNullable<ReturnType<typeof cashfreeConfig>>,
  payload: NonNullable<ReturnType<typeof parseCashfreeWebhook>>,
): Promise<Response> {
  const refundId = payload.data?.refund?.refund_id;

  if (!refundId) {
    return Response.json({ ok: true, ignored: true });
  }

  try {
    const row = await getRefundByRefundId(refundId);
    if (!row) return Response.json({ ok: true, ignored: true });

    const result = await refreshFromCashfree(config, row);

    // Cashfree unreachable: 500, so it delivers this again. Anything else (it has no record,
    // say) will not change by retrying, so acknowledge it.
    if (!result.ok && result.retryable) {
      return Response.json({ error: "Could not confirm the refund." }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    const message = (error as Error).message;

    // Migration 20 not run: there can be no refund of ours, so a dashboard refund's event
    // is not worth Cashfree retrying.
    if (/does not exist|schema cache|could not find/i.test(message)) {
      return Response.json({ ok: true, ignored: true });
    }

    console.error(`[cashfree] could not process refund event ${refundId}:`, message);
    return Response.json({ error: "Refund reconciliation failed." }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const config = cashfreeConfig();

  /*
   * No secret, no endpoint — same fail-closed shape as
   * `src/app/api/email/review-requests/route.ts`. 503 because the fault is
   * configuration, not the caller.
   */
  if (!config) {
    return Response.json(
      { error: "Cashfree is not configured, so this endpoint is disabled." },
      { status: 503 },
    );
  }

  const timestamp = request.headers.get("x-webhook-timestamp") ?? "";
  const signature = request.headers.get("x-webhook-signature") ?? "";

  // Read the raw text before anything parses it — the signature is computed over
  // these exact bytes, not a re-serialised version of them.
  const rawBody = await request.text();

  if (!verifyCashfreeWebhookSignature(config, rawBody, timestamp, signature)) {
    console.error("[cashfree] webhook signature did not match; rejecting.");
    return Response.json({ error: "Invalid signature." }, { status: 401 });
  }

  const payload = parseCashfreeWebhook(rawBody);

  /*
   * Refund events share this endpoint with payment events. They are handled before the
   * payment path, which would otherwise read a refund's missing `order` block as a
   * payload it does not recognise.
   */
  if (payload && /REFUND/i.test(payload.type)) {
    return handleRefundEvent(config, payload);
  }

  const cashfreeOrderId = payload?.data?.order?.order_id;

  if (!payload || !cashfreeOrderId) {
    // Signed but not a shape this app recognises. Acknowledge rather than have
    // Cashfree retry a payload that will never parse differently.
    console.error("[cashfree] webhook payload missing an order id; ignoring.", payload?.type);
    return Response.json({ ok: true, ignored: true });
  }

  /*
   * By Cashfree's id, not ours: a payment made through a retry session carries a
   * suffixed id that is not an order id here, and looking it up as one dropped the
   * payment silently. See `findOrderByCashfreeId`.
   */
  const order = await findOrderByCashfreeId(cashfreeOrderId);
  if (!order) {
    console.error(`[cashfree] webhook referenced unknown order ${cashfreeOrderId}; ignoring.`);
    return Response.json({ ok: true, ignored: true });
  }

  // Already paid — most commonly a retried delivery for an event already handled.
  // Only `paid` short-circuits: a `failed` order can still receive a real payment
  // (an earlier attempt expired while a retry was open), and ignoring it here left
  // the customer charged against an order that stayed unpaid.
  if (order.paymentStatus === "paid") {
    return Response.json({ ok: true, alreadyHandled: true });
  }

  try {
    const outcome = await settleCashfreePayment(
      config,
      order,
      cashfreeOrderId,
      payload.data?.payment?.cf_payment_id !== undefined
        ? String(payload.data.payment.cf_payment_id)
        : undefined,
    );

    // A held payment (wrong amount) is acknowledged: retrying the delivery cannot
    // change Cashfree's answer, and the order carries a note for staff to act on.
    if (outcome.kind === "held") {
      return Response.json({ ok: true, held: true });
    }
  } catch (error) {
    console.error(`[cashfree] could not reconcile order ${cashfreeOrderId}:`, error);
    // 500 so Cashfree retries this delivery rather than assuming it was handled.
    return Response.json({ error: "Reconciliation failed." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
