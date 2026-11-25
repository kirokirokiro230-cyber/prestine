/**
 * Pincode Serviceability Check
 *
 * Check if Delhivery delivers to a specific pincode and what services are available
 * (Prepaid, COD, Reverse Pickup).
 *
 * Note: `src/server/delhivery.ts` answers the same question for the storefront's
 * product-page pincode box, and fails open so a courier outage never tells a
 * shopper we do not deliver to them. This module is the admin/ops-side
 * equivalent and reports errors rather than swallowing them.
 */

import type { DelhiveryClient } from '../client';
import type {
  DelhiveryServiceabilityData,
  DelhiveryServiceabilityResponse,
} from '../types';
import { isValidPincode } from '../utils/validator';
import { withErrorHandling } from '../utils/error-handler';

/**
 * Delhivery's serviceability path. Not `/api/c/plus/json/`, which 404s.
 */
const SERVICEABILITY_PATH = '/c/api/pin-codes/json/';

/**
 * Check if a pincode is serviceable by Delhivery
 */
export async function checkServiceability(
  client: DelhiveryClient,
  pincode: string
): Promise<DelhiveryServiceabilityResponse> {
  if (!isValidPincode(pincode)) {
    throw new Error(`Invalid pincode format: ${pincode}`);
  }

  return client.get<DelhiveryServiceabilityResponse>(SERVICEABILITY_PATH, {
    filter_codes: pincode,
  });
}

/**
 * Check multiple pincodes at once
 */
export async function checkMultipleServiceability(
  client: DelhiveryClient,
  pincodes: string[]
): Promise<DelhiveryServiceabilityResponse> {
  const invalidPincodes = pincodes.filter((pin) => !isValidPincode(pin));
  if (invalidPincodes.length > 0) {
    throw new Error(`Invalid pincodes: ${invalidPincodes.join(', ')}`);
  }

  return client.get<DelhiveryServiceabilityResponse>(SERVICEABILITY_PATH, {
    filter_codes: pincodes.join(','),
  });
}

/**
 * Pull the flags for a pincode out of the nested response shape.
 *
 * An empty `delivery_codes` array is a definite "not served", not a failure —
 * Delhivery returns no entry for a pincode outside its network.
 */
function firstEntry(
  response: DelhiveryServiceabilityResponse
): DelhiveryServiceabilityData | undefined {
  return response.delivery_codes?.[0]?.postal_code;
}

/**
 * Check if a pincode supports COD
 */
export async function isCodAvailable(
  client: DelhiveryClient,
  pincode: string
): Promise<boolean> {
  const entry = firstEntry(await checkServiceability(client, pincode));
  return entry?.cod === 'Y';
}

/**
 * Check if a pincode supports Prepaid delivery
 */
export async function isPrepaidAvailable(
  client: DelhiveryClient,
  pincode: string
): Promise<boolean> {
  const entry = firstEntry(await checkServiceability(client, pincode));
  return entry?.pre_paid === 'Y';
}

/**
 * Check if reverse pickup is available from a pincode
 */
export async function isReversePickupAvailable(
  client: DelhiveryClient,
  pincode: string
): Promise<boolean> {
  const entry = firstEntry(await checkServiceability(client, pincode));
  return entry?.pickup === 'Y';
}

/**
 * Get complete serviceability info for a pincode
 */
export interface ServiceabilityInfo {
  pincode: string;
  serviceable: boolean;
  prepaid: boolean;
  cod: boolean;
  reversePickup: boolean;
  /** Out of Delivery Area — serviceable, but may carry a surcharge. */
  isOda: boolean;
  /** Place names Delhivery holds for the pincode, useful for sanity checks. */
  district?: string;
  state?: string;
}

export async function getServiceabilityInfo(
  client: DelhiveryClient,
  pincode: string
): Promise<ServiceabilityInfo> {
  const entry = firstEntry(await checkServiceability(client, pincode));

  if (!entry) {
    return {
      pincode,
      serviceable: false,
      prepaid: false,
      cod: false,
      reversePickup: false,
      isOda: false,
    };
  }

  return {
    pincode: String(entry.pin ?? pincode),
    serviceable: entry.pre_paid === 'Y' || entry.cod === 'Y',
    prepaid: entry.pre_paid === 'Y',
    cod: entry.cod === 'Y',
    reversePickup: entry.pickup === 'Y',
    isOda: entry.is_oda === 'Y',
    district: entry.district?.trim() || undefined,
    state: entry.state_code?.trim() || undefined,
  };
}

// Wrap exports with error handling
export const checkServiceabilityWithErrorHandling = withErrorHandling(
  checkServiceability,
  'checkServiceability'
);

export const getServiceabilityInfoWithErrorHandling = withErrorHandling(
  getServiceabilityInfo,
  'getServiceabilityInfo'
);
