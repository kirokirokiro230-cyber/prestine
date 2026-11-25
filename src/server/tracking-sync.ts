/**
 * Pull tracking updates from Delhivery for shipments still in flight.
 *
 * ## Why polling rather than webhooks
 *
 * Delhivery's tracking docs describe both a pull API and a push API. Push needs
 * them to configure your endpoint against your account, and their own
 * integration notes warn that a slow response causes a timeout on their side
 * and the scan is missed. Pull needs nothing arranged, cannot silently miss an
 * event, and re-reads the whole history every time — so it converges on the
 * truth even after an outage on either side.
 *
 * The two are complementary, not alternatives: push gives you latency, pull
 * gives you correctness. This is the pull half, and it is the one that should
 * exist first.
 *
 * ## Request budget
 *
 * Delhivery allows 750 pull requests per five minutes per IP. Waybills are
 * batched into one request each, and the candidate set is bounded by
 * `shipments_awaiting_tracking`, which excludes anything already delivered or
 * returned. A shop would need thousands of simultaneously in-flight parcels
 * before the ceiling mattered.
 *
 * ## Idempotence
 *
 * Every scan is re-read on every poll. `add_shipping_scan` absorbs the repeats
 * through the unique index added in
 * `supabase/migrations/00000000000011_tracking_sync.sql`, so a sweep can run as
 * often as you like without growing the scan history.
 */

import type { Order } from "@/lib/types";
import {
  getDelhiveryClient,
  trackMultipleShipments,
  type DelhiveryTrackingResponse,
} from "@/lib/delhivery";
import {
  extractLatestStatus,
  isRTO,
  parseDelhiveryDateTime,
} from "@/lib/delhivery/utils";
import { afterResponse } from "./email/after-response";
import { dispatchStatusEmail } from "./email/dispatch";
import { announce } from "./notifications";
import {
  getOrder,
  markCodOrderCollected,
  updateOrderStatus,
} from "./repositories/orders";
import { callRpc, db } from "./supabase";
import type { ShippingInfoRow } from "./database.types";

/**
 * Waybills per request.
 *
 * Delhivery accepts a comma-separated list; this keeps each URL and response a
 * sane size rather than discovering their limit in production.
 */
const BATCH_SIZE = 25;

export interface TrackingSyncResult {
  /** Shipments considered by this sweep. */
  examined: number;
  /** Shipments whose status or scan history changed. */
  updated: number;
  /** Shipments that newly reached a delivered state. */
  delivered: number;
  /** Orders whose fulfilment status the courier moved. */
  ordersAdvanced: Array<{ orderId: string; from: Order["status"]; to: Order["status"] }>;
  /** Waybills Delhivery returned nothing for. */
  unknown: number;
  /** Per-waybill failures, which never abort the sweep. */
  errors: Array<{ waybill: string; error: string }>;
}

/**
 * Move an order's fulfilment status to match what the courier reports.
 *
 * ## Why this is safe to run on every sweep
 *
 * `update_order_status` is forward-only and enforced in Postgres, so a repeat
 * sweep that tries the same move again is rejected rather than applied twice.
 * The email is dispatched only after a transition actually succeeds, which makes
 * "did we already tell the customer" and "did the status already move" the same
 * question — and the database answers it, not a flag we maintain.
 *
 * ## Why it may take two steps
 *
 * The transition table allows `processing → shipped → delivered` but not
 * `processing → delivered`. A parcel can easily be seen as delivered on the
 * first poll that ever ran for it, so reaching `delivered` sometimes means
 * passing through `shipped` first. Both steps mail the customer, which is
 * correct: they get the dispatch note and the delivery note, in order.
 */
