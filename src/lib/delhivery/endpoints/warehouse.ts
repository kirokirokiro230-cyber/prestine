/**
 * Warehouse/Pickup Location Management
 *
 * Create and manage pickup locations (warehouses) registered with Delhivery.
 */

import type { DelhiveryClient } from '../client';
import type { DelhiveryWarehouse, DelhiveryWarehouseResponse, DelhiveryPickupRequest, DelhiveryPickupResponse } from '../types';
import { isValidPincode, isValidPhone, sanitizeForDelhivery } from '../utils/validator';
import { formatDateForDelhivery, formatTimeForDelhivery } from '../utils/transformer';
import { withErrorHandling } from '../utils/error-handler';

export interface CreateWarehouseInput {
  name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;
  registeredName?: string;
  returnAddress?: string;
  returnPin?: string;
  returnCity?: string;
  returnState?: string;
}

/**
 * Validate warehouse input
 */
function validateWarehouseInput(input: CreateWarehouseInput): void {
  const errors: string[] = [];

  if (!input.name || input.name.trim().length === 0) {
    errors.push('Warehouse name is required');
  }

  if (!isValidPhone(input.phone)) {
    errors.push(`Invalid phone number: ${input.phone}`);
  }

  if (!isValidPincode(input.pincode)) {
    errors.push(`Invalid pincode: ${input.pincode}`);
  }

  if (!input.address || input.address.trim().length === 0) {
    errors.push('Address is required');
  }

  if (!input.city || input.city.trim().length === 0) {
    errors.push('City is required');
  }

  if (!input.state || input.state.trim().length === 0) {
    errors.push('State is required');
  }

  if (input.returnPin && !isValidPincode(input.returnPin)) {
    errors.push(`Invalid return pincode: ${input.returnPin}`);
  }

  if (errors.length > 0) {
    throw new Error(`Validation failed:\n${errors.join('\n')}`);
  }
}

/**
 * Transform input to Delhivery warehouse format
 */
function transformToWarehousePayload(input: CreateWarehouseInput): DelhiveryWarehouse {
  return {
    name: sanitizeForDelhivery(input.name),
    phone: input.phone.replace(/\D/g, '').substring(0, 10),
    pin: input.pincode,
    city: sanitizeForDelhivery(input.city),
    state: sanitizeForDelhivery(input.state),
    country: input.country || 'India',
    address: sanitizeForDelhivery(input.address),
    registered_name: input.registeredName
      ? sanitizeForDelhivery(input.registeredName)
      : undefined,
    return_address: input.returnAddress
      ? sanitizeForDelhivery(input.returnAddress)
      : undefined,
    return_pin: input.returnPin,
    return_city: input.returnCity
      ? sanitizeForDelhivery(input.returnCity)
      : undefined,
    return_state: input.returnState
      ? sanitizeForDelhivery(input.returnState)
      : undefined,
    return_country: input.returnPin ? 'India' : undefined,
  };
}

/**
 * Create a new pickup location/warehouse
 */
export async function createWarehouse(
  client: DelhiveryClient,
  input: CreateWarehouseInput
): Promise<DelhiveryWarehouseResponse> {
  validateWarehouseInput(input);
  const payload = transformToWarehousePayload(input);
  
  const response = await client.post<DelhiveryWarehouseResponse>(
    '/api/backend/clientwarehouse/create/',
    payload
  );

  if (!response.success) {
    throw new Error('Failed to create warehouse');
  }

  return response;
}

/**
 * Update an existing pickup location/warehouse
 */
export async function updateWarehouse(
  client: DelhiveryClient,
  input: CreateWarehouseInput
): Promise<DelhiveryWarehouseResponse> {
  validateWarehouseInput(input);
  const payload = transformToWarehousePayload(input);
  
  const response = await client.post<DelhiveryWarehouseResponse>(
    '/api/backend/clientwarehouse/edit/',
    payload
  );

  if (!response.success) {
    throw new Error('Failed to update warehouse');
  }

  return response;
}

export interface PickupRequestInput {
  pickupLocation: string;
  pickupDate: Date;
  pickupTime?: Date;
  expectedPackageCount: number;
}

/**
 * Create pickup request for scheduled pickup
 */
export async function createPickupRequest(
  client: DelhiveryClient,
  input: PickupRequestInput
): Promise<DelhiveryPickupResponse> {
  if (input.expectedPackageCount <= 0) {
    throw new Error('Expected package count must be greater than 0');
  }

  const pickupTime = input.pickupTime || new Date(input.pickupDate);
  pickupTime.setHours(10, 0, 0, 0); // Default to 10 AM

  const payload: DelhiveryPickupRequest = {
    pickup_location: input.pickupLocation,
    pickup_date: formatDateForDelhivery(input.pickupDate),
    pickup_time: formatTimeForDelhivery(pickupTime),
    expected_package_count: input.expectedPackageCount,
  };

  const response = await client.post<DelhiveryPickupResponse>(
    '/fm/request/new/',
    payload
  );

  if (!response.success) {
    throw new Error('Failed to create pickup request');
  }

  return response;
}

/**
 * Schedule pickup for today
 */
export async function scheduleTodayPickup(
  client: DelhiveryClient,
  pickupLocation: string,
  packageCount: number
): Promise<DelhiveryPickupResponse> {
  return createPickupRequest(client, {
    pickupLocation,
    pickupDate: new Date(),
    expectedPackageCount: packageCount,
  });
}

// Wrap exports with error handling
export const createWarehouseWithErrorHandling = withErrorHandling(
  createWarehouse,
  'createWarehouse'
);

export const createPickupRequestWithErrorHandling = withErrorHandling(
  createPickupRequest,
  'createPickupRequest'
);
