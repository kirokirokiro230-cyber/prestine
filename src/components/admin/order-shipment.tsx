"use client";

import { useActionState } from "react";
import { ArrowSquareOut, Package } from "@phosphor-icons/react";
import {
  createShipmentForOrder,
  type CreateShipmentForOrderResult,
} from "@/app/actions/shipping";
import { formatDate } from "@/lib/format";
import { carrierLabel, trackingUrl } from "@/lib/tracking-url";
import type { ShippingInfo, ShippingScan } from "@/lib/delhivery/types";
import { FormFeedback, Panel, SubmitButton } from "./primitives";

/**
 * The courier's view of an order.
 *
 * Read-only by design. This replaced a pair of forms where staff chose a carrier
 * from a hardcoded list and typed a tracking number by hand — which, now that
 * Delhivery assigns the waybill at manifestation, could only ever disagree with
 * the truth. Everything here comes from `shipping_info` and `shipping_scans`,
 * refreshed by the tracking sweep.
 *
 * The one action is manifesting a shipment that does not exist yet, for the case
 * the automatic attempt at payment failed — an empty Delhivery wallet being the
 * likeliest reason.
 */
export function OrderShipment({
  orderId,
  shipment,
  scans,
  canWrite,
}: {
  orderId: string;
  shipment: ShippingInfo | null;
  scans: ShippingScan[];
  canWrite: boolean;
}) {
  const [state, action] = useActionState<
    CreateShipmentForOrderResult | Record<string, never>,
    FormData
  >(async () => createShipmentForOrder(orderId), {});

  const error = state && "ok" in state && !state.ok ? state.error : undefined;
  const success =
    state && "ok" in state && state.ok
      ? `Shipment created. Waybill ${state.waybill}.`
      : undefined;

  if (!shipment) {
    return (
      <Panel
        title="Shipment"
        description="No parcel has been manifested with Delhivery for this order yet."
      >
        <FormFeedback error={error} success={success} />

        <p className="mt-2 text-sm text-content-muted">
          A shipment is normally created automatically the moment payment
          confirms. If it was not, the usual cause is the Delhivery wallet being
          below the minimum balance needed to pull a waybill.
        </p>

        <form action={action} className="mt-4">
          <SubmitButton
            disabled={!canWrite}
            pendingLabel="Creating…"
            variant="secondary"
            className="self-start"
          >
            <Package size={14} aria-hidden />
            Create shipment now
          </SubmitButton>
        </form>
      </Panel>
    );
  }

  const url = trackingUrl(shipment.carrier, shipment.waybill);

  return (
    <Panel
      title="Shipment"
      description="Live from Delhivery. Updated by the tracking sweep, not by hand."
    >
      <FormFeedback error={error} success={success} />

      <dl className="mt-2 flex flex-col gap-2.5 text-sm">
        <Row term="Waybill">
          <span data-numeric>{shipment.waybill}</span>
        </Row>
        <Row term="Carrier">{carrierLabel(shipment.carrier)}</Row>
        <Row term="Status">{shipment.status ?? "Awaiting first scan"}</Row>
        {shipment.expected_delivery_date ? (
          <Row term="Expected">
            {formatDate(shipment.expected_delivery_date, "short")}
          </Row>
        ) : null}
        {shipment.picked_up_at ? (
          <Row term="Picked up">{formatDate(shipment.picked_up_at, "short")}</Row>
        ) : null}
        {shipment.delivered_at ? (
          <Row term="Delivered">{formatDate(shipment.delivered_at, "short")}</Row>
        ) : null}
        {shipment.payment_mode === "cod" ? (
          <Row term="COD to collect">{shipment.cod_amount}</Row>
        ) : null}
      </dl>

      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-4 inline-flex items-center gap-1.5 text-2xs uppercase tracking-[0.1em] text-content-muted transition-colors hover:text-content"
        >
          <span className="link-underline">Open on Delhivery</span>
          <ArrowSquareOut size={12} aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ) : null}

      {scans.length > 0 ? (
        <div className="mt-5 border-t border-line pt-4">
          <h3 className="eyebrow mb-3">Scan history</h3>
          <ul className="flex flex-col divide-y divide-line">
            {/* Newest first: the current position is what anyone opens this for. */}
            {[...scans]
              .sort(
                (a, b) =>
                  new Date(b.scan_datetime).getTime() -
                  new Date(a.scan_datetime).getTime(),
              )
              .map((scan) => (
                <li key={scan.id} className="py-2.5 first:pt-0 last:pb-0">
                  <p className="text-sm">{scan.scan_status ?? scan.status_code}</p>
                  {scan.instructions ? (
                    <p className="mt-0.5 text-xs text-content-muted">
                      {scan.instructions}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-content-subtle">
                    {formatDate(scan.scan_datetime, "short")}
                    {scan.location ? ` — ${scan.location}` : ""}
                  </p>
                </li>
              ))}
          </ul>
        </div>
      ) : (
        <p className="mt-5 border-t border-line pt-4 text-xs text-content-subtle">
          No scans recorded yet. Delhivery adds the first one when the parcel is
          collected.
        </p>
      )}
    </Panel>
  );
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-content-muted">{term}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
