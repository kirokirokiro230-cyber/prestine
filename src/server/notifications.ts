import {
  clip,
  codCollected,
  courierCancelFailed,
  orderCancelledByCustomer,
  orderDelivered,
  orderPaid,
  orderPlacedCod,
  orderShipped,
  paidAfterCancellation,
  parcelReturning,
  paymentHeld,
  refundFailed,
  returnRequested,
  shipmentFailed,
  type AdminNotification,
  type AdminNotificationInput,
  type Money,
  type NotificationFeed,
} from "@/lib/admin-notifications";
import { createMoneyFormatter } from "@/lib/format";
import type { Order } from "@/lib/types";
import type { AdminNotificationRow, AdminNotificationStateRow } from "./database.types";
import { getSettings } from "./repositories/settings";
import { db, unwrap, upsertInto } from "./supabase";

/**
 * Admin notifications: writing them, and reading the feed the bell shows.
 *
 * ## Writing never fails the thing that caused it
 *
 * Every function that EMITS an alert is built so it cannot throw. An alert is a courtesy
 * about an event that has already happened — the order is paid, the customer has
 * cancelled — and if recording that courtesy fails, the worst outcome must be a missing
 * alert, never a payment webhook answering 500 so that Cashfree retries a payment that
 * was recorded perfectly well. Every call site is `afterResponse(...)` for the same
 * reason, so the shopper does not wait on it either.
 *
 * ## Reading is per admin, writing is shared
 *
 * One row per event, and each admin keeps a single "seen up to" timestamp, so a
 * notification is unread for you while it is newer than that. Nothing is stored per
 * person per event.
 */

/** How long notifications are kept. Old ones are not useful and the table should not grow. */
const RETENTION_DAYS = 60;

/** How many the dropdown shows. The bell is for recent events, not an archive. */
const FEED_LIMIT = 30;

