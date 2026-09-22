"use client";

import { useEffect, useState } from "react";
import { ArrowSquareOut, Package, Star } from "@phosphor-icons/react";
import { lookupOrders } from "@/app/actions/orders";
import { pendingReviews } from "@/app/actions/reviews";
import { CancelOrder } from "@/components/account/cancel-order";
import { OrderLines } from "@/components/account/order-lines";
import { ReviewForm } from "@/components/product/review-form";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { useIsHydrated } from "@/hooks/use-store";
import { addressName, createMoneyFormatter, formatDate, pluralise } from "@/lib/format";
import { listOrderRefs } from "@/lib/orders";
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
  settings: { currency: string; locale: string };
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
  const expanded = override === null ? (orders[0]?.id ?? null) : override || null;

  const toggle = (id: string) => setOverride(expanded === id ? "" : id);

  if (!hydrated || state === "loading") {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="h-32 animate-shimmer bg-surface-sunken" />
        ))}
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
      <ul className="flex flex-col gap-4">
        {orders.map((order) => {
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
              <div className="flex flex-wrap items-start justify-between gap-4 p-5">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 data-numeric className="font-sans text-sm font-medium">
                      {order.id}
                    </h2>
                    <Badge tone={STATUS_TONE[order.status]}>
                      {STATUS_LABEL[order.status]}
                    </Badge>
                  </div>

                  <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-content-muted">
                    <div className="flex gap-1.5">
                      <dt>Placed</dt>
                      <dd className="text-content">{formatDate(order.placedAt, "short")}</dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt>Items</dt>
                      <dd data-numeric className="text-content">
                        {pluralise(itemCount, "piece")}
                      </dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt>Total</dt>
                      <dd data-numeric className="text-content">
                        {money(order.totals.total)}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {order.trackingNumber ? (
                    <a
                      href={`https://track.dpd.co.uk/search?reference=${order.trackingNumber}`}
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
                    Only while processing. The server refuses a later cancellation
                    independently, but offering the button and then rejecting it
                    would be a worse experience than not offering it.
                  */}
                  {order.status === "processing" && order.email ? (
                    <CancelOrder
                      order={order}
                      email={order.email}
                      onCancelled={() => setReloadKey((key) => key + 1)}
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

                  <button
                    type="button"
                    onClick={() => toggle(order.id)}
                    aria-expanded={open}
                    aria-controls={`order-${order.id}`}
                    className="text-2xs uppercase tracking-[0.1em] text-content transition-colors hover:text-accent"
                  >
                    <span className="link-underline">
                      {open ? "Hide detail" : "View detail"}
                    </span>
                  </button>
                </div>
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

                  {order.carrier && order.trackingNumber ? (
                    <div>
                      <h3 className="eyebrow mb-2">Carrier</h3>
                      <p data-numeric className="text-xs text-content-muted">
                        {order.carrier} — {order.trackingNumber}
                      </p>
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
