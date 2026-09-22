import { contactTopicLabel, type ContactTopic } from "@/lib/contact";
import type { EmailTemplateKey, Order } from "@/lib/types";
import {
  dueReviewRequests,
  getEmailTemplate,
  markReviewRequested,
  recordEmail,
} from "../repositories/email";
import { getSettings } from "../repositories/settings";
import { renderCustomEmail, renderOrderEmail } from "./templates";
import { sendEmail } from "./transport";

/**
 * The bridge between order lifecycle events and the transport.
 *
 * ## Where this is called from, and why not the repository
 *
 * Called from the action layer — `placeOrder`, the admin status action, the customer
 * cancel action — and never from `repositories/orders.ts`. Two reasons, both practical.
 * The repository is called directly by the test suite, and a repository that sends email
 * would have the suite emailing on every run. And `updateOrderStatus` is one function
 * serving two very different authorities, so putting the send inside it would make the
 * notification impossible to suppress for the cases that should not notify — a merchant
 * correcting a mis-clicked status, for instance.
 *
 * ## Nothing here throws
 *
 * Every function resolves, whatever happened. An order that has been paid for and
 * recorded must not be reported as failed because a mail provider timed out, and a status
 * change that has already been written to the store must not appear to have failed after
 * the fact. Failures are recorded in the email log, which is the surface a merchant can
 * actually act on.
 */

/** Which template a status transition sends, or null when it sends nothing. */
const FOR_STATUS: Record<Order["status"], EmailTemplateKey | null> = {
  /*
   * Nothing. `processing` is the status an order is *created* in, so a transition into it
   * cannot happen — the confirmation is sent explicitly by `placeOrder` instead. Mapping
   * it here would be a lie that reads as correct.
   */
  processing: null,
  /*
   * "Out for delivery" fires here. There is no courier webhook, so the moment a merchant
   * marks an order shipped is the last reliable signal we get; a separate
   * `out_for_delivery` status would depend on someone clicking a button at the exact hour
   * the van left, which means the email would never go out at all.
   */
  shipped: "out-for-delivery",
  delivered: "delivered",
  cancelled: "order-cancelled",
};

/**
 * Send the email a status change calls for.
 *
 * Takes the order *after* the transition, so tracking numbers and timestamps set during
 * the same write are available to the template.
 */
export async function dispatchStatusEmail(order: Order): Promise<void> {
  const key = FOR_STATUS[order.status];
  if (!key) return;
  await dispatchOrderEmail(order, key);
}

/** Confirmation for a freshly placed order. */
export async function dispatchOrderConfirmation(order: Order): Promise<void> {
  await dispatchOrderEmail(order, "order-confirmation");
}

/**
 * Render and send one templated order email, recording the outcome.
 *
 * A disabled template or a missing address is a silent no-op with no log entry: neither
 * is a failure, and filling the log with "skipped because you turned this off" would bury
 * the entries that need attention.
 */
export async function dispatchOrderEmail(
  order: Order,
  key: EmailTemplateKey,
): Promise<void> {
  try {
    if (!order.email) return;

    const template = await getEmailTemplate(key);
    if (!template || !template.enabled) return;

    const settings = await getSettings();
    const message = renderOrderEmail(template, order, settings);

    const result = await sendEmail(order.email, message, {
      // A lifecycle transition is one logical message. If a serverless invocation is
      // retried after Resend accepted the first request but before our log write, the
      // provider returns the original result instead of delivering a duplicate.
      idempotencyKey: `prestine:${key}:${order.id}`,
    });

    await recordEmail({
      to: order.email,
      subject: message.subject,
      templateKey: key,
      orderId: order.id,
      status: result.status,
      error: result.status === "failed" ? result.error : undefined,
    });
  } catch (error) {
    /*
     * The catch-all exists because this runs detached from the request via `after()`.
     * An unhandled rejection there is either swallowed or crashes the worker depending
     * on the host, and neither tells anyone anything. Best effort: try to leave a record.
     */
    console.error(`[email] dispatch failed for ${order.id} (${key}):`, error);
    await recordEmail({
      to: order.email ?? "unknown",
      subject: `Failed to render ${key}`,
      templateKey: key,
      orderId: order.id,
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
    }).catch(() => undefined);
  }
}

