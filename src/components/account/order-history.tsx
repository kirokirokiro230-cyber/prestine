"use client";

import { useEffect, useState } from "react";
import { ArrowSquareOut, Package, Star } from "@phosphor-icons/react";
import { lookupOrders } from "@/app/actions/orders";
import { pendingReviews } from "@/app/actions/reviews";
import { CancelOrder } from "@/components/account/cancel-order";
import { OrderLines } from "@/components/account/order-lines";
import { OrderProgress } from "@/components/account/order-progress";
import { OrderThumbnails } from "@/components/account/order-thumbnails";
import { ReturnSection } from "@/components/account/return-section";
import { ReviewForm } from "@/components/product/review-form";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { BlockListSkeleton } from "@/components/ui/skeleton";
import { useIsHydrated } from "@/hooks/use-store";
import { addressName, createMoneyFormatter, formatDate, pluralise } from "@/lib/format";
import { cancelEligibility } from "@/lib/order-cancellation";
import { listOrderRefs } from "@/lib/orders";
import { carrierLabel, trackingUrl } from "@/lib/tracking-url";
import { cn } from "@/lib/utils";
import type { Order } from "@/lib/types";
import type { PendingReviewItem } from "@/server/repositories/reviews";

const STATUS_TONE = {
  processing: "accent",
  shipped: "new",
  delivered: "eco",
  cancelled: "muted",
} as const;

const STATUS_LABEL = {
  processing: "Processing",
  shipped: "In transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
} as const;

/**
 * Order history.
 *
 * Orders live on the server, so this fetches them rather than reading a local copy.
 * That means the status, tracking number and totals shown here are the same records
 * the fulfilment team sees in admin — mark an order shipped in the panel and it
 * reads "In transit" on the customer's next visit.
 *
 * Guests have no login, so the browser holds a claim ticket per order (reference plus
 * the email it was placed with) and the server returns only orders where both match.
 * When real accounts land, swap `listOrderRefs()` for the session's customer id.
 */
