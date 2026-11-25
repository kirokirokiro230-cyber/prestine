import type { Order } from "./types";

/**
 * Admin notifications: the shapes, and one builder per event.
 *
 * Pure on purpose. Deciding what an alert SAYS is separate from deciding when to send it
 * and from storing it, and the wording is the part worth testing — a notification that
 * says "New order" for a pending, unpaid one would send staff to pack something that was
 * never paid for.
 *
 * ## What counts as an order being "placed"
 *
 * - **Prepaid:** when the payment is confirmed, not when the order row is created. A
 *   prepaid order exists the moment someone reaches the payment page, and most of those
 *   are abandoned. Alerting on creation would train staff to ignore the bell.
 * - **COD:** immediately, because nothing further is coming — it is final the moment it
 *   is recorded.
 *
 * ## Severity
 *
 * - `critical` — money or a parcel is at risk and a person has to act: a refund is owed,
 *   a payment is held, a shipment failed to book, a courier booking could not be
 *   cancelled. These stay on screen until dismissed.
 * - `warning` — worth knowing, may need a decision: a cancellation, a return, a parcel
 *   going back to the warehouse.
 * - `success` — good news staff should see: a new order.
 * - `info` — progress: shipped, delivered, cash collected.
 */

export type NotificationSeverity = "info" | "success" | "warning" | "critical";

export interface AdminNotificationInput {
  /** Stable machine-readable name, e.g. `order.paid`. */
  kind: string;
  severity: NotificationSeverity;
  title: string;
  body?: string;
  orderId?: string;
  href?: string;
  /**
   * Makes the event idempotent. The same event arrives more than once in normal
   * operation — Cashfree retries webhooks, the confirmation page polls the same
   * settlement path, the tracking sweep re-reads whole histories — and a key stops each
   * of those becoming another alert.
   */
  dedupeKey?: string;
}

/** A stored notification, as the admin UI receives it. */
export interface AdminNotification {
  id: string;
  createdAt: string;
  kind: string;
  severity: NotificationSeverity;
  title: string;
  body: string;
  orderId?: string;
  href?: string;
}

/** What the bell polls for. */
export interface NotificationFeed {
  items: AdminNotification[];
  /** Notifications newer than this admin's last "mark all read". */
  unread: number;
}

export type Money = (minorUnits: number) => string;

const orderHref = (id: string) => `/admin/orders/${encodeURIComponent(id)}`;

/** Trim to a length the table accepts, on a word boundary where there is one. */
export function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function customerName(order: Pick<Order, "shippingAddress">): string {
  const a = order.shippingAddress;
  return a.name?.trim() || [a.firstName, a.lastName].filter(Boolean).join(" ").trim() || "A customer";
}

function itemCount(order: Pick<Order, "lines">): number {
  return order.lines.reduce((sum, line) => sum + line.quantity, 0);
}

