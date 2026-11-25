import type { Order } from "./types";

/**
 * When a customer may still cancel an order.
 *
 * One rule, used by the "Cancel order" button and by the server action behind it, so
 * the page never offers something the server then refuses and the two cannot drift.
 *
 * ## The rule
 *
 * Cancellable only while the courier has **not collected** the parcel. Once it has,
 * stopping it is no longer a button: Delhivery refunds freight only for a parcel
 * cancelled before pickup, and charges the return trip for one pulled back while in
 * transit, so a self-service cancel after pickup would cost the shop money on a
 * decision it never saw.
 *
 * ## Why "collected" is a whitelist of the early states
 *
 * Delhivery's status text is theirs, not ours, and it has more values than anyone
 * documents. The safe direction to be wrong in is *hiding* the button: a customer who
 * cannot cancel emails us, whereas one who can cancel a parcel that is already moving
 * costs real money. So only the statuses known to mean "not collected yet" keep the
 * button; anything else, including text we have never seen, counts as collected.
 */

/**
 * Courier statuses that mean the parcel is still at the seller.
 *
 * Matched as phrases. "pending" is deliberately only accepted as the whole value: it is
 * the status `create_shipment` writes before the first tracking poll, but a parcel that
 * has really been picked up can also read "Pending" (delivery attempted and not
 * completed). Pickup is told apart from that by `pickedUp`, below, never by this word.
 */
const NOT_COLLECTED = [
  /^pending$/,
  /^open$/,
  /manifest/,
  /not picked/,
  /pickup (pending|scheduled|requested|awaited)/,
  /awaiting pickup/,
  /ready (to ship|for pickup)/,
  /^scheduled$/,
];

/**
 * Has the courier taken the parcel from the seller?
 *
 * `pickedUp` is a recorded pickup time and outranks any status text: a parcel with a
 * pickup date is collected whatever it currently says.
 */
export function courierHasCollected(input: {
  pickedUp?: boolean;
  status?: string | null;
}): boolean {
  if (input.pickedUp) return true;

  const status = (input.status ?? "").trim().toLowerCase();

  // No status at all means no shipment has been tracked yet, so nothing was collected.
  if (!status) return false;

  return !NOT_COLLECTED.some((pattern) => pattern.test(status));
}

export type CancelEligibility =
  | { allowed: true }
  | { allowed: false; reason: string; /** Worth telling the customer why, vs. staying silent. */ explain: boolean };

/**
 * Whether an order can be cancelled, from what is stored on it.
 *
 * Stored fields only change when the tracking sweep runs, so this can lag the courier by
 * the sweep interval. It is what the button is hidden by. The server action repeats the
 * question against Delhivery live, in `src/server/order-cancellation.ts`, and that
 * answer is the one that counts.
 */
export function cancelEligibility(
  order: Pick<Order, "status" | "shippingStatus" | "shippedAt">,
): CancelEligibility {
  switch (order.status) {
    case "cancelled":
      return { allowed: false, reason: "This order has already been cancelled.", explain: false };

    case "delivered":
      return {
        allowed: false,
        reason: "This order has been delivered. You can return it instead.",
        explain: false,
      };

    case "shipped":
      return {
        allowed: false,
        reason:
          "The courier has collected this parcel, so it can no longer be cancelled online.",
        explain: true,
      };

    case "processing":
      break;
  }

  if (courierHasCollected({ pickedUp: Boolean(order.shippedAt), status: order.shippingStatus })) {
    return {
      allowed: false,
      reason:
        "The courier has collected this parcel, so it can no longer be cancelled online.",
      explain: true,
    };
  }

  return { allowed: true };
}
