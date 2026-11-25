/**
 * Shipment Tracking
 *
 * Track shipments, get status updates, and retrieve scan history.
 */

import type { DelhiveryClient } from '../client';
import type { DelhiveryTrackingResponse, ShippingScan } from '../types';
import {
  transformTrackingToScans,
  extractLatestStatus,
  generateTrackingUrl,
  isDelivered,
  isInTransit,
  isRTO,
  getStatusMessage,
} from '../utils/transformer';
import { withErrorHandling } from '../utils/error-handler';
import { isValidWaybill } from '../utils/validator';

export interface TrackingInfo {
  waybill: string;
  status: string;
  statusCode: string;
  location: string;
  instructions: string;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  expectedDeliveryDate: string | null;
  origin: string;
  destination: string;
  isDelivered: boolean;
  isInTransit: boolean;
  isRTO: boolean;
  trackingUrl: string;
}

export interface DetailedTrackingInfo extends TrackingInfo {
  scans: Array<{
    datetime: string;
    status: string;
    location: string;
    instructions: string;
    statusCode: string;
  }>;
  orderType: string;
  codAmount: number;
  invoiceAmount: number;
  referenceNo: string;
  consignee: {
    name: string;
    city: string;
    state: string;
    pincode: number;
  };
}

/**
 * Track a shipment by waybill
 */
export async function trackShipment(
  client: DelhiveryClient,
  waybill: string,
  verbose: boolean = true
): Promise<DelhiveryTrackingResponse> {
  if (!isValidWaybill(waybill)) {
    throw new Error(`Invalid waybill format: ${waybill}`);
  }

  return client.get<DelhiveryTrackingResponse>('/api/v1/packages/json/', {
    waybill,
    verbose: verbose ? 2 : 0,
  });
}

/**
 * Track multiple shipments at once
 */
export async function trackMultipleShipments(
  client: DelhiveryClient,
  waybills: string[]
): Promise<DelhiveryTrackingResponse> {
  // Validate all waybills
  const invalidWaybills = waybills.filter((wb) => !isValidWaybill(wb));
  if (invalidWaybills.length > 0) {
    throw new Error(`Invalid waybills: ${invalidWaybills.join(', ')}`);
  }

  return client.get<DelhiveryTrackingResponse>('/api/v1/packages/json/', {
    waybill: waybills.join(','),
    verbose: 2,
  });
}

/**
 * Get simplified tracking info
 */
export async function getTrackingInfo(
  client: DelhiveryClient,
  waybill: string
): Promise<TrackingInfo | null> {
  const response = await trackShipment(client, waybill);

  if (!response.ShipmentData || response.ShipmentData.length === 0) {
    return null;
  }

  const shipment = response.ShipmentData[0].Shipment;
  const latestStatus = extractLatestStatus(response);

  if (!latestStatus) {
    return null;
  }

  return {
    waybill: shipment.AWB,
    status: latestStatus.status,
    statusCode: latestStatus.statusCode,
    location: latestStatus.location,
    instructions: latestStatus.instructions,
    pickedUpAt: latestStatus.pickedUpAt,
    deliveredAt: latestStatus.deliveredAt,
    expectedDeliveryDate: shipment.ExpectedDeliveryDate,
    origin: shipment.Origin,
    destination: shipment.Destination,
    isDelivered: isDelivered(latestStatus.statusCode),
    isInTransit: isInTransit(latestStatus.statusCode),
    isRTO: isRTO(latestStatus.statusCode),
    trackingUrl: generateTrackingUrl(waybill),
  };
}

/**
 * Get detailed tracking info with scan history
 */
