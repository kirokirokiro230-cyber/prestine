/**
 * Order Creation and Manifestation
 *
 * Create shipments, generate waybills, and manifest orders with Delhivery.
 */

import type { DelhiveryClient } from '../client';
import type {
  CreateShipmentInput,
  DelhiveryOrderResponse,
  DelhiveryWaybillResponse,
} from '../types';
import { createOrderPayload } from '../utils/transformer';
import { withErrorHandling, retryWithBackoff } from '../utils/error-handler';
import {
  isValidPincode,
  isValidPhone,
  isValidOrderId,
  isValidGstNumber,
} from '../utils/validator';

/**
 * Validate shipment input before creating order
 */
export function validateShipmentInput(input: CreateShipmentInput): void {
  const errors: string[] = [];

  if (!isValidPincode(input.customerPincode)) {
    errors.push(`Invalid customer pincode: ${input.customerPincode}`);
  }

  if (!isValidPhone(input.customerPhone)) {
    errors.push(`Invalid customer phone: ${input.customerPhone}`);
  }

  if (!isValidOrderId(input.orderNumber)) {
    errors.push(`Invalid order ID: ${input.orderNumber}`);
  }

  // Optional — when absent, Delhivery uses the GST registered on the account.
  // Still worth format-checking anything that is supplied, since a malformed
  // GSTIN would be printed onto the customer's invoice.
  if (input.sellerGstTin && !isValidGstNumber(input.sellerGstTin)) {
    errors.push(`Invalid GST number: ${input.sellerGstTin}`);
  }

  if (input.returnAddress) {
    if (!isValidPincode(input.returnAddress.pincode)) {
      errors.push(`Invalid return pincode: ${input.returnAddress.pincode}`);
    }
    if (!isValidPhone(input.returnAddress.phone)) {
      errors.push(`Invalid return phone: ${input.returnAddress.phone}`);
    }
  }

  if (input.weightGrams <= 0) {
    errors.push('Weight must be greater than 0');
  }

  if (input.totalAmount <= 0) {
    errors.push('Total amount must be greater than 0');
  }

  if (errors.length > 0) {
    throw new Error(`Validation failed:\n${errors.join('\n')}`);
  }
}

/**
 * Generate waybills in bulk
 */
export async function generateWaybills(
  client: DelhiveryClient,
  count: number
): Promise<string[]> {
  if (count <= 0 || count > 100) {
    throw new Error('Count must be between 1 and 100');
  }

  const response = await client.get<DelhiveryWaybillResponse>('/api/p/fm/wbn/', {
    count,
  });

  if (!response.success || !response.waybills) {
    throw new Error('Failed to generate waybills');
  }

  return response.waybills;
}

/**
 * Create a single shipment
 */
export async function createShipment(
  client: DelhiveryClient,
  input: CreateShipmentInput,
  waybill?: string
): Promise<DelhiveryOrderResponse> {
  // Validate input
  validateShipmentInput(input);

  // Get pickup location
  const pickupLocation =
    input.pickupLocation || client.getConfig().defaultPickupLocation;

  if (!pickupLocation) {
    throw new Error(
      'Pickup location is required. Provide it in input or set DELHIVERY_DEFAULT_PICKUP_LOCATION'
    );
  }

  // Create order payload
  const payload = createOrderPayload(input, pickupLocation, client.getConfig().clientName);

  // Add waybill to shipment ONLY if explicitly provided
  // Otherwise leave it blank and Delhivery will auto-generate it
  if (waybill && payload.shipments[0]) {
    payload.shipments[0].waybill = waybill;
  }

  // Send to Delhivery
  const response = await client.postForm<DelhiveryOrderResponse>(
    '/api/cmu/create.json',
    payload
  );

  // Check response
  if (!response.success) {
    throw new Error(response.rmk || 'Failed to create shipment');
  }

  return response;
}

/**
 * Create multiple shipments in a single request
 */
