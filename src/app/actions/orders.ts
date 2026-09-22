"use server";

import type { Order, OrderRef } from "@/lib/types";
import { afterResponse } from "@/server/email/after-response";
import { dispatchStatusEmail } from "@/server/email/dispatch";
import { cancelOrderAsCustomer, getOrder } from "@/server/repositories/orders";

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

  const found: Order[] = [];

  for (const ref of refs.slice(0, MAX_REFS)) {
    if (typeof ref?.id !== "string" || typeof ref?.email !== "string") continue;

    const order = await getOrder(ref.id.trim().toUpperCase());
    if (!order) continue;
    if (!order.email) continue;
    if (order.email.toLowerCase() !== ref.email.trim().toLowerCase()) continue;

    found.push(forCustomer(order));
  }

  return found.sort((a, b) => b.placedAt.localeCompare(a.placedAt));
}

/** Single lookup, used by the confirmation page. */
export async function lookupOrder(ref: OrderRef): Promise<Order | null> {
  const [order] = await lookupOrders([ref]);
  return order ?? null;
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

  const order = await getOrder(id);

  /*
   * One message for "no such order" and for "wrong email". Distinguishing them would
   * confirm that a guessed reference exists, which is the enumeration this guards.
   */
  if (!order || !order.email || order.email.toLowerCase() !== email) {
    return { error: "We could not find that order." };
  }

  let cancelled: Order;
  try {
    cancelled = await cancelOrderAsCustomer(id, reason);
  } catch (error) {
    return { error: (error as Error).message };
  }

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

  return { success: "Your order has been cancelled." };
}
