"use server";

import { deliveryWindow } from "@/lib/format";
import { getSettings } from "@/server/repositories/settings";
import { checkPincode, isValidPincode } from "@/server/delhivery";

/**
 * "When will it reach me?" for the product page.
 *
 * Two independent answers, deliberately kept apart:
 *
 * - **Serviceability** comes from Delhivery, and only if a token is configured.
 * - **The date** comes from `settings.deliveryDaysMin/Max`, always. Delhivery's B2C API
 *   has no delivery-estimate endpoint, so presenting their answer as an ETA would mean
 *   attributing our own number to the courier.
 *
 * The result therefore always carries a date, and carries a serviceability claim only
 * when one was actually established.
 */

export interface DeliveryEstimateState {
  error?: string;
  result?: {
    pincode: string;
    /** e.g. "Tue 3 – Thu 5 March". Always present. */
    window: string;
    daysMin: number;
    daysMax: number;
    /** Undefined when serviceability could not be established or is not configured. */
    serviceable?: boolean;
    place?: string;
    cashOnDelivery?: boolean;
    /** True when the courier was not consulted, so the UI can stay honest about it. */
    estimateOnly: boolean;
  };
}

export async function estimateDeliveryAction(
  _previous: DeliveryEstimateState,
  formData: FormData,
): Promise<DeliveryEstimateState> {
  const pincode = String(formData.get("pincode") ?? "").trim();

  if (!pincode) return { error: "Enter a PIN code." };
  if (!isValidPincode(pincode)) {
    return { error: "Enter a valid 6-digit PIN code." };
  }

  const [settings, service] = await Promise.all([getSettings(), checkPincode(pincode)]);

  const daysMin = settings.deliveryDaysMin;
  const daysMax = settings.deliveryDaysMax;

  // A definite "we do not deliver there" is the only case that suppresses the date.
  if (service.configured && service.serviceable === false) {
    return {
      result: {
        pincode,
        window: "",
        daysMin,
        daysMax,
        serviceable: false,
        estimateOnly: false,
      },
    };
  }

  const place = [service.city, service.state].filter(Boolean).join(", ") || undefined;

  return {
    result: {
      pincode,
      window: deliveryWindow(daysMin, daysMax),
      daysMin,
      daysMax,
      // Only claimed when actually established — "unknown" leaves this undefined.
      serviceable: service.serviceable === true ? true : undefined,
      place,
      cashOnDelivery: service.cashOnDelivery,
      estimateOnly: !service.configured || service.serviceable === "unknown",
    },
  };
}
