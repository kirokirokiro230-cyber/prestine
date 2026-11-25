/**
 * Data transformation utilities for Delhivery API
 * Converts between our app's data models and Delhivery's API format
 */

import type {
  CreateShipmentInput,
  DelhiveryShipment,
  DelhiveryOrderPayload,
  DelhiveryTrackingResponse,
  ShippingScan,
} from '../types';
import { sanitizeForDelhivery, formatPhoneForDelhivery } from './validator';

/**
 * Transform our order data into Delhivery shipment format
 */
/**
 * Paise to rupees, for the Delhivery boundary.
 *
 * Every price in this codebase is an integer number of minor units (paise).
 * Delhivery's `total_amount` and `cod_amount` are major units (rupees) — this
 * is the one place money changes representation on the shipping path. Sending
 * paise here would overstate the invoice value, and the amount collected from
 * the customer on a COD order, by 100x.
 */
function toRupees(minorUnits: number): string {
  const rupees = Math.round(minorUnits) / 100;
  return rupees.toFixed(2);
}

export function transformToDeliveryShipment(
  input: CreateShipmentInput
): DelhiveryShipment {
  const paymentMode = input.paymentMode === 'COD' ? 'COD' : 'Prepaid';
  const codAmount =
    input.paymentMode === 'COD' ? toRupees(input.codAmount || 0) : '0';

  const shipment: DelhiveryShipment = {
    name: sanitizeForDelhivery(input.customerName),
    add: sanitizeForDelhivery(input.customerAddress),
    pin: input.customerPincode,
    city: sanitizeForDelhivery(input.customerCity),
    state: sanitizeForDelhivery(input.customerState),
    country: 'India',
    phone: formatPhoneForDelhivery(input.customerPhone),
    order: input.orderNumber,
    payment_mode: paymentMode,
    products_desc: sanitizeForDelhivery(input.productDescription),
    hsn_code: input.hsnCode,
    cod_amount: codAmount,
    total_amount: toRupees(input.totalAmount),
    seller_add: sanitizeForDelhivery(
      input.returnAddress?.address || 'Warehouse Address'
    ),
    seller_name: sanitizeForDelhivery(
      input.returnAddress?.name || 'Seller Name'
    ),
    quantity: String(input.quantity),
    weight: String(input.weightGrams),
    shipping_mode: input.shippingMode || 'Surface',
    address_type: 'home',
  };

  // Only send the GSTIN if we have one. Omitting the key makes Delhivery fall
  // back to the GST details registered against the account, which is the other
  // supported way of supplying it.
  if (input.sellerGstTin) {
    shipment.seller_gst_tin = input.sellerGstTin;
  }

  // Add return address if provided
  if (input.returnAddress) {
    shipment.return_add = sanitizeForDelhivery(input.returnAddress.address);
    shipment.return_pin = input.returnAddress.pincode;
    shipment.return_city = sanitizeForDelhivery(input.returnAddress.city);
    shipment.return_state = sanitizeForDelhivery(input.returnAddress.state);
    shipment.return_country = 'India';
    shipment.return_name = sanitizeForDelhivery(input.returnAddress.name);
    shipment.return_phone = formatPhoneForDelhivery(input.returnAddress.phone);
  }

  // Add dimensions if provided
  if (input.dimensions) {
    shipment.shipment_length = String(input.dimensions.length);
    shipment.shipment_width = String(input.dimensions.width);
    shipment.shipment_height = String(input.dimensions.height);
  }

  // Add invoice number and date ONLY if provided
  if (input.invoiceNumber) {
    shipment.seller_inv = input.invoiceNumber;
    shipment.seller_inv_date = new Date().toISOString().split('T')[0];
  }

  // Add order date in YYYY-MM-DD HH:MM:SS format
  shipment.order_date = new Date().toISOString().replace('T', ' ').split('.')[0];

  // Add fragile flag if specified
  if (input.fragile) {
    shipment.fragile_shipment = true;
  }

  return shipment;
}

/**
 * Create a complete Delhivery order payload
 */
export function createOrderPayload(
  shipmentInput: CreateShipmentInput | CreateShipmentInput[],
  pickupLocation: string,
  clientName?: string
): DelhiveryOrderPayload {
  const inputs = Array.isArray(shipmentInput) ? shipmentInput : [shipmentInput];
  const shipments = inputs.map(transformToDeliveryShipment);

  const payload: DelhiveryOrderPayload = {
    shipments,
    pickup_location: {
      name: pickupLocation,
    },
  };

  // Add client name if provided
  if (clientName) {
    payload.client = clientName;
  }

  return payload;
}

