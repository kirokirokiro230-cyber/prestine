"use server";

/**
 * Shipping Actions
 *
 * Server actions for creating shipments, tracking orders, and managing returns.
 */

import { revalidatePath } from "next/cache";
import {
  getDelhiveryClient,
  getDetailedTrackingInfo,
  createReversePickup,
  getServiceabilityInfo,
  calculateShippingRate,
  type DetailedTrackingInfo,
  type ServiceabilityInfo,
  type ShippingRate,
  type CalculateRateInput,
} from "@/lib/delhivery";
import {
  createShipment as createShipmentInDb,
  getOrderShipments,
  createReturn as createReturnInDb,
  getOrderReturns,
  updateReturnStatus,
  getDefaultPickupLocation,
} from "@/server/repositories/shipping";
import { getOrder } from "@/server/repositories/orders";
import { getSettings } from "@/server/repositories/settings";
import { afterResponse } from "@/server/email/after-response";
import { announce } from "@/server/notifications";
import { returnEligibility } from "@/lib/returns";
import { getUserFriendlyError } from "@/lib/delhivery/utils";
import { isValidPincode, isValidWaybill } from "@/lib/delhivery/utils";
import { PermissionError, requirePermission } from "@/server/session";
import { LIMITS, consumeIpRateLimit, rateLimitMessage } from "@/server/rate-limit";
import {
  manifestShipmentForOrder,
  type ManifestShipmentResult,
} from "@/server/shipping-service";

// ---------------------------------------------------------------------------
// Shipment Creation
// ---------------------------------------------------------------------------

export type CreateShipmentForOrderResult = ManifestShipmentResult;

/**
 * Manifest a shipment for an order, from the admin panel.
 *
 * The work itself lives in `src/server/shipping-service.ts`, because the
 * webhook and payment-reconciliation paths also need it and run without a
 * session. This is the staff-facing door onto it, and it is gated: manifesting
 * spends money from the Delhivery wallet.
 */
export async function createShipmentForOrder(
  orderId: string
): Promise<CreateShipmentForOrderResult> {
  try {
    await requirePermission("orders:write");
  } catch (error) {
    if (error instanceof PermissionError) return { ok: false, error: error.message };
    throw error;
  }

  const result = await manifestShipmentForOrder(orderId);

  if (result.ok) {
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath("/admin/shipments");
  }

  return result;
}

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------

export type GetOrderTrackingResult =
  | { ok: true; tracking: DetailedTrackingInfo }
  | { ok: false; error: string };

/**
 * Get tracking information for an order
 */
export async function getOrderTracking(
  orderId: string
): Promise<GetOrderTrackingResult> {
  try {
    // Tracking carries the consignee's name and delivery history, so this is
    // staff-only. A customer-facing version must go through the claim-ticket
    // check in `src/app/actions/orders.ts`, not this.
    await requirePermission("orders:write");

    const shipments = await getOrderShipments(orderId);

    if (shipments.length === 0) {
      return {
        ok: false,
        error: "No shipment found for this order",
      };
    }

    // Get tracking for first (primary) shipment
    const shipment = shipments[0];
    const client = getDelhiveryClient();
    const tracking = await getDetailedTrackingInfo(client, shipment.waybill);

    if (!tracking) {
      return {
        ok: false,
        error: "Tracking information not available",
      };
    }

    return {
      ok: true,
      tracking,
    };
  } catch (error) {
    if (error instanceof PermissionError) return { ok: false, error: error.message };
    console.error("Get tracking error:", error);
    return {
      ok: false,
      error: getUserFriendlyError(error),
    };
  }
}

/**
 * Get tracking by waybill
 */
export async function getTrackingByWaybill(
  waybill: string
): Promise<GetOrderTrackingResult> {
  try {
    /*
     * A waybill alone is not proof of ownership, so without a gate this would
     * return any consignee's details to anyone who supplied a number. Staff
     * only.
     */
    await requirePermission("orders:write");

    if (!isValidWaybill(waybill)) {
      return { ok: false, error: "That does not look like a valid waybill." };
    }

    const client = getDelhiveryClient();
    const tracking = await getDetailedTrackingInfo(client, waybill);

    if (!tracking) {
      return {
        ok: false,
        error: "Tracking information not available",
      };
    }

    return {
      ok: true,
      tracking,
    };
  } catch (error) {
    if (error instanceof PermissionError) return { ok: false, error: error.message };
    console.error("Get tracking by waybill error:", error);
    return {
      ok: false,
      error: getUserFriendlyError(error),
    };
  }
}

