/**
 * Shipping Repository
 *
 * Database operations for shipping_info, shipping_scans, pickup_locations, and returns.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  ShippingInfo,
  ShippingScan,
  PickupLocation,
  Return,
  ShipmentType,
  ShippingPaymentMode,
  ReturnStatus,
} from "@/lib/delhivery/types";

/**
 * This module's own Supabase client, constructed lazily.
 *
 * It does not use the shared `db()` from `../supabase` because that client is
 * typed against `Database`, which deliberately omits the shipping tables (see
 * the note on `ShippingInfoRow` in `../database.types.ts`). Consolidating the
 * two means generating those table types, which is worth doing but is not this
 * change.
 *
 * Lazy, and this is the part that matters: built at module scope it threw
 * `supabaseUrl is required` the moment anything *imported* this file without
 * Supabase configured. That turned a missing environment variable into a
 * crash-on-import for every module in the chain — which is how adding one
 * import to the checkout action broke a test suite that never touches shipping.
 * Every other repository reaches Postgres through the lazy singleton in
 * `../supabase.ts` for exactly this reason.
 */
let client: SupabaseClient | null = null;

function supabaseClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to read or write shipping records.",
    );
  }

  client = createClient(url, serviceRoleKey);
  return client;
}

/**
 * Kept as a zero-argument call so the existing `supabase.from(...)` call sites
 * read unchanged, while construction is deferred to first use.
 */
const supabase = {
  from: ((table: string) => supabaseClient().from(table)) as SupabaseClient["from"],
  rpc: ((fn: string, args?: Record<string, unknown>) =>
    supabaseClient().rpc(fn, args)) as SupabaseClient["rpc"],
};

// ---------------------------------------------------------------------------
// Shipping Info
// ---------------------------------------------------------------------------

export interface CreateShipmentData {
  orderId: string;
  waybill: string;
  shipmentType: ShipmentType;
  paymentMode: ShippingPaymentMode;
  weightGrams: number;
  codAmount?: number;
  shippingCharges?: number;
  rawResponse?: unknown;
}

/**
 * Create a new shipment record
 */
export async function createShipment(
  data: CreateShipmentData
): Promise<ShippingInfo | null> {
  const { data: result, error } = await supabase.rpc("create_shipment", {
    p_order_id: data.orderId,
    p_waybill: data.waybill,
    p_shipment_type: data.shipmentType,
    p_payment_mode: data.paymentMode,
    p_weight_grams: data.weightGrams,
    p_cod_amount: data.codAmount || 0,
    p_shipping_charges: data.shippingCharges || null,
    p_raw_response: data.rawResponse || null,
  });

  if (error) {
    console.error("Failed to create shipment:", error);
    return null;
  }

  return getShipmentById(result);
}

/**
 * Get shipment by ID
 */
export async function getShipmentById(
  id: string
): Promise<ShippingInfo | null> {
  const { data, error } = await supabase
    .from("shipping_info")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Failed to get shipment:", error);
    return null;
  }

  return data;
}

/**
 * Get shipment by waybill
 */
export async function getShipmentByWaybill(
  waybill: string
): Promise<ShippingInfo | null> {
  const { data, error } = await supabase
    .from("shipping_info")
    .select("*")
    .eq("waybill", waybill)
    .single();

  if (error) {
    console.error("Failed to get shipment by waybill:", error);
    return null;
  }

  return data;
}

/**
 * Get all shipments for an order
 */
export async function getOrderShipments(
  orderId: string
): Promise<ShippingInfo[]> {
  const { data, error } = await supabase
    .from("shipping_info")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to get order shipments:", error);
    return [];
  }

  return data || [];
}

/**
 * List all shipments with optional filters
 */
export async function listShipments(filters?: {
  status?: string;
  shipmentType?: ShipmentType;
  limit?: number;
}): Promise<ShippingInfo[]> {
  let query = supabase
    .from("shipping_info")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  if (filters?.shipmentType) {
    query = query.eq("shipment_type", filters.shipmentType);
  }

  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to list shipments:", error);
    return [];
  }

  return data || [];
}

// ---------------------------------------------------------------------------
// Shipping Scans
// ---------------------------------------------------------------------------

/**
 * Get scan history for a shipment
 */