/**
 * Transform Delhivery tracking response to shipping scans
 */
export function transformTrackingToScans(
  tracking: DelhiveryTrackingResponse,
  shippingInfoId: string
): Omit<ShippingScan, 'id' | 'created_at'>[] {
  if (!tracking.ShipmentData || tracking.ShipmentData.length === 0) {
    return [];
  }

  const shipment = tracking.ShipmentData[0].Shipment;
  const scans = shipment.Scans || [];

  return scans.map((scan) => ({
    shipping_info_id: shippingInfoId,
    scan_datetime: scan.ScanDetail.ScanDateTime,
    scan_type: scan.ScanDetail.ScanType,
    scan_status: scan.ScanDetail.Scan,
    status_code: scan.ScanDetail.StatusCode,
    location: scan.ScanDetail.ScannedLocation,
    instructions: scan.ScanDetail.Instructions,
    raw_data: scan.ScanDetail,
  }));
}

/**
 * Extract latest status from tracking response
 */
export function extractLatestStatus(tracking: DelhiveryTrackingResponse): {
  status: string;
  statusCode: string;
  location: string;
  instructions: string;
  pickedUpAt: string | null;
  deliveredAt: string | null;
} | null {
  if (!tracking.ShipmentData || tracking.ShipmentData.length === 0) {
    return null;
  }

  const shipment = tracking.ShipmentData[0].Shipment;
  const status = shipment.Status;

  return {
    status: status.Status,
    statusCode: status.StatusCode,
    location: status.StatusLocation,
    instructions: status.Instructions,
    pickedUpAt: shipment.PickedupDate,
    deliveredAt: shipment.DeliveryDate,
  };
}

/**
 * Format date for Delhivery API (YYYY-MM-DD)
 */
export function formatDateForDelhivery(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Format time for Delhivery API (HH:MM:SS)
 */
export function formatTimeForDelhivery(date: Date): string {
  return date.toISOString().split('T')[1].split('.')[0];
}

/**
 * Parse Delhivery datetime string to ISO format
 */
export function parseDelhiveryDateTime(delhiveryDate: string): string | null {
  if (!delhiveryDate) return null;
  
  try {
    // Delhivery format: "2024-01-01T10:00:00" or "2024-01-01T10:00:00.000000"
    const date = new Date(delhiveryDate);
    return date.toISOString();
  } catch {
    return null;
  }
}

/**
 * Generate tracking URL for a waybill
 */
export function generateTrackingUrl(waybill: string): string {
  return `https://www.delhivery.com/track/package/${waybill}`;
}

/**
 * Determine if status indicates delivery is complete
 */
export function isDelivered(statusCode: string): boolean {
  // Common delivery status codes
  const deliveredCodes = ['EOD-38', 'DL', 'Delivered'];
  return deliveredCodes.some((code) =>
    statusCode.toLowerCase().includes(code.toLowerCase())
  );
}

/**
 * Determine if status indicates shipment is in transit
 */
export function isInTransit(statusCode: string): boolean {
  const transitCodes = ['X-DDD3FD', 'UD', 'Dispatched', 'Out for delivery'];
  return transitCodes.some((code) =>
    statusCode.toLowerCase().includes(code.toLowerCase())
  );
}

/**
 * Determine if status indicates RTO (Return to Origin)
 */
export function isRTO(statusCode: string): boolean {
  return statusCode.toLowerCase().includes('rto');
}

/**
 * Get human-readable status message
 */
export function getStatusMessage(
  status: string,
  statusCode: string,
  instructions?: string
): string {
  if (instructions) return instructions;

  // Map status codes to friendly messages
  const statusMap: Record<string, string> = {
    'X-UCI': 'Order manifested and ready for pickup',
    'FMPUR-101': 'Pickup scheduled',
    'X-IBD3F': 'Received at Delhivery facility',
    'X-DDD3FD': 'Out for delivery',
    'EOD-38': 'Delivered successfully',
    'ST-114': 'Delivery attempted - customer called',
  };

  return statusMap[statusCode] || status || 'Status update received';
}
