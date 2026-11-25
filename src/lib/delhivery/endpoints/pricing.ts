/**
 * Shipping Rate Calculation
 *
 * Calculate shipping costs based on origin, destination, weight, and payment mode.
 */

import type { DelhiveryClient } from '../client';
import type { DelhiveryRateRequest, DelhiveryRateResponse } from '../types';
import { isValidPincode, getChargeableWeight } from '../utils/validator';
import { withErrorHandling } from '../utils/error-handler';

export interface CalculateRateInput {
  originPincode: string;
  destinationPincode: string;
  weightGrams: number;
  paymentMode: 'Prepaid' | 'COD';
  codAmount?: number;
  shippingMode?: 'Surface' | 'Express';
  dimensions?: {
    length: number;
    width: number;
    height: number;
  };
}

/** All amounts are minor units (paise), matching the rest of the codebase. */
export interface ShippingRate {
  totalAmount: number;
  freightCharges: number;
  codCharges: number;
  otherCharges: number;
  currency: string;
}

/**
 * Calculate shipping rate for a shipment
 */
export async function calculateShippingRate(
  client: DelhiveryClient,
  input: CalculateRateInput
): Promise<ShippingRate> {
  // Validate pincodes
  if (!isValidPincode(input.originPincode)) {
    throw new Error(`Invalid origin pincode: ${input.originPincode}`);
  }
  if (!isValidPincode(input.destinationPincode)) {
    throw new Error(`Invalid destination pincode: ${input.destinationPincode}`);
  }

  // Calculate chargeable weight (including volumetric if dimensions provided)
  const chargeableWeight = input.dimensions
    ? getChargeableWeight(
        input.weightGrams,
        input.dimensions.length,
        input.dimensions.width,
        input.dimensions.height
      )
    : input.weightGrams;

  // Build the query. This endpoint is a GET with query parameters, not a POST
  // body.
  const request: DelhiveryRateRequest = {
    md: input.shippingMode === 'Express' ? 'E' : 'S',
    ss: 'Delivered',
    d_pin: input.destinationPincode,
    o_pin: input.originPincode,
    cgm: chargeableWeight,
    pt: input.paymentMode === 'COD' ? 'COD' : 'Pre-paid',
  };

  // Delhivery works in rupees; this codebase carries money as paise, so
  // convert on the way out.
  if (input.paymentMode === 'COD' && input.codAmount) {
    request.cod = Math.round(input.codAmount) / 100;
  }

  const response = await client.get<DelhiveryRateResponse>(
    '/api/kinko/v1/invoice/charges/.json',
    request as unknown as Record<string, string | number | boolean>
  );

  // The endpoint answers with an array of quotes.
  const quote = Array.isArray(response) ? response[0] : undefined;
  if (!quote) {
    throw new Error('Delhivery returned no shipping rate for this route');
  }

  // Quotes are rupees as decimals. Convert to paise so callers can treat these
  // like every other amount in the app.
  const toPaise = (rupees: number | undefined) =>
    Math.round((rupees || 0) * 100);

  const totalAmount = toPaise(quote.total_amount);
  const freightCharges = toPaise(quote.charge_DL);
  const codCharges = toPaise(quote.charge_COD);

  return {
    totalAmount,
    freightCharges,
    codCharges,
    // Everything not broken out above, tax included, so the parts sum to the
    // total rather than silently disagreeing with it.
    otherCharges: Math.max(0, totalAmount - freightCharges - codCharges),
    currency: 'INR',
  };
}

/**
 * Calculate shipping rate with delivery estimate
 */
export interface ShippingRateWithEstimate extends ShippingRate {
  estimatedDays: number;
}