export async function advanceOrder(
  orderId: string,
  courier: { pickedUp: boolean; delivered: boolean; rto: boolean },
): Promise<Array<{ orderId: string; from: Order["status"]; to: Order["status"] }>> {
  const moves: Array<{ orderId: string; from: Order["status"]; to: Order["status"] }> = [];

  const order = await getOrder(orderId);
  if (!order) return moves;

  // A cancelled order is terminal, and a returning parcel must not be reported
  // as delivered to the customer.
  if (order.status === "cancelled") return moves;

  /*
   * A delivered COD parcel means the courier took the cash, so this is the
   * moment the order is actually paid. Idempotent in Postgres — the guard only
   * updates a row still pending — and it refuses anything that is not a COD
   * order, so a prepaid order can never be marked paid without a real payment.
   *
   * Done before the status moves so a failure here cannot leave an order
   * reported delivered to the customer while still showing as unpaid in admin.
   */
  if (courier.delivered && !courier.rto && order.paymentMethod === "cod") {
    try {
      const collected = await markCodOrderCollected(orderId);
      if (collected) {
        console.log(`[tracking] COD collected for ${orderId}: ${collected.totals.total}`);
        // `markCodOrderCollected` only returns on the real transition, so this fires once.
        afterResponse(() => announce.codCollected(collected));
      }
    } catch (error) {
      console.error(
        `[tracking] could not record COD collection for ${orderId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  /*
   * A parcel the courier is sending back costs money and needs a human: the customer was
   * not reached, or refused it. Deduplicated by order, so every sweep that re-reads the
   * same RTO status is still one alert.
   */
  if (courier.rto) afterResponse(() => announce.parcelReturning(order));

  const target: Order["status"] | null = courier.delivered
    ? "delivered"
    : courier.pickedUp
      ? "shipped"
      : null;

  if (!target) return moves;
  if (courier.rto && target === "delivered") return moves;

  // `processing → shipped → delivered`, skipping whichever steps are already done.
  const path: Order["status"][] =
    target === "delivered" && order.status === "processing"
      ? ["shipped", "delivered"]
      : [target];

  let current: Order["status"] = order.status;

  for (const next of path) {
    if (current === next) continue;

    try {
      const updated = await updateOrderStatus(orderId, next);
      moves.push({ orderId, from: current, to: next });
      current = next;

      // Detached from this request: a mail failure must not fail the sweep or
      // roll back a transition that genuinely happened.
      afterResponse(() => dispatchStatusEmail(updated));

      // The same transition is the staff-facing event. Only reached when the status
      // actually moved, so repeat sweeps do not repeat it.
      if (next === "shipped") afterResponse(() => announce.orderShipped(updated));
      if (next === "delivered") afterResponse(() => announce.orderDelivered(updated));
    } catch (error) {
      /*
       * Most often the forward-only guard refusing a move that another sweep
       * already made, which is the mechanism working. Logged rather than
       * surfaced, because the shipment itself synced fine.
       */
      console.error(
        `[tracking] could not move ${orderId} to ${next}:`,
        error instanceof Error ? error.message : error,
      );
      break;
    }
  }

  return moves;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Apply one shipment's tracking response to the database.
 *
 * Returns whether anything was written, so the sweep can report honestly rather
 * than claiming to have updated every shipment it looked at.
 */
async function applyShipment(
  response: DelhiveryTrackingResponse,
  index: number,
  shipmentsByWaybill: Map<string, ShippingInfoRow>,
): Promise<{
  updated: boolean;
  delivered: boolean;
  moves: Array<{ orderId: string; from: Order["status"]; to: Order["status"] }>;
}> {
  const nothing = { updated: false, delivered: false, moves: [] };

  const entry = response.ShipmentData?.[index];
  if (!entry) return nothing;

  const shipment = entry.Shipment;
  const waybill = shipment.AWB;

  // `extractLatestStatus` reads ShipmentData[0], so narrow to this shipment
  // before asking for its status.
  const latest = extractLatestStatus({ ShipmentData: [entry] });
  if (!latest) return nothing;

  const deliveredAt =
    parseDelhiveryDateTime(shipment.DeliveryDate ?? "") ?? null;
  const pickedUpAt = parseDelhiveryDateTime(shipment.PickedupDate ?? "") ?? null;
  const expectedDelivery =
    parseDelhiveryDateTime(shipment.ExpectedDeliveryDate ?? "") ?? null;

  const { error: statusError } = await callRpc(db(), "update_shipment_status", {
    p_waybill: waybill,
    p_status: latest.status,
    p_status_code: latest.statusCode,
    p_location: latest.location || null,
    p_picked_up_at: pickedUpAt,
    p_delivered_at: deliveredAt,
    p_expected_delivery_date: expectedDelivery,
  });

  if (statusError) throw new Error(statusError.message);

  /*
   * Scans are written oldest-first so the history reads in order even if a
   * later poll is what first sees an older scan. Each insert is independent:
   * one malformed scan must not discard the rest of the shipment's history.
   */
  const scans = [...(shipment.Scans ?? [])].sort(
    (a, b) =>
      new Date(a.ScanDetail.ScanDateTime).getTime() -
      new Date(b.ScanDetail.ScanDateTime).getTime(),
  );

  for (const scan of scans) {
    const detail = scan.ScanDetail;
    const at = parseDelhiveryDateTime(detail.ScanDateTime);
    if (!at) continue;

    const { error: scanError } = await callRpc(db(), "add_shipping_scan", {
      p_waybill: waybill,
      p_scan_datetime: at,
      p_scan_type: detail.ScanType ?? null,
      p_scan_status: detail.Scan ?? null,
      p_status_code: detail.StatusCode ?? null,
      p_location: detail.ScannedLocation ?? null,
      p_instructions: detail.Instructions ?? null,
      p_raw_data: detail,
    });

    // Logged, not thrown: the status above is the part that matters, and a
    // duplicate is absorbed by the unique index rather than reported here.
    if (scanError) {
      console.error(
        `[tracking] could not store a scan for ${waybill}:`,
        scanError.message,
      );
    }
  }

  /*
   * Propagate to the order's own fulfilment status — but only for a forward
   * shipment. A reverse pickup travelling back to the warehouse must not mark
   * the customer's order shipped or delivered again.
   */
  const record = shipmentsByWaybill.get(waybill);
  const moves =
    record && record.shipment_type === "forward"
      ? await advanceOrder(record.order_id, {
          pickedUp: Boolean(pickedUpAt),
          delivered: Boolean(deliveredAt),
          rto: isRTO(latest.statusCode) || isRTO(latest.status),
        })
      : [];

  return { updated: true, delivered: Boolean(deliveredAt), moves };
}

/**
 * Poll Delhivery for every shipment still in flight and store what comes back.
 *
 * Never throws for a single bad shipment — a sweep that aborts on the first
 * problem leaves every later shipment unsynced, which is the opposite of what a
 * scheduled job is for. Failures are collected and reported.
 */
export async function syncTracking(options?: {
  /** Cap on shipments examined in one sweep. */
  limit?: number;
  /** Skip shipments updated within this many minutes. */
  staleMinutes?: number;
}): Promise<TrackingSyncResult> {
  const result: TrackingSyncResult = {
    examined: 0,
    updated: 0,
    delivered: 0,
    ordersAdvanced: [],
    unknown: 0,
    errors: [],
  };

  const { data, error } = await callRpc(db(), "shipments_awaiting_tracking", {
    p_limit: options?.limit ?? 100,
    p_stale_minutes: options?.staleMinutes ?? 0,
  });

  if (error) throw new Error(error.message);

  const shipments = (data ?? []) as ShippingInfoRow[];
  result.examined = shipments.length;
  if (shipments.length === 0) return result;

  const client = getDelhiveryClient();

  /*
   * Delhivery's response carries the waybill but not our order id, so keep the
   * rows we started from to map back. Also tells us the shipment type, which
   * decides whether a status should touch the order at all.
   */
  const shipmentsByWaybill = new Map(
    shipments.map((shipment) => [shipment.waybill, shipment]),
  );

  for (const batch of chunk(shipments, BATCH_SIZE)) {
    const waybills = batch.map((shipment) => shipment.waybill);

    let response: DelhiveryTrackingResponse;
    try {
      response = await trackMultipleShipments(client, waybills);
    } catch (batchError) {
      /*
       * A whole batch failed — a network blip, or one malformed waybill taking
       * the request down with it. Record it against every waybill in the batch
       * so the report names what was actually missed.
       */
      const message =
        batchError instanceof Error ? batchError.message : String(batchError);
      for (const waybill of waybills) result.errors.push({ waybill, error: message });
      continue;
    }

    const returned = response.ShipmentData ?? [];

    /*
     * Delhivery returns the shipments it knows about, in its own order and
     * possibly fewer than were asked for, so match on the AWB in the response
     * rather than assuming it lines up with the request.
     */
    const seen = new Set<string>();

    for (let index = 0; index < returned.length; index += 1) {
      const waybill = returned[index]?.Shipment?.AWB;
      if (!waybill) continue;
      seen.add(waybill);

      try {
        const applied = await applyShipment(response, index, shipmentsByWaybill);
        if (applied.updated) result.updated += 1;
        if (applied.delivered) result.delivered += 1;
        result.ordersAdvanced.push(...applied.moves);
      } catch (applyError) {
        result.errors.push({
          waybill,
          error:
            applyError instanceof Error ? applyError.message : String(applyError),
        });
      }
    }

    result.unknown += waybills.filter((waybill) => !seen.has(waybill)).length;
  }

  return result;
}