// ---------------------------------------------------------------------------
// Returns
// ---------------------------------------------------------------------------

export type CreateReturnResult =
  | { ok: true; returnId: string; waybill?: string }
  | { ok: false; error: string };

/**
 * Create a return request
 */
export async function createReturnRequest(
  orderId: string,
  reason: string,
  notes?: string
): Promise<CreateReturnResult> {
  try {
    /*
     * Staff-only for now. When customers can raise their own returns, that
     * path needs the id-plus-email claim ticket `lookupOrders` enforces — an
     * order id on its own is short and enumerable.
     */
    await requirePermission("orders:write");

    // Verify order exists
    const order = await getOrder(orderId);
    if (!order) {
      return { ok: false, error: "Order not found" };
    }

    /*
     * The returns window, enforced.
     *
     * This is the only place the policy is actually applied. Until now the window
     * was quoted in a dozen pieces of copy — terms, FAQ, the footer, the delivered
     * email — and checked nowhere, so a return raised a year after delivery would
     * have been created without complaint.
     *
     * Checked before the duplicate-return lookup so an out-of-window request gets
     * the reason it was refused rather than an unrelated message, and before the
     * database write so nothing is created that policy says cannot exist.
     *
     * Staff see the refusal rather than being able to override it: an override that
     * is indistinguishable from a normal return leaves no record of the decision.
     * If goodwill exceptions are wanted, they belong behind their own explicit flag.
     */
    const settings = await getSettings();
    const eligibility = returnEligibility(order, settings.returnWindowHours);
    if (!eligibility.eligible) {
      return { ok: false, error: eligibility.reason };
    }

    // Check if return already exists
    const existingReturns = await getOrderReturns(orderId);
    const activeReturn = existingReturns.find(
      (r) => !["cancelled", "refunded"].includes(r.status)
    );

    if (activeReturn) {
      return {
        ok: false,
        error: "A return request already exists for this order",
      };
    }

    // Create return in database
    const created = await createReturnInDb({
      orderId,
      reason,
      notes,
    });

    if (!created.ok) {
      return {
        ok: false,
        error:
          created.reason === "duplicate"
            ? "A return request already exists for this order"
            : "Failed to create return request",
      };
    }

    const returnRecord = created.value;

    // Tell the rest of the team. The person who raised it already knows; the others do not.
    afterResponse(() => announce.returnRequested(order, reason, returnRecord.id));

    // Revalidate paths
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath("/admin/returns");

    return {
      ok: true,
      returnId: returnRecord.id,
    };
  } catch (error) {
    if (error instanceof PermissionError) return { ok: false, error: error.message };
    console.error("Create return error:", error);
    return {
      ok: false,
      error: getUserFriendlyError(error),
    };
  }
}

/**
 * Approve return and create reverse pickup
 */