export async function calculateShippingRateWithEstimate(
  client: DelhiveryClient,
  input: CalculateRateInput,
  defaultDays: number = 5
): Promise<ShippingRateWithEstimate> {
  const rate = await calculateShippingRate(client, input);

  // Estimate delivery time based on shipping mode
  // Note: Delhivery's B2C API doesn't provide TAT endpoint
  // so we use configurable defaults
  let estimatedDays = defaultDays;

  if (input.shippingMode === 'Express') {
    estimatedDays = Math.max(2, Math.floor(defaultDays / 2));
  }

  return {
    ...rate,
    estimatedDays,
  };
}

/**
 * Compare Surface vs Express shipping costs
 */
export interface ShippingComparison {
  surface: ShippingRateWithEstimate;
  express: ShippingRateWithEstimate;
  savings: number;
  timeDifference: number;
}

export async function compareShippingModes(
  client: DelhiveryClient,
  input: Omit<CalculateRateInput, 'shippingMode'>,
  defaultSurfaceDays: number = 5,
  defaultExpressDays: number = 2
): Promise<ShippingComparison> {
  // Calculate both rates in parallel
  const [surface, express] = await Promise.all([
    calculateShippingRateWithEstimate(
      client,
      { ...input, shippingMode: 'Surface' },
      defaultSurfaceDays
    ),
    calculateShippingRateWithEstimate(
      client,
      { ...input, shippingMode: 'Express' },
      defaultExpressDays
    ),
  ]);

  return {
    surface,
    express,
    savings: express.totalAmount - surface.totalAmount,
    timeDifference: surface.estimatedDays - express.estimatedDays,
  };
}

/**
 * Check if order qualifies for free shipping
 */
export function qualifiesForFreeShipping(
  orderTotal: number,
  freeShippingThreshold: number
): boolean {
  return orderTotal >= freeShippingThreshold;
}

/**
 * Calculate final shipping cost with free shipping consideration
 */
export interface FinalShippingCost {
  baseShippingCost: number;
  discount: number;
  finalCost: number;
  isFree: boolean;
}

export async function calculateFinalShippingCost(
  client: DelhiveryClient,
  input: CalculateRateInput,
  orderTotal: number,
  freeShippingThreshold: number = 50000 // 500 INR in paisa
): Promise<FinalShippingCost> {
  const rate = await calculateShippingRate(client, input);
  const isFree = qualifiesForFreeShipping(orderTotal, freeShippingThreshold);

  return {
    baseShippingCost: rate.totalAmount,
    discount: isFree ? rate.totalAmount : 0,
    finalCost: isFree ? 0 : rate.totalAmount,
    isFree,
  };
}

/**
 * Calculate shipping for cart items
 */
export interface CartShippingInput {
  items: Array<{
    weightGrams: number;
    dimensions?: {
      length: number;
      width: number;
      height: number;
    };
  }>;
  originPincode: string;
  destinationPincode: string;
  paymentMode: 'Prepaid' | 'COD';
  codAmount?: number;
  shippingMode?: 'Surface' | 'Express';
}

export async function calculateCartShipping(
  client: DelhiveryClient,
  input: CartShippingInput
): Promise<ShippingRate> {
  // Calculate total weight
  const totalWeight = input.items.reduce((sum, item) => {
    if (item.dimensions) {
      return (
        sum +
        getChargeableWeight(
          item.weightGrams,
          item.dimensions.length,
          item.dimensions.width,
          item.dimensions.height
        )
      );
    }
    return sum + item.weightGrams;
  }, 0);

  // Calculate single shipping rate for total weight
  return calculateShippingRate(client, {
    originPincode: input.originPincode,
    destinationPincode: input.destinationPincode,
    weightGrams: totalWeight,
    paymentMode: input.paymentMode,
    codAmount: input.codAmount,
    shippingMode: input.shippingMode,
  });
}

// Wrap exports with error handling
export const calculateShippingRateWithErrorHandling = withErrorHandling(
  calculateShippingRate,
  'calculateShippingRate'
);

export const calculateFinalShippingCostWithErrorHandling = withErrorHandling(
  calculateFinalShippingCost,
  'calculateFinalShippingCost'
);