export async function getShipmentScans(
  shippingInfoId: string
): Promise<ShippingScan[]> {
  const { data, error } = await supabase
    .from("shipping_scans")
    .select("*")
    .eq("shipping_info_id", shippingInfoId)
    .order("scan_datetime", { ascending: false });

  if (error) {
    console.error("Failed to get shipment scans:", error);
    return [];
  }

  return data || [];
}

// ---------------------------------------------------------------------------
// Pickup Locations
// ---------------------------------------------------------------------------

/**
 * Get all active pickup locations
 */
export async function listPickupLocations(): Promise<PickupLocation[]> {
  const { data, error } = await supabase
    .from("pickup_locations")
    .select("*")
    .eq("is_active", true)
    .order("is_default", { ascending: false });

  if (error) {
    console.error("Failed to list pickup locations:", error);
    return [];
  }

  return data || [];
}

/**
 * Get default pickup location
 */
export async function getDefaultPickupLocation(): Promise<PickupLocation | null> {
  const { data, error } = await supabase
    .from("pickup_locations")
    .select("*")
    .eq("is_active", true)
    .eq("is_default", true)
    .single();

  if (error) {
    // No default set
    return null;
  }

  return data;
}

/**
 * Get pickup location by ID
 */
export async function getPickupLocation(
  id: string
): Promise<PickupLocation | null> {
  const { data, error } = await supabase
    .from("pickup_locations")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Failed to get pickup location:", error);
    return null;
  }

  return data;
}

/**
 * Create a new pickup location
 */
export async function createPickupLocation(
  location: Omit<PickupLocation, "id" | "created_at" | "updated_at">
): Promise<PickupLocation | null> {
  const { data, error } = await supabase
    .from("pickup_locations")
    .insert(location)
    .select()
    .single();

  if (error) {
    console.error("Failed to create pickup location:", error);
    return null;
  }

  return data;
}

// ---------------------------------------------------------------------------
// Returns
// ---------------------------------------------------------------------------

export type CreateReturnResult =
  | { ok: true; value: Return }
  /**
   * - `duplicate`: the order already has a live return (the unique index in migration 19).
   * - `unavailable`: the refund columns are not there, i.e. migration 19 has not been run.
   * - `failed`: anything else.
   */
  | { ok: false; reason: "duplicate" | "unavailable" | "failed" };

/**
 * Create a return request.
 *
 * ## Never logs the database error object
 *
 * The row being inserted can include a UPI ID, and Postgres puts the failing row in an
 * error's `details` for several kinds of failure ("Failing row contains (...)"). Logging
 * the whole object would write a customer's payment address into the server log, which is
 * kept far longer and read by far more people than the table is. Only the code and the
 * short message are logged — neither carries row values.
 */
export async function createReturn(data: {
  orderId: string;
  reason: string;
  notes?: string;
  /** Normalised UPI ID, and its masked form. Both or neither. */
  refundUpiId?: string;
  refundUpiHint?: string;
}): Promise<CreateReturnResult> {
  const { data: result, error } = await supabase
    .from("returns")
    .insert({
      order_id: data.orderId,
      reason: data.reason,
      notes: data.notes,
      status: "requested" as ReturnStatus,
      // Only sent when given, so a return raised without one still works on a database
      // that has not had migration 19 applied.
      ...(data.refundUpiId
        ? { refund_upi_id: data.refundUpiId, refund_upi_hint: data.refundUpiHint ?? null }
        : {}),
    })
    .select()
    .single();

  if (error) {
    console.error(`[returns] could not create a return (${error.code}): ${error.message}`);

    // 23505: unique violation. 42703 / PGRST204: the column does not exist.
    if (error.code === "23505") return { ok: false, reason: "duplicate" };
    if (error.code === "42703" || error.code === "PGRST204") {
      return { ok: false, reason: "unavailable" };
    }
    return { ok: false, reason: "failed" };
  }

  return { ok: true, value: result };
}

/**
 * What a CUSTOMER may see about their returns, for a set of orders.
 *
 * Selects named columns on purpose, never `*`: the row holds the full UPI ID, and a
 * function that feeds the storefront must not be one careless spread away from sending it
 * to a browser. The masked hint is the most that ever leaves here.
 *
 * Falls back to a query without the hint if that column is missing (migration 19 not run),
 * so existing returns still show their status.
 */
