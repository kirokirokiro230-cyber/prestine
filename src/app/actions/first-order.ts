"use server";

import { identityKeys, type FirstOrderStatus } from "@/lib/first-order";
import { currentCustomer } from "@/server/customer-session";
import { firstOrderStatus } from "@/server/first-order";
import { getSettings } from "@/server/repositories/settings";

/**
 * What the cart should tell this shopper about the first-order discount.
 *
 * Display only. It lets the bag and checkout show "10% off your first order" before the
 * button is pressed, so the total on screen is the total charged. Nothing is claimed here
 * and nothing it says is trusted: `placeOrder` asks the database again at the moment of
 * ordering, under a lock, and is the only place the discount is ever given.
 *
 * ## Why the answer is a small fixed set of states
 *
 * The page needs to know what to say, not why the database thinks so. Returning the status
 * itself would hand a signed-in shopper a way to probe which of their details matched
 * someone else's earlier order. It is only ever about the signed-in customer's own account,
 * with what the account itself holds (id and verified phone), never the email or number
 * typed at checkout.
 */
export type FirstOrderOffer =
  /** No offer is running. */
  | { kind: "off" }
  /** There is an offer, and the shopper is not signed in to claim it. */
  | { kind: "sign-in"; percent: number }
  /** This shopper has it to use. */
  | { kind: "eligible"; percent: number }
  /** On an unpaid order of theirs. */
  | { kind: "held"; percent: number; orderId: string }
  /** Used, or not a first order, or it could not be checked: nothing to show. */
  | { kind: "none" };

export async function getFirstOrderOffer(): Promise<FirstOrderOffer> {
  try {
    const settings = await getSettings();
    const percent = settings.firstOrderDiscountPercent;
    if (!percent || percent <= 0) return { kind: "off" };

    const customer = await currentCustomer();
    if (!customer) return { kind: "sign-in", percent };

    /*
     * No rate limit, deliberately. Only a signed-in shopper gets past this point, the
     * answer is about their own account, and the limiter itself writes a row per call,
     * which would cost more than the query it protects on a page that asks as you browse.
     */
    const status: FirstOrderStatus = await firstOrderStatus(
      identityKeys({ customerId: customer.id, accountPhone: customer.phone }),
    );

    switch (status.kind) {
      case "available":
        return { kind: "eligible", percent };
      case "held":
        return { kind: "held", percent, orderId: status.orderId };
      default:
        return { kind: "none" };
    }
  } catch (error) {
    console.error("[first-order] could not work out the offer:", (error as Error).message);
    return { kind: "none" };
  }
}
