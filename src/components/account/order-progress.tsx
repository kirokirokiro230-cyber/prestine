import { Check, X } from "@phosphor-icons/react/dist/ssr";
import { formatDate } from "@/lib/format";
import type { Order } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Where an order has got to.
 *
 * ## Why a timeline rather than just the badge
 *
 * A status badge says "In transit" and leaves the two questions a shopper
 * actually has unanswered: how far along is that, and when did it happen. Three
 * dated steps answer both in the same space, and the shape is recognisable
 * before any of the words are read.
 *
 * Driven by `order.status`, this shop's own fulfilment state machine, not by the
 * courier's free-text `shippingStatus`. The courier's wording is theirs to
 * change and is shown verbatim underneath instead — it is more current, but it
 * is not something to derive a layout from.
 *
 * A cancelled order gets its own single-line treatment. Rendering it as a
 * timeline with two unreached steps would imply it is still coming.
 */

const STEPS = [
  { key: "placed", label: "Placed" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
] as const;

export function OrderProgress({ order }: { order: Order }) {
  if (order.status === "cancelled") {
    return (
      <div className="flex items-center gap-2.5 text-xs text-content-muted">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-surface-sunken text-content-subtle">
          <X size={11} aria-hidden />
        </span>
        <span>
          Cancelled
          {order.cancelledAt ? ` on ${formatDate(order.cancelledAt, "short")}` : ""}
        </span>
      </div>
    );
  }

  /*
   * How many steps are complete. `delivered` implies the parcel shipped even if
   * this shop never recorded the transition — which happens when the tracking
   * sweep sees a delivery on its first ever poll for that waybill.
   */
  const reached =
    order.status === "delivered" ? 3 : order.status === "shipped" ? 2 : 1;

  const dates = [order.placedAt, order.shippedAt, order.deliveredAt];

  return (
    <div>
      <ol className="flex items-start">
        {STEPS.map((step, index) => {
          const done = index < reached;
          const current = index === reached - 1;
          const at = dates[index];

          return (
            <li
              key={step.key}
              className={cn(
                "flex min-w-0 flex-1 flex-col",
                // The last step has no connector to its right, so it does not
                // need the width a connector would occupy.
                index === STEPS.length - 1 && "flex-none",
              )}
            >
              <div className="flex w-full items-center">
                <span
                  aria-hidden
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full transition-colors",
                    done
                      ? "bg-inverse text-on-inverse"
                      : "border border-line bg-surface",
                  )}
                >
                  {done ? <Check size={11} weight="bold" /> : null}
                </span>

                {index < STEPS.length - 1 ? (
                  <span
                    aria-hidden
                    className={cn(
                      "mx-2 h-px min-w-6 flex-1",
                      index < reached - 1 ? "bg-inverse" : "bg-line",
                    )}
                  />
                ) : null}
              </div>

              <div className="mt-2 pr-3">
                <p
                  className={cn(
                    "text-2xs uppercase tracking-[0.1em]",
                    current ? "text-content" : done ? "text-content-muted" : "text-content-subtle",
                  )}
                >
                  {step.label}
                </p>
                {at ? (
                  <p data-numeric className="mt-0.5 text-2xs text-content-subtle">
                    {formatDate(at, "short")}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {/*
        The courier's own words, when there are any and the order has not
        finished. Shown verbatim and never parsed — see the note on
        `Order.shippingStatus`. Suppressed once delivered, where it would only
        repeat the step above it.
      */}
      {order.shippingStatus && order.status !== "delivered" ? (
        <p className="mt-3 text-xs leading-relaxed text-content-muted">
          <span className="text-content">{order.shippingStatus}</span>
          {order.expectedDeliveryDate
            ? ` — expected ${formatDate(order.expectedDeliveryDate, "short")}`
            : ""}
        </p>
      ) : null}
    </div>
  );
}
