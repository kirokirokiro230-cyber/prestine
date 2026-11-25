/**
 * TypeScript interfaces for Delhivery API integration
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface DelhiveryConfig {
  apiToken: string;
  environment: 'staging' | 'production';
  clientName?: string;
  defaultPickupLocation?: string;
  webhookSecret?: string;
}

export type DelhiveryEnvironment = 'staging' | 'production';

// ---------------------------------------------------------------------------
// Order Creation / Manifestation
// ---------------------------------------------------------------------------

export interface DelhiveryShipment {
  name: string;
  add: string;
  pin: string;
  city: string;
  state: string;
  country: string;
  phone: string;
  order: string;
  payment_mode: 'Prepaid' | 'COD' | 'Pickup';
  return_pin?: string;
  return_city?: string;
  return_phone?: string;
  return_add?: string;
  return_state?: string;
  return_country?: string;
  return_name?: string;
  products_desc: string;
  hsn_code: string;
  cod_amount?: string;
  order_date?: string;
  total_amount: string;
  seller_add: string;
  seller_name: string;
  seller_inv?: string;
  seller_inv_date?: string;
  quantity: string;
  waybill?: string;
  shipment_width?: string;
  shipment_height?: string;
  shipment_length?: string;
  weight: string;
  seller_gst_tin?: string;
  shipping_mode?: 'Surface' | 'Express';
  address_type?: 'home' | 'office';
  fragile_shipment?: boolean;
}

export interface DelhiveryPickupLocation {
  name: string;
}

export interface DelhiveryOrderPayload {
  shipments: DelhiveryShipment[];
  pickup_location: DelhiveryPickupLocation;
  client?: string;
}

export interface DelhiveryOrderResponse {
  success: boolean;
  rmk?: string;
  packages?: Array<{
    status: string;
    waybill: string;
    client: string;
    sort_code?: string;
    remarks?: string[];
  }>;
  upload_wbn?: string;
  cash_pickups_count?: number;
  prepaid_pickups_count?: number;
  cod_count?: number;
}

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------

export interface DelhiveryScanDetail {
  ScanDateTime: string;
  ScanType: string;
  Scan: string;
  StatusDateTime: string;
  ScannedLocation: string;
  Instructions: string;
  StatusCode: string;
  call_duration?: number;
  geo_location?: {
    lat: number;
    long: number;
  };
}

export interface DelhiveryTrackingStatus {
  Status: string;
  StatusLocation: string;
  StatusDateTime: string;
  RecievedBy?: string;
  Instructions: string;
  StatusType: string;
  StatusCode: string;
}

export interface DelhiveryConsignee {
  City: string;
  Name: string;
  Country: string;
  Address1: string[];
  Address2: string[];
  Address3: string;
  PinCode: number;
  State: string;
  Telephone1: string;
  Telephone2: string;
}

export interface DelhiveryShipmentData {
  PickUpDate: string;
  Destination: string;
  DestRecieveDate?: string;
  Scans: Array<{ ScanDetail: DelhiveryScanDetail }>;
  Status: DelhiveryTrackingStatus;
  ReturnPromisedDeliveryDate: string | null;
  Ewaybill: unknown[];
  InvoiceAmount: number;
  ChargedWeight: number | null;
  PickedupDate: string | null;
  DeliveryDate: string | null;
  SenderName: string;
  AWB: string;
  DispatchCount: number;
  OrderType: string;
  ReturnedDate: string | null;
  ExpectedDeliveryDate: string;
  RTOStartedDate: string | null;
  Extras: string;
  FirstAttemptDate: string | null;
  ReverseInTransit: boolean;
  Quantity: string;
  Origin: string;
  Consignee: DelhiveryConsignee;
  ReferenceNo: string;
  OutDestinationDate: string | null;
  CODAmount: number;
  PromisedDeliveryDate: string;
  PickupLocation: string;
  OriginRecieveDate: string | null;
}

export interface DelhiveryTrackingResponse {
  ShipmentData: Array<{
    Shipment: DelhiveryShipmentData;
  }>;
  Error?: string;
}

// ---------------------------------------------------------------------------
// Pincode Serviceability
// ---------------------------------------------------------------------------

/**
 * Serviceability flags for one pincode.
 *
 * Note the field names: Delhivery returns `pre_paid`, not `prepaid`, and nests
 * this object under a `postal_code` key inside each `delivery_codes` entry.
 */
export interface DelhiveryServiceabilityData {
  pin: number | string;
  pre_paid?: 'Y' | 'N';
  cod?: 'Y' | 'N';
  pickup?: 'Y' | 'N';
  repl?: 'Y' | 'N';
  cash?: 'Y' | 'N';
  is_oda?: 'Y' | 'N';
  district?: string;
  city?: string;
  state_code?: string;
}

export interface DelhiveryServiceabilityResponse {
  delivery_codes: Array<{ postal_code?: DelhiveryServiceabilityData }>;
  Error?: string;
}

// ---------------------------------------------------------------------------
// Shipping Rate Calculation
// ---------------------------------------------------------------------------

export interface DelhiveryRateRequest {
  md: 'S' | 'E'; // Mode: S = Surface, E = Express
  ss: 'Delivered' | 'RTO' | 'DTO';
  d_pin: string; // Destination pincode
  o_pin: string; // Origin pincode
  cgm: number; // Charged weight in grams
  pt: 'Pre-paid' | 'COD';
  cod?: number; // COD amount if applicable, in rupees
}