function fromRow(row: AdminNotificationRow): AdminNotification {
  return {
    id: row.id,
    createdAt: row.created_at,
    kind: row.kind,
    severity: row.severity,
    title: row.title,
    body: row.body,
    orderId: row.order_id ?? undefined,
    href: row.href ?? undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Writing                                                             */
/* ------------------------------------------------------------------ */

/**
 * Record one notification. Safe to call from anywhere: it never throws.
 *
 * A repeated `dedupeKey` is ignored by the database (`on conflict do nothing`), which is
 * what makes retried webhooks and re-polled tracking produce a single alert.
 */
export async function notifyAdmins(input: AdminNotificationInput): Promise<void> {
  try {
    const { error } = await upsertInto(
      db(),
      "admin_notifications",
      {
        kind: input.kind,
        severity: input.severity,
        title: clip(input.title, 160),
        body: clip(input.body ?? "", 600),
        order_id: input.orderId ?? null,
        href: input.href ?? null,
        dedupe_key: input.dedupeKey ?? null,
      },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    );

    if (error) throw new Error(error.message);

    /*
     * Prune on write, one time in ten, for the same reason the OTP and rate-limit tables
     * do: a cleanup job someone has to remember exists is one that is eventually not
     * running. Cheap — it is a range delete on an indexed timestamp.
     */
    if (Math.random() < 0.1) {
      const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
      await db().from("admin_notifications").delete().lt("created_at", cutoff);
    }
  } catch (error) {
    console.error(`[notifications] could not record "${input.kind}":`, error);
  }
}

/**
 * The store's money formatter.
 *
 * Read from settings so a merchant who changes currency sees it reflected here, and
 * falling back to plain rupees if settings cannot be read — an alert with a slightly
 * plainer amount is better than no alert.
 */
async function moneyFormatter(): Promise<Money> {
  try {
    const settings = await getSettings();
    return createMoneyFormatter(settings.currency, settings.locale);
  } catch {
    return (minor) => `₹${(minor / 100).toFixed(2)}`;
  }
}

/** Build with the store's formatter, then send. Each event below is one line of this. */
async function emit(build: (money: Money) => AdminNotificationInput): Promise<void> {
  try {
    await notifyAdmins(build(await moneyFormatter()));
  } catch (error) {
    console.error("[notifications] could not build a notification:", error);
  }
}

/**
 * One function per event, so a call site reads as what happened rather than as a payload.
 * The wording lives in `src/lib/admin-notifications.ts`.
 */
export const announce = {
  /** A prepaid order whose payment was just confirmed. */
  orderPaid: (order: Order) => emit((money) => orderPaid(order, money)),
  /** A cash-on-delivery order, final the moment it is recorded. */
  orderPlacedCod: (order: Order) => emit((money) => orderPlacedCod(order, money)),
  orderCancelledByCustomer: (order: Order, reason: string) =>
    emit((money) => orderCancelledByCustomer(order, reason, money)),
  returnRequested: (order: Order, reason: string, returnId: string) =>
    emit(() => returnRequested(order, reason, returnId)),
  paymentHeld: (order: Order, reason: string) => emit(() => paymentHeld(order, reason)),
  refundFailed: (order: Order, amount: number, reason: string, refundId: string) =>
    emit((money) => refundFailed(order, amount, reason, refundId, money)),
  paidAfterCancellation: (order: Order) =>
    emit((money) => paidAfterCancellation(order, money)),
  shipmentFailed: (orderId: string, error: string) => emit(() => shipmentFailed(orderId, error)),
  courierCancelFailed: (orderId: string, waybill: string, detail: string) =>
    emit(() => courierCancelFailed(orderId, waybill, detail)),
  orderShipped: (order: Order) => emit(() => orderShipped(order)),
  orderDelivered: (order: Order) => emit(() => orderDelivered(order)),
  codCollected: (order: Order) => emit((money) => codCollected(order, money)),
  parcelReturning: (order: Order) => emit(() => parcelReturning(order)),
};

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

/**
 * The feed for one admin.
 *
 * An admin with no watermark yet is stamped "seen up to now" on their first read, so a
 * new account does not open to the whole history marked unread.
 */
export async function notificationFeed(adminId: string): Promise<NotificationFeed> {
  let state = unwrap(
    await db()
      .from("admin_notification_state")
      .select("*")
      .eq("admin_id", adminId)
      .maybeSingle()
      .overrideTypes<AdminNotificationStateRow, { merge: false }>(),
  );

  if (!state) {
    const seenAt = new Date().toISOString();
    await upsertInto(
      db(),
      "admin_notification_state",
      { admin_id: adminId, seen_at: seenAt },
      { onConflict: "admin_id", ignoreDuplicates: true },
    );
    state = { admin_id: adminId, seen_at: seenAt };
  }

  const [rows, unreadResult] = await Promise.all([
    db()
      .from("admin_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(FEED_LIMIT)
      .overrideTypes<AdminNotificationRow[], { merge: false }>(),
    /*
     * `limit(1)` rather than `head: true`. A HEAD request has no body to carry an error
     * in, so a failing count comes back with `error` unset and `count` null, which reads
     * as "zero unread" — the bell would quietly show nothing while the real problem sat
     * unreported. A normal request with a one-row page still returns the exact count in
     * the response headers, and reports its errors.
     */
    db()
      .from("admin_notifications")
      .select("id", { count: "exact" })
      .gt("created_at", state.seen_at)
      .limit(1),
  ]);

  if (rows.error) throw new Error(rows.error.message);
  if (unreadResult.error) throw new Error(unreadResult.error.message);

  return {
    items: (rows.data ?? []).map(fromRow),
    unread: unreadResult.count ?? 0,
  };
}

/** Mark everything up to now as read, for this admin only. */
export async function markNotificationsSeen(adminId: string): Promise<void> {
  const { error } = await upsertInto(
    db(),
    "admin_notification_state",
    { admin_id: adminId, seen_at: new Date().toISOString() },
    { onConflict: "admin_id" },
  );
  if (error) throw new Error(error.message);
}
