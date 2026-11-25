/**
 * Shipment manifestation, as a server-only service.
 *
 * ## Why this is not a server action
 *
 * Manifesting allocates an AWB with Delhivery and debits the account wallet, so
 * it must never be reachable by an anonymous caller. Every export of a
 * `"use server"` module is an individually invocable HTTP endpoint, which makes
 * an action file the wrong home for an operation that spends money.
 *
 * It also has two callers with different authority:
 *
 * - the Cashfree webhook and `reconcilePayment`, which run with no session at
 *   all because the authority is the verified payment, not a user
 * - staff in the admin panel, whose authority is `orders:write`
 *
 * So the operation lives here, unguarded and un-exported to the network, and
 * `src/app/actions/shipping.ts` wraps it in a `requirePermission` gate for the
 * admin path. Gating this function itself would break automatic manifestation,
 * since a webhook has no admin session to present.
 */

import {
  getDelhiveryClient,
  createShipment as createDelhiveryShipment,
} from "@/lib/delhivery";
import { buildShipmentInput } from "@/lib/delhivery/build-shipment";
import { getUserFriendlyError } from "@/lib/delhivery/utils";
import { announce } from "@/server/notifications";
import { getOrder } from "@/server/repositories/orders";
import {
  createShipment as createShipmentInDb,
  getOrderShipments,
  getDefaultPickupLocation,
} from "@/server/repositories/shipping";

export type ManifestShipmentResult =
  | { ok: true; waybill: string; trackingUrl: string }
  | { ok: false; error: string };

/**
 * Manifest a Delhivery shipment for an order.
 *
 * Callers are responsible for authorisation. Never export this from a
 * `"use server"` module.
 */
export async function manifestShipmentForOrder(
  orderId: string,
): Promise<ManifestShipmentResult> {
  try {
    const order = await getOrder(orderId);
    if (!order) {
      return { ok: false, error: "Order not found" };
    }

    /*
     * Never spend wallet money on goods that have not been paid for.
     *
     * This function books a courier and debits the Delhivery account, and every caller
     * used to be trusted to have checked first. Three callers pass a verified payment,
     * which is why it worked — but the fourth, the admin "create shipment" button, did
     * not, and nothing here stopped a prepaid order still in `pending` from shipping.
     * Checked at the point the money is spent so it holds however this is reached.
     *
     * COD is allowed unpaid: the cash arrives with the courier by design.
     */
    if (order.status === "cancelled") {
      return { ok: false, error: "That order was cancelled, so it cannot be shipped." };
    }
    if (order.paymentMethod !== "cod" && order.paymentStatus !== "paid") {
      return {
        ok: false,
        error: "That order has not been paid for yet, so it cannot be shipped.",
      };
    }

    /*
     * Guards against double-manifesting, which would pull a second AWB and
     * charge twice. The unique constraint on `shipping_info.order_id` is the
     * backstop; this is the cheap check that avoids provoking it.
     */
    const existingShipments = await getOrderShipments(orderId);
    if (existingShipments.length > 0) {
      return { ok: false, error: "Shipment already exists for this order" };
    }

    const pickupLocation = await getDefaultPickupLocation();
    if (!pickupLocation) {
      const error = "No default pickup location configured";
      await announce.shipmentFailed(order.id, error);
      return { ok: false, error };
    }

    const shipmentInput = buildShipmentInput(order, pickupLocation);

    const client = getDelhiveryClient();
    const response = await createDelhiveryShipment(client, shipmentInput);

    if (!response.success || !response.packages || response.packages.length === 0) {
      const error = response.rmk || "Failed to create shipment with Delhivery";
      await announce.shipmentFailed(order.id, error);
      return { ok: false, error };
    }

    const waybill = response.packages[0].waybill;

    await createShipmentInDb({
      orderId: order.id,
      waybill,
      shipmentType: "forward",
      paymentMode: shipmentInput.paymentMode === "COD" ? "cod" : "prepaid",
      weightGrams: shipmentInput.weightGrams,
      codAmount: shipmentInput.codAmount || 0,
      shippingCharges: order.totals.shipping,
      rawResponse: response,
    });

    return {
      ok: true,
      waybill,
      trackingUrl: `https://www.delhivery.com/track/package/${waybill}`,
    };
  } catch (error) {
    console.error("[delhivery] manifest failed:", error);
    const friendly = getUserFriendlyError(error);
    // The one that matters most: an empty Delhivery wallet surfaces here, and it stops
    // EVERY order shipping until someone tops it up.
    await announce.shipmentFailed(orderId, friendly);
    return { ok: false, error: friendly };
  }
}