export async function getDetailedTrackingInfo(
  client: DelhiveryClient,
  waybill: string
): Promise<DetailedTrackingInfo | null> {
  const response = await trackShipment(client, waybill, true);

  if (!response.ShipmentData || response.ShipmentData.length === 0) {
    return null;
  }

  const shipment = response.ShipmentData[0].Shipment;
  const latestStatus = extractLatestStatus(response);

  if (!latestStatus) {
    return null;
  }

  // Transform scans
  const scans = (shipment.Scans || []).map((scan) => ({
    datetime: scan.ScanDetail.ScanDateTime,
    status: scan.ScanDetail.Scan,
    location: scan.ScanDetail.ScannedLocation,
    instructions: scan.ScanDetail.Instructions,
    statusCode: scan.ScanDetail.StatusCode,
  }));

  return {
    waybill: shipment.AWB,
    status: latestStatus.status,
    statusCode: latestStatus.statusCode,
    location: latestStatus.location,
    instructions: latestStatus.instructions,
    pickedUpAt: latestStatus.pickedUpAt,
    deliveredAt: latestStatus.deliveredAt,
    expectedDeliveryDate: shipment.ExpectedDeliveryDate,
    origin: shipment.Origin,
    destination: shipment.Destination,
    isDelivered: isDelivered(latestStatus.statusCode),
    isInTransit: isInTransit(latestStatus.statusCode),
    isRTO: isRTO(latestStatus.statusCode),
    trackingUrl: generateTrackingUrl(waybill),
    scans,
    orderType: shipment.OrderType,
    codAmount: shipment.CODAmount,
    invoiceAmount: shipment.InvoiceAmount,
    referenceNo: shipment.ReferenceNo,
    consignee: {
      name: shipment.Consignee.Name,
      city: shipment.Consignee.City,
      state: shipment.Consignee.State,
      pincode: shipment.Consignee.PinCode,
    },
  };
}

/**
 * Get tracking scans for database storage
 */
export async function getTrackingScansForStorage(
  client: DelhiveryClient,
  waybill: string,
  shippingInfoId: string
): Promise<Omit<ShippingScan, 'id' | 'created_at'>[]> {
  const response = await trackShipment(client, waybill, true);
  return transformTrackingToScans(response, shippingInfoId);
}

/**
 * Check if shipment is delivered
 */
export async function isShipmentDelivered(
  client: DelhiveryClient,
  waybill: string
): Promise<boolean> {
  const info = await getTrackingInfo(client, waybill);
  return info?.isDelivered || false;
}

/**
 * Get human-readable status for customer display
 */
export async function getCustomerFacingStatus(
  client: DelhiveryClient,
  waybill: string
): Promise<{
  status: string;
  message: string;
  estimatedDelivery: string | null;
  trackingUrl: string;
} | null> {
  const info = await getTrackingInfo(client, waybill);

  if (!info) {
    return null;
  }

  let status = 'In Transit';
  if (info.isDelivered) {
    status = 'Delivered';
  } else if (info.isRTO) {
    status = 'Returning to Origin';
  } else if (!info.pickedUpAt) {
    status = 'Pickup Pending';
  }

  return {
    status,
    message: getStatusMessage(info.status, info.statusCode, info.instructions),
    estimatedDelivery: info.expectedDeliveryDate,
    trackingUrl: info.trackingUrl,
  };
}

/**
 * Get tracking timeline for UI display
 */
export interface TrackingTimelineEvent {
  id: string;
  datetime: string;
  title: string;
  description: string;
  location: string;
  isCompleted: boolean;
  isCurrent: boolean;
}

export async function getTrackingTimeline(
  client: DelhiveryClient,
  waybill: string
): Promise<TrackingTimelineEvent[]> {
  const detailed = await getDetailedTrackingInfo(client, waybill);

  if (!detailed) {
    return [];
  }

  // Sort scans by datetime (newest first)
  const sortedScans = [...detailed.scans].sort(
    (a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime()
  );

  // Create timeline events
  return sortedScans.map((scan, index) => ({
    id: `${waybill}-${scan.datetime}-${index}`,
    datetime: scan.datetime,
    title: scan.status,
    description: scan.instructions,
    location: scan.location,
    isCompleted: true,
    isCurrent: index === 0,
  }));
}

/**
 * Track by order reference number
 */
export async function trackByOrderReference(
  client: DelhiveryClient,
  orderReference: string
): Promise<TrackingInfo | null> {
  // Delhivery API accepts order reference as waybill parameter
  try {
    return await getTrackingInfo(client, orderReference);
  } catch {
    return null;
  }
}

// Wrap exports with error handling
export const trackShipmentWithErrorHandling = withErrorHandling(
  trackShipment,
  'trackShipment'
);

export const getTrackingInfoWithErrorHandling = withErrorHandling(
  getTrackingInfo,
  'getTrackingInfo'
);

export const getDetailedTrackingInfoWithErrorHandling = withErrorHandling(
  getDetailedTrackingInfo,
  'getDetailedTrackingInfo'
);
