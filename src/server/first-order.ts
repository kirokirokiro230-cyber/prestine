import { parseFirstOrderStatus, type FirstOrderStatus } from "@/lib/first-order";
import type { FirstOrderClaimRow } from "./database.types";
import { callRpc, db } from "./supabase";

/**
 * The first-order discount, as the database sees it.
 *
 * Every rule lives in `supabase/migrations/00000000000021_first_order_discount.sql`, under
 * a lock, because "once per person" has to hold when two checkouts race. This file asks
 * and relays; it decides nothing.
 *
 * ## Failing closed
 *
 * Every function here answers "no discount" when it cannot get an answer: the call
 * failed, the database is down, migration 21 has not been run. The cost of a wrong "no" is
 * one customer paying full price and being told why; the cost of a wrong "yes" is the
 * discount given again, every time the check breaks. They are not comparable.
 */

/** Whether these identity keys may still use the discount. Never throws. */
export async function firstOrderStatus(
  keys: string[],
  orderId?: string,
): Promise<FirstOrderStatus> {
  try {
    const { data, error } = await callRpc(db(), "first_order_discount_status", {
      p_keys: keys,
      p_order_id: orderId ?? null,
    });

    if (error) throw new Error(error.message);
    return parseFirstOrderStatus(data);
  } catch (error) {
    // Message only. The keys contain an email address and phone numbers.
    console.error("[first-order] could not check eligibility:", (error as Error).message);
    return { kind: "unavailable" };
  }
}

/**
 * Claim the discount for an order that is about to be placed.
 *
 * Returns `available` when this order now holds it, or the reason it could not: used,
 * held by another unpaid order, not a first order, or `unavailable` if the claim could not
 * be made at all. Either way, only `available` may go on to price the order with it.
 */
export async function claimFirstOrder(
  keys: string[],
  orderId: string,
  discount: number,
): Promise<FirstOrderStatus> {
  try {
    const { data, error } = await callRpc(db(), "claim_first_order_discount", {
      p_keys: keys,
      p_order_id: orderId,
      p_discount: discount,
    });

    if (error) throw new Error(error.message);

    // `claimed` is the only success. `parseFirstOrderStatus` also maps a bare "available"
    // to eligible, which is right for a read but is not a claim, so it is checked here.
    if (data !== "claimed") {
      const parsed = parseFirstOrderStatus(data);
      return parsed.kind === "available" ? { kind: "unavailable" } : parsed;
    }

    return { kind: "available" };
  } catch (error) {
    console.error("[first-order] could not claim the discount:", (error as Error).message);
    return { kind: "unavailable" };
  }
}

/**
 * Give the claim back after a checkout that failed before the order was recorded.
 * Best effort and never throws: if it fails, the claim frees itself after ten minutes.
 */
export async function releaseFirstOrder(orderId: string): Promise<void> {
  try {
    const { error } = await callRpc(db(), "release_first_order_claim", { p_order_id: orderId });
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error(
      `[first-order] could not release the claim for ${orderId}:`,
      (error as Error).message,
    );
  }
}

/**
 * Whether an order was priced with the first-order discount, for the admin order page.
 * `false` on any failure: it only decides a label.
 */
export async function orderUsedFirstOrderDiscount(orderId: string): Promise<boolean> {
  try {
    const { data, error } = await db()
      .from("first_order_claims")
      .select("order_id")
      .eq("order_id", orderId)
      .maybeSingle()
      .overrideTypes<Pick<FirstOrderClaimRow, "order_id">, { merge: false }>();

    if (error) return false;
    return Boolean(data);
  } catch {
    return false;
  }
}