/** A one-off message composed in the admin panel. Returns the outcome for the form. */
export async function dispatchCustomEmail(input: {
  to: string;
  subject: string;
  heading: string;
  body: string;
  orderId?: string;
}): Promise<{ ok: boolean; status: "sent" | "logged" | "failed"; error?: string }> {
  const settings = await getSettings();
  const message = renderCustomEmail({
    subject: input.subject,
    heading: input.heading,
    body: input.body,
    settings,
  });

  const result = await sendEmail(input.to, message);

  await recordEmail({
    to: input.to,
    subject: message.subject,
    templateKey: null,
    orderId: input.orderId,
    status: result.status,
    error: result.status === "failed" ? result.error : undefined,
  });

  return {
    // `logged` counts as success: nothing failed, there was simply nowhere to send it.
    ok: result.status !== "failed",
    status: result.status,
    error: result.status === "failed" ? result.error : undefined,
  };
}

/** A public client-care enquiry, delivered only to the store's configured inbox. */
export async function dispatchContactEmail(input: {
  requestId: string;
  name: string;
  email: string;
  topic: ContactTopic;
  orderRef?: string;
  message: string;
}): Promise<{ ok: boolean; status: "sent" | "logged" | "failed"; error?: string }> {
  const settings = await getSettings();
  const topic = contactTopicLabel(input.topic);
  const orderLine = input.orderRef ? `Order reference: ${input.orderRef}\n` : "";

  const message = renderCustomEmail({
    subject: `Client care enquiry — ${topic}`,
    heading: "New client care enquiry",
    body: [
      `Topic: ${topic}`,
      `Name: ${input.name}\nEmail: ${input.email}\n${orderLine}`.trim(),
      input.message,
    ].join("\n\n"),
    settings,
    footerNote: "A shopper submitted this enquiry through the store contact form.",
  });

  /*
   * The recipient is server-owned (`settings.email`), never supplied by the public form,
   * so this cannot be turned into an open relay. The shopper's address is reply-to only:
   * pressing Reply in client care reaches them without spoofing the From domain Resend
   * has verified for the store.
   */
  const result = await sendEmail(settings.email, message, {
    replyTo: input.email,
    idempotencyKey: `prestine:contact:${input.requestId}`,
  });

  await recordEmail({
    to: settings.email,
    subject: message.subject,
    templateKey: null,
    orderId: input.orderRef,
    status: result.status,
    error: result.status === "failed" ? result.error : undefined,
  });

  return {
    // Unlike the authenticated admin composer, a public form must not claim the enquiry
    // was received when it was only logged locally because Resend is unconfigured.
    ok: result.status === "sent",
    status: result.status,
    error:
      result.status === "failed"
        ? result.error
        : result.status === "logged"
          ? "Email delivery is not configured."
          : undefined,
  };
}

/**
 * Send every review request that has come due.
 *
 * Called from the scheduled endpoint and from the admin panel's manual sweep. Sequential
 * rather than parallel on purpose: each send writes to the store, and the store
 * serialises writes through one queue, so firing them concurrently would only queue them
 * behind each other while holding more sockets open.
 *
 * Returns the count so the caller can report it — a sweep that did nothing and a sweep
 * that sent forty look identical otherwise.
 */
export async function dispatchDueReviewRequests(): Promise<{
  sent: number;
  skipped: number;
}> {
  const template = await getEmailTemplate("review-request");
  if (!template?.enabled) {
    const due = await dueReviewRequests();
    return { sent: 0, skipped: due.length };
  }

  const due = await dueReviewRequests();
  let sent = 0;

  for (const order of due) {
    // Claim it first. See the note on `markReviewRequested` for why this order matters.
    await markReviewRequested(order.id);
    await dispatchOrderEmail(order, "review-request");
    sent += 1;
  }

  return { sent, skipped: 0 };
}