function summary(order: Order): string {
  const items = itemCount(order);
  const method = order.paymentMethod === "cod" ? "Cash on delivery" : "Prepaid";
  const city = order.shippingAddress.city?.trim();

  return [
    customerName(order),
    `${items} ${items === 1 ? "item" : "items"}`,
    method,
    city || null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/* ------------------------------------------------------------------ */
/* New orders                                                          */
/* ------------------------------------------------------------------ */

/** A prepaid order whose payment has just been confirmed. */
export function orderPaid(order: Order, money: Money): AdminNotificationInput {
  return {
    kind: "order.paid",
    severity: "success",
    title: `New order ${order.id} · ${money(order.totals.total)}`,
    body: summary(order),
    orderId: order.id,
    href: orderHref(order.id),
    dedupeKey: `order.paid:${order.id}`,
  };
}

/** A cash-on-delivery order, which is final the moment it is placed. */
export function orderPlacedCod(order: Order, money: Money): AdminNotificationInput {
  return {
    kind: "order.placed",
    severity: "success",
    title: `New COD order ${order.id} · ${money(order.totals.total)}`,
    body: `${summary(order)} · collect ${money(order.totals.total)} on delivery`,
    orderId: order.id,
    href: orderHref(order.id),
    dedupeKey: `order.placed:${order.id}`,
  };
}

/* ------------------------------------------------------------------ */
/* Cancellations and returns                                           */
/* ------------------------------------------------------------------ */

export function orderCancelledByCustomer(
  order: Order,
  reason: string,
  money: Money,
): AdminNotificationInput {
  // Whether money has to go back changes what the person reading this must do next.
  const paidPrepaid = order.paymentMethod !== "cod" && order.paymentStatus === "paid";

  return {
    kind: "order.cancelled",
    severity: paidPrepaid ? "critical" : "warning",
    title: paidPrepaid
      ? `Refund needed — ${order.id} cancelled by customer`
      : `Order ${order.id} cancelled by customer`,
    body: clip(
      `${customerName(order)} · ${money(order.totals.total)}${
        paidPrepaid ? " already paid" : ""
      } · “${reason}”`,
      600,
    ),
    orderId: order.id,
    href: orderHref(order.id),
    dedupeKey: `order.cancelled:${order.id}`,
  };
}

export function returnRequested(
  order: Order,
  reason: string,
  returnId: string,
): AdminNotificationInput {
  return {
    kind: "return.requested",
    severity: "warning",
    title: `Return requested for ${order.id}`,
    body: clip(`${customerName(order)} · “${reason}”`, 600),
    orderId: order.id,
    href: orderHref(order.id),
    dedupeKey: `return.requested:${returnId}`,
  };
}

/* ------------------------------------------------------------------ */
/* Money problems                                                      */
/* ------------------------------------------------------------------ */

/** Cashfree says paid, but not the amount the order costs. */
export function paymentHeld(order: Order, reason: string): AdminNotificationInput {
  return {
    kind: "payment.held",
    severity: "critical",
    title: `Payment held on ${order.id} — amount mismatch`,
    body: clip(reason, 600),
    orderId: order.id,
    href: orderHref(order.id),
    dedupeKey: `payment.held:${order.id}`,
  };
}

/** A real payment arrived for an order that had already been cancelled. */
export function paidAfterCancellation(order: Order, money: Money): AdminNotificationInput {
  return {
    kind: "payment.after-cancel",
    severity: "critical",
    title: `Refund needed — ${order.id} was paid after cancellation`,
    body: `${customerName(order)} paid ${money(order.totals.total)} for a cancelled order. Do not ship; refund it from the order page.`,
    orderId: order.id,
    href: orderHref(order.id),
    dedupeKey: `payment.after-cancel:${order.id}`,
  };
}

/**
 * A refund Cashfree accepted, then could not complete (or refused outright later).
 *
 * Critical, because the customer is owed money and believes it is coming: the refund was
 * confirmed on screen when it was issued, and the failure arrives hours or days after
 * whoever issued it has moved on. Keyed on the refund, so a repeated webhook is one alert
 * and a second failed attempt is another.
 *
 * The reason is Cashfree's, about the payment instrument, never about the customer's bank
 * details, which this app does not hold for a prepaid order.
 */
export function refundFailed(
  order: Order,
  amount: number,
  reason: string,
  refundId: string,
  money: Money,
): AdminNotificationInput {
  return {
    kind: "refund.failed",
    severity: "critical",
    title: `Refund of ${money(amount)} failed for ${order.id}`,
    body: clip(
      `${customerName(order)} has not received this money. ${reason} Refund it again from the order page.`,
      600,
    ),
    orderId: order.id,
    href: orderHref(order.id),
    dedupeKey: `refund.failed:${refundId}`,
  };
}

/* ------------------------------------------------------------------ */
/* Shipping                                                            */
/* ------------------------------------------------------------------ */

export function shipmentFailed(orderId: string, error: string): AdminNotificationInput {
  return {
    kind: "shipment.failed",
    severity: "critical",
    title: `Shipment could not be booked for ${orderId}`,
    body: clip(`${error} Book it manually from the order page.`, 600),
    orderId,
    href: orderHref(orderId),
    dedupeKey: `shipment.failed:${orderId}`,
  };
}

export function courierCancelFailed(
  orderId: string,
  waybill: string,
  detail: string,
): AdminNotificationInput {
  return {
    kind: "shipment.cancel-failed",
    severity: "critical",
    title: `Cancel waybill ${waybill} in Delhivery`,
    body: clip(
      `${orderId} was cancelled by the customer but the courier booking is still live. ${detail}`,
      600,
    ),
    orderId,
    href: orderHref(orderId),
    dedupeKey: `shipment.cancel-failed:${orderId}`,
  };
}

export function orderShipped(order: Order): AdminNotificationInput {
  return {
    kind: "order.shipped",
    severity: "info",
    title: `${order.id} picked up by the courier`,
    body: customerName(order),
    orderId: order.id,
    href: orderHref(order.id),
    dedupeKey: `order.shipped:${order.id}`,
  };
}

export function orderDelivered(order: Order): AdminNotificationInput {
  return {
    kind: "order.delivered",
    severity: "info",
    title: `${order.id} delivered`,
    body: customerName(order),
    orderId: order.id,
    href: orderHref(order.id),
    dedupeKey: `order.delivered:${order.id}`,
  };
}

export function codCollected(order: Order, money: Money): AdminNotificationInput {
  return {
    kind: "cod.collected",
    severity: "info",
    title: `COD cash collected for ${order.id}`,
    body: `${money(order.totals.total)} collected by the courier on delivery.`,
    orderId: order.id,
    href: orderHref(order.id),
    dedupeKey: `cod.collected:${order.id}`,
  };
}

/** The parcel is travelling back to the warehouse. Costs money and needs a decision. */
export function parcelReturning(order: Order): AdminNotificationInput {
  return {
    kind: "shipment.rto",
    severity: "warning",
    title: `${order.id} is returning to origin`,
    body: `${customerName(order)} · the courier could not deliver it. Check the order and contact the customer.`,
    orderId: order.id,
    href: orderHref(order.id),
    dedupeKey: `shipment.rto:${order.id}`,
  };
}

/* ------------------------------------------------------------------ */
/* Presentation helpers                                                */
/* ------------------------------------------------------------------ */

/**
 * "just now", "4 min ago", "3 h ago", then a date.
 *
 * Takes `now` so it is testable, and so the list can re-render on a timer without every
 * row reading its own clock.
 */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";

  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 45) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;

  return new Date(then).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
