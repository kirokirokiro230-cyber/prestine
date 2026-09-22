"use client";

import { useActionState, useState } from "react";
import { Truck } from "@phosphor-icons/react";
import {
  addOrderNoteAction,
  setTrackingAction,
  updateOrderStatusAction,
  type OrderActionState,
} from "@/app/admin/actions/orders";
import { Checkbox, SelectField, TextArea, TextField } from "@/components/ui/field";
import type { Order } from "@/lib/types";
import { FormFeedback, Panel, SubmitButton } from "./primitives";

/**
 * Fulfilment controls.
 *
 * Only the transitions the server will accept are offered — forward moves, plus
 * cancellation while a parcel has not shipped. A delivered or cancelled order is
 * terminal, so the panel becomes read-only rather than showing buttons that would
 * be rejected.
 */

const CARRIERS = ["DPD", "Royal Mail", "DHL", "UPS", "FedEx", "Evri", "Other"];

/** Mirrors the server transition table in `repositories/orders.ts`. */
const NEXT_STATUSES: Record<Order["status"], Order["status"][]> = {
  processing: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export function OrderFulfilment({
  order,
  canWrite,
}: {
  order: Order;
  canWrite: boolean;
}) {
  const [statusState, statusAction] = useActionState<OrderActionState, FormData>(
    updateOrderStatusAction,
    {},
  );
  const [trackingState, trackingAction] = useActionState<OrderActionState, FormData>(
    setTrackingAction,
    {},
  );
  const [noteState, noteAction] = useActionState<OrderActionState, FormData>(
    addOrderNoteAction,
    {},
  );

  const options = NEXT_STATUSES[order.status];
  const [nextStatus, setNextStatus] = useState<Order["status"] | "">(options[0] ?? "");

  const terminal = options.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <Panel
        title="Fulfilment"
        description={
          terminal
            ? `This order is ${order.status}. No further status changes are possible.`
            : "Moving to shipped requires a tracking number, so the customer always gets one."
        }
      >
        <FormFeedback error={statusState.error} success={statusState.success} />

        {terminal ? (
          <p className="text-sm text-content-muted">
            This order has reached a final status and cannot be moved again.
          </p>
        ) : (
          <form action={statusAction} className="mt-2 flex flex-col gap-4">
            <input type="hidden" name="id" value={order.id} />

            <SelectField
              label="Move to"
              name="status"
              value={nextStatus}
              onValueChange={(next) => setNextStatus(next as Order["status"])}
              options={options.map((status) => ({
                value: status,
                label:
                  status === "shipped"
                    ? "Shipped — dispatch the parcel"
                    : status === "delivered"
                      ? "Delivered — confirmed received"
                      : "Cancelled — will not be fulfilled",
              }))}
              className="max-w-sm"
            />

            {nextStatus === "shipped" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Carrier"
                  name="carrier"
                  defaultValue={order.carrier ?? CARRIERS[0]}
                  options={CARRIERS.map((carrier) => ({ value: carrier, label: carrier }))}
                />
                <TextField
                  label="Tracking number"
                  name="trackingNumber"
                  defaultValue={order.trackingNumber}
                  required
                />
              </div>
            ) : (
              <>
                <input type="hidden" name="carrier" value={order.carrier ?? ""} />
                <input type="hidden" name="trackingNumber" value={order.trackingNumber ?? ""} />
              </>
            )}

            {nextStatus === "cancelled" ? (
              <>
                <p className="border border-warning-500/40 bg-warning-100/50 px-3 py-2.5 text-xs leading-relaxed text-warning-700 dark:bg-warning-700/20 dark:text-warning-100">
                  Cancelling is final — the order cannot be moved to another status
                  afterwards. Refund the customer separately.
                </p>
                {/*
                  Required by the server action too, not just marked required here — the
                  reason is shown to the customer, so an empty one is worse than useless.
                */}
                <TextField
                  label="Reason for cancelling"
                  name="reason"
                  required
                  hint="Shown to the customer on their order. Keep it factual."
                />
              </>
            ) : null}

            {/*
              Checked by default. Untick it when correcting a status set by mistake —
              otherwise fixing a mis-clicked "delivered" tells the customer their parcel
              arrived, and that cannot be taken back.

              The wording under Email decides whether anything actually goes out: a
              template switched off there stays silent regardless of this box.
            */}
            <Checkbox
              label="Email the customer about this change"
              name="notify"
              defaultChecked
              hint={
                nextStatus === "shipped"
                  ? "Sends your “Out for delivery” email, including the tracking number."
                  : nextStatus === "delivered"
                    ? "Sends your “Delivered” email."
                    : "Sends your “Order cancelled” email, including the reason above."
              }
            />

            <SubmitButton
              disabled={!canWrite || !nextStatus}
              pendingLabel="Updating…"
              variant={nextStatus === "cancelled" ? "danger" : "primary"}
              className="self-start"
            >
              <Truck size={14} aria-hidden />
              {nextStatus === "shipped"
                ? "Mark as shipped"
                : nextStatus === "delivered"
                  ? "Mark as delivered"
                  : "Cancel order"}
            </SubmitButton>
          </form>
        )}
      </Panel>

      {/* Tracking, editable independently of status */}
      {order.status !== "cancelled" ? (
        <Panel
          title="Tracking"
          description="Correct a carrier or reference without changing the order status."
        >
          <FormFeedback error={trackingState.error} success={trackingState.success} />

          <form action={trackingAction} className="mt-2 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <input type="hidden" name="id" value={order.id} />
            <SelectField
              label="Carrier"
              name="carrier"
              defaultValue={order.carrier ?? CARRIERS[0]}
              options={CARRIERS.map((carrier) => ({ value: carrier, label: carrier }))}
            />
            <TextField
              label="Tracking number"
              name="trackingNumber"
              defaultValue={order.trackingNumber}
            />
            <SubmitButton disabled={!canWrite} variant="secondary" pendingLabel="Saving…">
              Save tracking
            </SubmitButton>
          </form>
        </Panel>
      ) : null}

      <Panel title="Add a note" description="Internal only. Useful for exchange and refund context.">
        <FormFeedback error={noteState.error} success={noteState.success} />

        <form action={noteAction} className="mt-2 flex flex-col gap-3">
          <input type="hidden" name="id" value={order.id} />
          <TextArea
            label="Note"
            name="note"
            rows={3}
            hideLabel
            placeholder="Customer asked to swap the M for an L — replacement reserved."
          />
          <SubmitButton disabled={!canWrite} variant="secondary" pendingLabel="Adding…" className="self-start">
            Add note
          </SubmitButton>
        </form>
      </Panel>
    </div>
  );
}