export async function createMultipleShipments(
  client: DelhiveryClient,
  inputs: CreateShipmentInput[],
  pickupLocation?: string
): Promise<DelhiveryOrderResponse> {
  if (inputs.length === 0) {
    throw new Error('At least one shipment is required');
  }

  // Validate all inputs
  inputs.forEach((input, index) => {
    try {
      validateShipmentInput(input);
    } catch (error) {
      throw new Error(
        `Validation failed for shipment ${index + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  });

  // Get pickup location
  const finalPickupLocation =
    pickupLocation ||
    inputs[0]?.pickupLocation ||
    client.getConfig().defaultPickupLocation;

  if (!finalPickupLocation) {
    throw new Error('Pickup location is required');
  }

  // Generate waybills for all shipments
  const waybills = await generateWaybills(client, inputs.length);

  // Create order payload with waybills
  const payload = createOrderPayload(inputs, finalPickupLocation, client.getConfig().clientName);

  // Assign waybills to shipments
  payload.shipments.forEach((shipment, index) => {
    shipment.waybill = waybills[index];
  });

  // Send to Delhivery
  const response = await client.postForm<DelhiveryOrderResponse>(
    '/api/cmu/create.json',
    payload
  );

  // Check response
  if (!response.success) {
    throw new Error(response.rmk || 'Failed to create shipments');
  }

  return response;
}

/**
 * Create a reverse pickup shipment (for returns)
 */
export async function createReversePickup(
  client: DelhiveryClient,
  input: Omit<CreateShipmentInput, 'paymentMode'> & {
    returnToAddress: {
      name: string;
      address: string;
      city: string;
      state: string;
      pincode: string;
      phone: string;
    };
  },
  waybill?: string
): Promise<DelhiveryOrderResponse> {
  // Create reverse shipment with payment_mode = 'Pickup'
  const reverseInput: CreateShipmentInput = {
    ...input,
    paymentMode: 'Prepaid', // Will be overridden in payload
    returnAddress: input.returnToAddress,
  };

  // Generate waybill if not provided
  let finalWaybill = waybill;
  if (!finalWaybill) {
    const waybills = await generateWaybills(client, 1);
    finalWaybill = waybills[0];
  }

  // Get pickup location
  const pickupLocation =
    input.pickupLocation || client.getConfig().defaultPickupLocation;

  if (!pickupLocation) {
    throw new Error('Pickup location is required');
  }

  // Create payload
  const payload = createOrderPayload(reverseInput, pickupLocation, client.getConfig().clientName);

  // Override payment_mode for reverse pickup
  if (payload.shipments[0]) {
    payload.shipments[0].payment_mode = 'Pickup';
    payload.shipments[0].waybill = finalWaybill;
  }

  // Send to Delhivery
  const response = await client.postForm<DelhiveryOrderResponse>(
    '/api/cmu/create.json',
    payload
  );

  // Check response
  if (!response.success) {
    throw new Error(response.rmk || 'Failed to create reverse pickup');
  }

  return response;
}

/*
 * There was an `updateShipment` stub here that only ever threw. Removed rather
 * than left as a trap: Delhivery's edit endpoint wants the full shipment payload
 * rather than a diff, and nothing in this app needs it. Edit a manifested parcel
 * in the Delhivery One portal.
 */

/**
 * Cancel a shipment
 */
export async function cancelShipment(
  client: DelhiveryClient,
  waybill: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Delhivery cancel endpoint
    const response = await client.post<{
      success?: boolean;
      status?: boolean | string;
      rmk?: string;
      remark?: string;
      error?: string;
    }>('/api/p/edit', {
      waybill,
      cancellation: true,
    });

    /*
     * The response shape for this endpoint is not something this project has been able to
     * confirm: Delhivery's other endpoints disagree with each other (`success` and `rmk`
     * on one, `status` and `remark` on another), and this has not been exercised against
     * a real parcel. So success is read from whichever field is present, and anything
     * ambiguous is reported as NOT cancelled. That direction matters: a false "cancelled"
     * leaves a live waybill nobody knows to cancel, while a false "failed" only prompts
     * staff to check the portal.
     */
    const message = response.rmk || response.remark || response.error || '';
    const flag =
      typeof response.success === 'boolean'
        ? response.success
        : typeof response.status === 'boolean'
          ? response.status
          : undefined;

    const refused = /not|unable|cannot|can't|fail|invalid|error/i.test(message);

    return {
      success: flag === true && !refused,
      message: message || (flag === true ? 'Shipment cancelled' : 'Delhivery did not confirm the cancellation'),
    };
  } catch (error) {
    throw new Error(
      `Failed to cancel shipment: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Create shipment with retry on failure
 */
export async function createShipmentWithRetry(
  client: DelhiveryClient,
  input: CreateShipmentInput,
  waybill?: string
): Promise<DelhiveryOrderResponse> {
  return retryWithBackoff(
    () => createShipment(client, input, waybill),
    { maxRetries: 3, initialDelay: 1000 }
  );
}

// Wrap exports with error handling
export const createShipmentWithErrorHandling = withErrorHandling(
  createShipment,
  'createShipment'
);

export const createReversePickupWithErrorHandling = withErrorHandling(
  createReversePickup,
  'createReversePickup'
);

export const generateWaybillsWithErrorHandling = withErrorHandling(
  generateWaybills,
  'generateWaybills'
);