export interface CustomerReturnRow {
  id: string;
  order_id: string;
  status: ReturnStatus;
  requested_at: string;
  refund_upi_hint?: string | null;
}

export async function getReturnsForOrders(
  orderIds: string[],
): Promise<Map<string, CustomerReturnRow>> {
  const byOrder = new Map<string, CustomerReturnRow>();
  if (orderIds.length === 0) return byOrder;

  const query = async (columns: string) =>
    supabase
      .from("returns")
      .select(columns)
      .in("order_id", orderIds)
      .order("requested_at", { ascending: false });

  let response = await query("id, order_id, status, requested_at, refund_upi_hint");
  if (response.error) response = await query("id, order_id, status, requested_at");

  if (response.error) {
    console.error(`[returns] could not read returns (${response.error.code}).`);
    return byOrder;
  }

  // Newest first, so the first one seen for an order is the one that matters.
  for (const row of (response.data ?? []) as unknown as CustomerReturnRow[]) {
    if (!byOrder.has(row.order_id)) byOrder.set(row.order_id, row);
  }

  return byOrder;
}

/**
 * Get return by ID
 */
export async function getReturn(id: string): Promise<Return | null> {
  const { data, error } = await supabase
    .from("returns")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Failed to get return:", error);
    return null;
  }

  return data;
}

/**
 * Get returns for an order
 */
export async function getOrderReturns(orderId: string): Promise<Return[]> {
  const { data, error } = await supabase
    .from("returns")
    .select("*")
    .eq("order_id", orderId)
    .order("requested_at", { ascending: false });

  if (error) {
    // Code and message only: Postgres `details` can echo a row, and a row here holds a UPI ID.
    console.error("Failed to get order returns:", error.code, error.message);
    return [];
  }

  return data || [];
}

/**
 * Update return status
 */
export async function updateReturnStatus(
  id: string,
  status: ReturnStatus,
  updates?: {
    shippingInfoId?: string;
    refundAmount?: number;
    notes?: string;
    /**
     * Only apply the change if the return is still in this state. Two staff members can
     * have the same return open; without this the second click silently overwrites the
     * first (refunding something the other person had just rejected).
     */
    expectedFrom?: ReturnStatus;
  }
): Promise<Return | null> {
  const updateData: Record<string, string | number | null> = {
    status,
    updated_at: new Date().toISOString(),
  };

  // Set on every approval, not only one without a pickup: the timestamp is about the
  // decision, whether or not a courier was booked at the same moment.
  if (status === "approved") {
    updateData.approved_at = new Date().toISOString();
  }

  if (status === "received") {
    updateData.received_at = new Date().toISOString();
  }

  if (status === "refunded") {
    updateData.refunded_at = new Date().toISOString();
    if (updates?.refundAmount) updateData.refund_amount = updates.refundAmount;
  }

  /*
   * Erase the full UPI ID once the return is over. It was collected to send one refund; a
   * payment address has no business staying in the database after that. The masked hint is
   * kept as a trace of where the money went. Written only for these three states, so a
   * database without migration 19 is not asked to touch a column it lacks.
   */
  if (status === "refunded" || status === "rejected" || status === "cancelled") {
    updateData.refund_upi_id = null;
  }

  if (updates?.shippingInfoId) {
    updateData.shipping_info_id = updates.shippingInfoId;
  }

  if (updates?.notes) {
    updateData.notes = updates.notes;
  }

  let query = supabase.from("returns").update(updateData).eq("id", id);
  if (updates?.expectedFrom) query = query.eq("status", updates.expectedFrom);

  const { data, error } = await query.select().single();

  if (error) {
    console.error(`[returns] could not update a return (${error.code}): ${error.message}`);
    return null;
  }

  return data;
}

/**
 * List all returns with optional filters
 */
export async function listReturns(filters?: {
  status?: ReturnStatus;
  limit?: number;
}): Promise<Return[]> {
  let query = supabase
    .from("returns")
    .select("*")
    .order("requested_at", { ascending: false });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to list returns:", error);
    return [];
  }

  return data || [];
}