export function OrderHistory({
  settings,
}: {
  settings: { currency: string; locale: string; returnWindowHours: number };
}) {
  const hydrated = useIsHydrated();
  const [orders, setOrders] = useState<Order[]>([]);
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  /**
   * Bumped to refetch after a cancellation, so the status badge and the reason come
   * from the server rather than being patched into local state. One round trip buys
   * the guarantee that what the customer sees is what was actually written.
   */
  const [reloadKey, setReloadKey] = useState(0);

  /**
   * What this signed-in shopper can still review, keyed by product slug. Empty for a
   * guest — `pendingReviews()` resolves identity from the session, never from the
   * claim-ticket orders above it, so the two can legitimately disagree about whose
   * history this is. The review button only appears where both agree: an order in the
   * list above *and* a slug in this set.
   */
  const [reviewable, setReviewable] = useState<Map<string, PendingReviewItem>>(new Map());
  const [reviewing, setReviewing] = useState<PendingReviewItem | null>(null);

  const money = createMoneyFormatter(settings.currency, settings.locale);

  useEffect(() => {
    if (!hydrated) return;

    let active = true;
    const refs = listOrderRefs();

    // Resolve through a promise even when there is nothing to fetch, so state never
    // changes synchronously inside the effect body and trigger a cascading render.
    const load = refs.length === 0 ? Promise.resolve([]) : lookupOrders(refs);

    Promise.all([load, pendingReviews()])
      .then(([found, pending]) => {
        if (!active) return;
        setOrders(found);
        setReviewable(new Map(pending.map((item) => [item.productSlug, item])));
        setState("done");
      })
      .catch(() => {
        if (active) setState("error");
      });

    return () => {
      active = false;
    };
  }, [hydrated, reloadKey]);

  /**
   * `null` means "no choice made yet", in which case the most recent order is open.
   * An empty string means the shopper explicitly closed everything.
   */
  const [override, setOverride] = useState<string | null>(null);

  /**
   * Which statuses to show. `"open"` is the useful default view once a history
   * gets long — a shopper coming here almost always wants the parcel that has
   * not arrived yet, not the one from last spring.
   *
   * Derived into the list below rather than refetching: `lookupOrders` already
   * returned everything the claim tickets can reach, so filtering is free and
   * instant.
   */
  const [filter, setFilter] = useState<"all" | "open" | "delivered">("all");

  const visible =
    filter === "all"
      ? orders
      : filter === "open"
        ? orders.filter(
            (order) => order.status === "processing" || order.status === "shipped",
          )
        : orders.filter((order) => order.status === "delivered");

  const openCount = orders.filter(
    (order) => order.status === "processing" || order.status === "shipped",
  ).length;

  const expanded = override === null ? (visible[0]?.id ?? null) : override || null;

  const toggle = (id: string) => setOverride(expanded === id ? "" : id);

  if (!hydrated || state === "loading") {
    return (
      <div role="status" aria-label="Loading your orders">
        <BlockListSkeleton count={2} blockClassName="h-32" />
      </div>
    );
  }

  if (state === "error") {
    return (
      <EmptyState
        icon={<Package size={22} aria-hidden />}
        title="We couldn’t load your orders"
        description="Something went wrong reaching the server. Refresh the page, or contact client care with your order reference."
      >
        <ButtonLink href="/contact" size="md">
          Contact client care
        </ButtonLink>
      </EmptyState>
    );
  }

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={<Package size={22} aria-hidden />}
        title="No orders yet"
        description="Once you place an order it will appear here with live tracking and your receipt. Orders placed on another device will not show — email client care with the reference and we will pull it up."
      >
        <ButtonLink href="/shop" size="md">
          Browse all clothing
        </ButtonLink>
      </EmptyState>
    );
  }

  return (
    <>
      {/*
        Only worth showing once there is enough history for it to do anything.
        Three filter chips above two orders is furniture.
      */}
      {orders.length > 2 ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <div role="group" aria-label="Filter orders" className="flex flex-wrap gap-1">
            {(
              [
                ["all", `All (${orders.length})`],
                ["open", `In progress${openCount > 0 ? ` (${openCount})` : ""}`],
                ["delivered", "Delivered"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => {
                  setFilter(value);
                  // Let the filtered list pick its own first order to expand
                  // rather than keeping a card open that is no longer shown.
                  setOverride(null);
                }}
                className={cn(
                  "min-h-9 px-3 text-2xs uppercase tracking-[0.1em] transition-colors",
                  filter === value
                    ? "bg-inverse text-on-inverse"
                    : "text-content-muted hover:text-content",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <p className="border border-line bg-surface p-6 text-sm text-content-muted">
          Nothing here under that filter.{" "}
          <button
            type="button"
            onClick={() => setFilter("all")}
            className="link-underline text-content"
          >
            Show all orders
          </button>
          .
        </p>
      ) : null}

      <ul className="flex flex-col gap-4">
        {visible.map((order) => {
          const open = expanded === order.id;
          const itemCount = order.lines.reduce((sum, line) => sum + line.quantity, 0);

          // The first still-reviewable line on this order, if any. One button per
          // order rather than one per line: a shopper who bought three pieces in one
          // order and has already reviewed two of them gets offered exactly the one
          // that is left.
          const nextToReview =
            order.status === "delivered"
              ? order.lines
                  .map((line) => reviewable.get(line.slug))
                  .find((item): item is PendingReviewItem => Boolean(item))
              : undefined;

          return (
            <li key={order.id} className="border border-line bg-surface">
              {/*
                Identity and money on one line, the parcel's progress below it,
                then actions in their own divided row. Previously all three
                competed for the same flex row and wrapped into a pile on
                anything narrower than a laptop.
              */}
              <div className="flex items-start gap-4 p-5 sm:gap-5">
                <OrderThumbnails lines={order.lines} />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h2 data-numeric className="font-sans text-sm font-medium">
                          {order.id}
                        </h2>
                        <Badge tone={STATUS_TONE[order.status]}>
                          {STATUS_LABEL[order.status]}
                        </Badge>
                      </div>

                      <p className="mt-1.5 text-xs text-content-muted">
                        {formatDate(order.placedAt, "short")}
                        <span aria-hidden className="mx-1.5 text-content-subtle">
                          ·
                        </span>
                        <span data-numeric>{pluralise(itemCount, "piece")}</span>
                      </p>
                    </div>

                    <div className="text-right">
                      <p data-numeric className="text-sm text-content">
                        {money(order.totals.total)}
                      </p>
                      {/*
                        COD is worth naming here. An unpaid order in a history
                        list otherwise looks like something went wrong, when in
                        fact the shopper simply has not been asked for the money
                        yet.
                      */}
                      {order.paymentMethod === "cod" ? (
                        <p className="mt-0.5 text-2xs uppercase tracking-[0.1em] text-content-subtle">
                          {order.paymentStatus === "paid" ? "Paid on delivery" : "Pay on delivery"}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-5">
                    <OrderProgress order={order} />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line px-5 py-3.5">
                  {trackingUrl(order.carrier, order.trackingNumber) ? (
                    <a
                      href={trackingUrl(order.carrier, order.trackingNumber)!}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1.5 text-2xs uppercase tracking-[0.1em] text-content-muted transition-colors hover:text-content"
                    >
                      <span className="link-underline">Track parcel</span>
                      <ArrowSquareOut size={12} aria-hidden />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  ) : null}

                  {/*
                    Only while the courier has not collected the parcel. The same rule
                    the server applies (`cancelEligibility`), so the page never offers
                    something the server then refuses. The server also asks the courier
                    live, because this stored state can trail a pickup by one tracking
                    sweep — if it does, the customer is told why rather than cancelled.
                  */}
                  {order.email && cancelEligibility(order).allowed ? (
                    <CancelOrder
                      order={order}
                      email={order.email}
                      onCancelled={() => setReloadKey((key) => key + 1)}
                    />
                  ) : null}

                  {/*
                    Once it cannot be cancelled, say so instead of silently removing the
                    button — a shopper who wonders where it went emails us. Only for an
                    order that is actually on its way; a cancelled or delivered order
                    needs no such explanation.
                  */}
                  {order.email && order.status !== "cancelled" && order.status !== "delivered" && !cancelEligibility(order).allowed ? (
                    <span className="text-2xs text-content-subtle">
                      Already with the courier, so it can no longer be cancelled.
                    </span>
                  ) : null}

                  {/*
                    Returns. A delivered order shows exactly one of: the status of the
                    return already raised, the button (while the window is open), or a
                    note that the window has closed. A cancelled return counts as none,
                    so the customer can ask again.
                  */}
                  {order.status === "delivered" && order.email ? (
                    <ReturnSection
                      order={order}
                      email={order.email}
                      windowHours={settings.returnWindowHours}
                      onRequested={() => setReloadKey((key) => key + 1)}
                    />
                  ) : null}

                  {/*
                    Delivered and not yet reviewed. Guests never see this:
                    `reviewable` is empty for them because `pendingReviews()` has no
                    session to resolve.
                  */}
                  {nextToReview ? (
                    <button
                      type="button"
                      onClick={() => setReviewing(nextToReview)}
                      className="inline-flex items-center gap-1.5 text-2xs uppercase tracking-[0.1em] text-content transition-colors hover:text-accent"
                    >
                      <Star size={12} aria-hidden />
                      <span className="link-underline">Write a review</span>
                    </button>
                  ) : null}

                  {/*
                    Pushed to the far end of the row, so the destructive and
                    one-off actions group together on the left and the harmless
                    expand toggle always sits in the same place.
                  */}
                  <button
                    type="button"
                    onClick={() => toggle(order.id)}
                    aria-expanded={open}
                    aria-controls={`order-${order.id}`}
                    className="ml-auto text-2xs uppercase tracking-[0.1em] text-content transition-colors hover:text-accent"
                  >
                    <span className="link-underline">
                      {open ? "Hide detail" : "View detail"}
                    </span>
                  </button>
              </div>

              {/*
                Shown whoever cancelled it. A customer who cancelled needs to see
                what they said; one whose order a merchant cancelled needs to be told
                why.
              */}
              {order.status === "cancelled" && order.cancellationReason ? (
                <p className="border-t border-line bg-surface-sunken px-5 py-3 text-xs leading-relaxed text-content-muted">
                  <span className="font-medium text-content">Cancelled:</span>{" "}
                  {order.cancellationReason}
                </p>
              ) : null}

              <div id={`order-${order.id}`} hidden={!open} className="border-t border-line p-5">
                <OrderLines order={order} money={money} />

                <div className="mt-6 grid gap-5 border-t border-line pt-5 sm:grid-cols-2">
                  <div>
                    <h3 className="eyebrow mb-2">
                      {order.status === "delivered" ? "Delivered to" : "Delivering to"}
                    </h3>
                    <address className="text-xs not-italic leading-relaxed text-content-muted">
                      {addressName(order.shippingAddress)}
                      <br />
                      {order.shippingAddress.line1}
                      <br />
                      {order.shippingAddress.city}
                      {order.shippingAddress.region ? `, ${order.shippingAddress.region}` : ""}
                      {order.shippingAddress.postalCode ? (
                        <>
                          <br />
                          {order.shippingAddress.postalCode}
                        </>
                      ) : null}
                    </address>
                  </div>

                  {order.trackingNumber ? (
                    <div>
                      <h3 className="eyebrow mb-2">Carrier</h3>
                      <p data-numeric className="text-xs text-content-muted">
                        {carrierLabel(order.carrier)} — {order.trackingNumber}
                      </p>
                      {/*
                        The courier's own wording, shown verbatim. It is more
                        current than our fulfilment status, which only moves when
                        the tracking sweep runs.
                      */}
                      {order.shippingStatus ? (
                        <p className="mt-1 text-xs text-content-muted">
                          {order.shippingStatus}
                        </p>
                      ) : null}
                      {order.expectedDeliveryDate ? (
                        <p className="mt-1 text-xs text-content-muted">
                          Expected{" "}
                          {new Date(order.expectedDeliveryDate).toLocaleDateString(
                            settings.locale,
                            { day: "numeric", month: "long" },
                          )}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <Modal
        open={reviewing !== null}
        onClose={() => setReviewing(null)}
        title="Write a review"
        size="md"
      >
        {reviewing ? (
          <ReviewForm
            key={reviewing.productSlug}
            productSlug={reviewing.productSlug}
            productName={reviewing.productName}
            onSuccess={() => {
              setReviewable((current) => {
                const next = new Map(current);
                next.delete(reviewing.productSlug);
                return next;
              });
              setReviewing(null);
            }}
          />
        ) : null}
      </Modal>
    </>
  );
}
