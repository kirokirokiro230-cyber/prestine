import type { Order } from "@/lib/types";
import { cancelEligibility, courierHasCollected } from "@/lib/order-cancellation";
import {
  cancelShipment,
  getDelhiveryClient,
  trackShipment,
} from "@/lib/delhivery";
import { isDelivered, isRTO } from "@/lib/delhivery/utils";
import { announce } from "./notifications";
import { addOrderNote } from "./repositories/orders";
import { getOrderShipments } from "./repositories/shipping";
import { advanceOrder } from "./tracking-sync";

/**
 * Deciding whether a customer may cancel, and unwinding the courier booking when they do.
 *
 * The decision has two layers, deliberately:
 *
 * 1. **Stored state** (`cancelEligibility`) — instant, and what hides the button. It only
 *    changes when the tracking sweep runs, so it can be minutes or hours behind.
 * 2. **The courier, live** — asked at the moment of cancelling. This is the one that
 *    counts, because the window it closes is exactly the dangerous one: the driver has
 *    collected the parcel, the sweep has not run yet, and the page still says
 *    "processing". Relying on stored state alone lets that customer cancel a parcel that
 *    is already moving, which Delhivery bills as a return trip with no freight refund.
 */

export type CancellationCheck =
  | {
      ok: true;
      /** The live forward waybill to cancel with the courier, when one exists. */
      waybill?: string;
    }
  | { ok: false; error: string };

const COLLECTED_MESSAGE =
  "The courier has already collected this parcel, so it can no longer be cancelled online. " +
  "Please contact us and we will arrange a return once it arrives.";

export async function checkCancellable(order: Order): Promise<CancellationCheck> {
  const stored = cancelEligibility(order);
  if (!stored.allowed) return { ok: false, error: stored.reason };

  const shipments = await getOrderShipments(order.id);
  const forward = shipments.find((shipment) => shipment.shipment_type === "forward");

  // No shipment booked yet (payment pending, or manifestation failed): nothing is with
  // the courier, so the stored answer is complete.
  if (!forward) return { ok: true };

  // The recorded pickup time outranks everything, including a live lookup that fails.
  if (forward.picked_up_at) return { ok: false, error: COLLECTED_MESSAGE };

  try {
    const tracking = await trackShipment(getDelhiveryClient(), forward.waybill);
    const shipment = tracking.ShipmentData?.[0]?.Shipment;

    if (shipment) {
      const status = shipment.Status?.Status ?? "";
      const statusCode = shipment.Status?.StatusCode ?? "";

      const collected = courierHasCollected({
        pickedUp: Boolean(shipment.PickedupDate),
        status,
      });

      if (collected) {
        /*
         * Bring the stored order up to date while we have the truth in hand. Otherwise
         * the customer is told "already collected" but their page still offers the
         * button until the next sweep, and the confirmation email for pickup is late.
         * Best effort: the refusal below does not depend on it.
         */
        await advanceOrder(order.id, {
          pickedUp: true,
          delivered: Boolean(shipment.DeliveryDate) || isDelivered(statusCode),
          rto: isRTO(statusCode) || isRTO(status),
        }).catch((error) =>
          console.error(`[cancel] could not sync ${order.id} after live check:`, error),
        );

        return { ok: false, error: COLLECTED_MESSAGE };
      }
    }
  } catch (error) {
    /*
     * Fail closed. If the courier cannot be asked, the stored state says "not collected"
     * but that is exactly the answer that goes stale, and the cost of being wrong is a
     * return-freight charge on a parcel the shop never agreed to pull back. A customer
     * who is told to retry in a minute loses nothing; one who cancels a moving parcel
     * costs money.
     */
    console.error(`[cancel] could not confirm courier state for ${order.id}:`, error);
    return {
      ok: false,
      error:
        "We could not confirm the parcel's status with the courier just now. " +
        "Please try again in a few minutes, or contact us.",
    };
  }

  return { ok: true, waybill: forward.waybill };
}

/**
 * Cancel the courier booking after an order has been cancelled.
 *
 * Without this the waybill stays live: the driver can still collect the parcel, and for
 * a COD order the courier would try to take cash for something the customer cancelled.
 *
 * Never throws and never undoes the cancellation. The order is already cancelled and the
 * customer has been told so; if the courier will not confirm, the honest outcome is a
 * note on the order that staff cannot miss, because the alternative — a parcel nobody
 * knows to stop — is worse than the cancellation looking slightly untidy.
 */
export async function cancelCourierBooking(
  orderId: string,
  waybill: string | undefined,
): Promise<void> {
  if (!waybill) return;

  try {
    const result = await cancelShipment(getDelhiveryClient(), waybill);

    if (result.success) {
      await addOrderNote(orderId, `Courier booking ${waybill} cancelled with Delhivery.`);
      return;
    }

    await addOrderNote(
      orderId,
      `ACTION NEEDED: customer cancelled, but Delhivery did not confirm cancelling waybill ` +
        `${waybill} (${result.message}). Cancel it in the Delhivery One portal before pickup.`,
    );
    // A note on the order is easy to miss; a live waybill for a cancelled order is not.
    await announce.courierCancelFailed(orderId, waybill, result.message);
  } catch (error) {
    console.error(`[cancel] could not cancel waybill ${waybill} for ${orderId}:`, error);

    await addOrderNote(
      orderId,
      `ACTION NEEDED: customer cancelled, but cancelling waybill ${waybill} with Delhivery ` +
        `failed. Cancel it in the Delhivery One portal before pickup.`,
    ).catch((noteError) => console.error("[cancel] could not record the note:", noteError));

    await announce.courierCancelFailed(
      orderId,
      waybill,
      error instanceof Error ? error.message : "Delhivery could not be reached.",
    );
  }
}