/**
 * One quote from the charges endpoint. All amounts are rupees, as decimals.
 *
 * The endpoint returns an array of these, and carries a long tail of
 * `charge_*` components beyond the ones named here.
 */
export interface DelhiveryRateQuote {
  status?: string;
  zone?: string;
  /** Final payable amount, inclusive of tax. */
  total_amount: number;
  /** Amount before tax. */
  gross_amount?: number;
  /** Delivery (freight) component. */
  charge_DL?: number;
  /** COD handling component. */
  charge_COD?: number;
  charged_weight?: number;
  Error?: string;
}

export type DelhiveryRateResponse = DelhiveryRateQuote[];

// ---------------------------------------------------------------------------
// Waybill Generation
// ---------------------------------------------------------------------------

export interface DelhiveryWaybillResponse {
  success: boolean;
  waybills: string[];
  count: number;
  Error?: string;
}

// ---------------------------------------------------------------------------
// Pickup Request
// ---------------------------------------------------------------------------

export interface DelhiveryPickupRequest {
  pickup_location: string;
  pickup_date: string; // YYYY-MM-DD
  pickup_time: string; // HH:MM:SS
  expected_package_count: number;
}

export interface DelhiveryPickupResponse {
  success: boolean;
  pickup_id?: string;
  Error?: string;
}

// ---------------------------------------------------------------------------
// Warehouse Management
// ---------------------------------------------------------------------------

export interface DelhiveryWarehouse {
  name: string;
  phone: string;
  pin: string;
  city: string;
  state: string;
  country: string;
  address: string;
  registered_name?: string;
  return_address?: string;
  return_pin?: string;
  return_city?: string;
  return_state?: string;
  return_country?: string;
}

export interface DelhiveryWarehouseResponse {
  success: boolean;
  data?: unknown;
  Error?: string;
}

// ---------------------------------------------------------------------------
// Webhook Payload
// ---------------------------------------------------------------------------

export interface DelhiveryWebhookPayload {
  waybill: string;
  status: string;
  status_code: string;
  scan_datetime: string;
  scanned_location: string;
  instructions: string;
  order_id?: string;
  // Additional fields may be present
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Database Models
// ---------------------------------------------------------------------------

export type ShipmentType = 'forward' | 'reverse';
export type ShippingPaymentMode = 'prepaid' | 'cod' | 'pickup';
export type ReturnStatus =
  | 'requested'
  | 'approved'
  | 'rejected'
  | 'picked_up'
  | 'in_transit'
  | 'received'
  | 'refunded'
  | 'cancelled';

export interface PickupLocation {
  id: string;
  name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShippingInfo {
  id: string;
  order_id: string;
  carrier: string;
  waybill: string;
  status: string | null;
  status_code: string | null;
  tracking_url: string | null;
  label_url: string | null;
  pickup_scheduled_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  expected_delivery_date: string | null;
  origin: string | null;
  destination: string | null;
  weight_grams: number | null;
  shipment_type: ShipmentType;
  payment_mode: ShippingPaymentMode;
  cod_amount: number;
  shipping_charges: number | null;
  raw_response: unknown;
  created_at: string;
  updated_at: string;
}

export interface ShippingScan {
  id: string;
  shipping_info_id: string;
  scan_datetime: string;
  scan_type: string | null;
  scan_status: string | null;
  status_code: string | null;
  location: string | null;
  instructions: string | null;
  raw_data: unknown;
  created_at: string;
}

export interface Return {
  id: string;
  order_id: string;
  shipping_info_id: string | null;
  reason: string | null;
  status: ReturnStatus;
  refund_amount: number | null;
  refund_status: string | null;
  notes: string | null;
  /**
   * Where to send the refund. Present only while staff still need it: it is erased when the
   * return is refunded, rejected or cancelled. Server-side and admin-only; never sent to a
   * customer's browser, which is given `refund_upi_hint` instead.
   */
  refund_upi_id?: string | null;
  /** Masked copy of the UPI ID. Safe to show the customer; kept after the full ID is erased. */
  refund_upi_hint?: string | null;
  requested_at: string;
  approved_at: string | null;
  received_at: string | null;
  refunded_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Helper Types
// ---------------------------------------------------------------------------

export interface CreateShipmentInput {
  orderId: string;
  customerName: string;
  customerAddress: string;
  customerCity: string;
  customerState: string;
  customerPincode: string;
  customerPhone: string;
  orderNumber: string;
  paymentMode: 'Prepaid' | 'COD';
  /** Minor units (paise), converted to rupees at the Delhivery boundary. */
  codAmount?: number;
  /** Minor units (paise), converted to rupees at the Delhivery boundary. */
  totalAmount: number;
  productDescription: string;
  hsnCode: string;
  quantity: number;
  weightGrams: number;
  pickupLocation: string;
  returnAddress?: {
    name: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    phone: string;
  };
  dimensions?: {
    length: number;
    width: number;
    height: number;
  };
  invoiceNumber?: string;
  /**
   * Seller GSTIN. Optional: when omitted, Delhivery applies the GST details
   * registered against the account.
   */
  sellerGstTin?: string;
  shippingMode?: 'Surface' | 'Express';
  fragile?: boolean;
}

export interface DelhiveryError {
  message: string;
  code?: string;
  details?: unknown;
}