export async function approveReturn(
  returnId: string
): Promise<CreateReturnResult> {
  try {
    // Books a reverse pickup with Delhivery, so this spends money too.
    await requirePermission("orders:write");

    const returnRecord = await import("@/server/repositories/shipping").then(
      (m) => m.getReturn(returnId)
    );

    if (!returnRecord) {
      return { ok: false, error: "Return not found" };
    }

    const order = await getOrder(returnRecord.order_id);
    if (!order) {
      return { ok: false, error: "Order not found" };
    }

    // Get pickup location
    const pickupLocation = await getDefaultPickupLocation();
    if (!pickupLocation) {
      return { ok: false, error: "No pickup location configured" };
    }

    // Use postalCode from address
    const pincode = order.shippingAddress.postalCode || "";

    const cleanPhone = order.shippingAddress.phone
      .replace(/\D/g, '')
      .replace(/^91/, '')
      .substring(0, 10);

    // Create reverse pickup shipment
    const client = getDelhiveryClient();
    const response = await createReversePickup(client, {
      orderId: order.id,
      customerName: order.shippingAddress.name,
      customerAddress: order.shippingAddress.line1,
      customerCity: order.shippingAddress.city,
      customerState: order.shippingAddress.region,
      customerPincode: pincode,
      customerPhone: cleanPhone,
      orderNumber: `${order.id}-RVP`,
      totalAmount: order.totals.total,
      productDescription: "Return: " + order.lines.map((l) => l.name).join(", "),
      hsnCode: "610910",
      quantity: order.lines.reduce((sum, l) => sum + l.quantity, 0),
      weightGrams: 500,
      pickupLocation: pickupLocation.name,
      sellerGstTin: process.env.SELLER_GST_TIN || "27AABCU9603R1ZM",
      returnToAddress: {
        name: pickupLocation.name,
        address: pickupLocation.address,
        city: pickupLocation.city,
        state: pickupLocation.state,
        pincode: pickupLocation.pincode,
        phone: pickupLocation.phone,
      },
    });

    if (!response.success || !response.packages || response.packages.length === 0) {
      return {
        ok: false,
        error: response.rmk || "Failed to create reverse pickup",
      };
    }

    const waybill = response.packages[0].waybill;

    // Create shipment record
    const shipment = await createShipmentInDb({
      orderId: order.id,
      waybill,
      shipmentType: "reverse",
      paymentMode: "pickup",
      weightGrams: 500,
      codAmount: 0,
      rawResponse: response,
    });

    if (!shipment) {
      return { ok: false, error: "Failed to store shipment" };
    }

    // Update return status
    await updateReturnStatus(returnId, "approved", {
      shippingInfoId: shipment.id,
    });

    revalidatePath(`/admin/returns/${returnId}`);
    revalidatePath("/admin/returns");

    return {
      ok: true,
      returnId,
      waybill,
    };
  } catch (error) {
    if (error instanceof PermissionError) return { ok: false, error: error.message };
    console.error("Approve return error:", error);
    return {
      ok: false,
      error: getUserFriendlyError(error),
    };
  }
}

// ---------------------------------------------------------------------------
// Serviceability & Pricing
// ---------------------------------------------------------------------------

export type CheckServiceabilityResult =
  | { ok: true; info: ServiceabilityInfo }
  | { ok: false; error: string };

/**
 * Check if we deliver to a pincode
 */
export async function checkPincodeServiceability(
  pincode: string
): Promise<CheckServiceabilityResult> {
  /*
   * Deliberately open: a shopper checking whether we deliver to them has no
   * session, and the answer discloses nothing about anyone. The format check is
   * what stops it being used as an arbitrary proxy onto the Delhivery account.
   *
   * The storefront's own pincode box uses `src/server/delhivery.ts` instead,
   * which fails open so a courier outage never tells a shopper we do not
   * deliver to them.
   */
  if (!isValidPincode(pincode)) {
    return { ok: false, error: "Enter a valid 6-digit PIN code." };
  }

  // Each accepted lookup spends our Delhivery quota, so it is bounded per caller.
  const limited = await consumeIpRateLimit("pincode", LIMITS.pincodeLookup);
  if (limited) return { ok: false, error: rateLimitMessage(limited) };

  try {
    const client = getDelhiveryClient();
    const info = await getServiceabilityInfo(client, pincode);

    return {
      ok: true,
      info,
    };
  } catch (error) {
    console.error("Check serviceability error:", error);
    return {
      ok: false,
      error: getUserFriendlyError(error),
    };
  }
}

export type CalculateShippingResult =
  | { ok: true; rate: ShippingRate }
  | { ok: false; error: string };

/**
 * Calculate shipping cost
 */
export async function calculateShipping(
  input: CalculateRateInput
): Promise<CalculateShippingResult> {
  try {
    /*
     * Gated for two reasons: the quote exposes our negotiated courier rates,
     * and `input` is a caller-supplied object passed through to Delhivery.
     */
    await requirePermission("orders:write");

    if (!isValidPincode(input?.originPincode) || !isValidPincode(input?.destinationPincode)) {
      return { ok: false, error: "Both PIN codes must be 6 digits." };
    }

    if (!Number.isFinite(input?.weightGrams) || input.weightGrams <= 0) {
      return { ok: false, error: "Weight must be a positive number of grams." };
    }

    const client = getDelhiveryClient();
    const rate = await calculateShippingRate(client, input);

    return {
      ok: true,
      rate,
    };
  } catch (error) {
    if (error instanceof PermissionError) return { ok: false, error: error.message };
    console.error("Calculate shipping error:", error);
    return {
      ok: false,
      error: getUserFriendlyError(error),
    };
  }
}
