"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CircleNotch,
  Envelope,
  Money,
  Package,
  Truck,
  WarningCircle,
} from "@phosphor-icons/react";
import { load as loadCashfree } from "@cashfreepayments/cashfree-js";
import { resumePayment } from "@/app/actions/checkout";
import { lookupOrder, reconcilePayment } from "@/app/actions/orders";
import { OrderConfirmedBadge } from "@/components/checkout/order-confirmed-badge";
import { OrderLines } from "@/components/account/order-lines";
import { useCart } from "@/components/providers/cart-provider";
import { ProductGrid } from "@/components/product/product-grid";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { ConfirmationSkeleton } from "@/components/ui/skeleton";
import { useIsHydrated } from "@/hooks/use-store";
import { addressName, createMoneyFormatter, deliveryWindow } from "@/lib/format";
import { listOrderRefs } from "@/lib/orders";
import type { Order, Product } from "@/lib/types";

/**
 * How long to keep asking Cashfree about a pending order before giving up.
 *
 * ## Why the first attempt is immediate
 *
 * This used to wait a full interval before asking even once, which meant every
 * shopper — including the overwhelming majority whose payment had already
 * succeeded before the redirect landed — sat through three seconds of
 * "Confirming your payment…" for no reason. Cashfree's own API already knows the
 * answer by the time the browser gets here; the webhook is a second, independent
 * delivery we do not need to wait for.
 *
 * So the first check fires on arrival and the backoff below only applies to the
 * genuinely unsettled case.
 */
const RECONCILE_DELAYS_MS = [0, 1_200, 2_000, 3_000, 4_000, 5_000, 6_000, 8_000, 10_000, 12_000];

interface ConfirmationSettings {
  currency: string;
  locale: string;
  email: string;
}

/**
 * Post-purchase confirmation.
 *
 * The order is fetched back from the server by reference rather than rendered from
 * anything the browser was holding, so the totals shown are the ones that were
 * actually recorded and charged. The browser only supplies the claim ticket — the
 * reference plus the email it was placed with.
 */
export function ConfirmationView({
  recommendations,
  settings,
}: {
  recommendations: Product[];
  settings: ConfirmationSettings;
}) {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order");
  const hydrated = useIsHydrated();
  const { clearCart } = useCart();

  const [order, setOrder] = useState<Order | null>(null);
  const [state, setState] = useState<"loading" | "done">("loading");
  const [reconcileTimedOut, setReconcileTimedOut] = useState(false);
  // Bumped by the "Check again" button on the timed-out screen to force the polling
  // effect below to run again — its own dependencies (`order.id`/`paymentStatus`)
  // do not change on a manual retry, so this is what actually restarts it.
  const [pollGeneration, setPollGeneration] = useState(0);
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const clearedRef = useRef(false);

  const money = createMoneyFormatter(settings.currency, settings.locale);

  /**
   * Reopen Cashfree for this same order.
   *
   * Previously both of these screens linked to `/checkout`, which builds a
   * *second* order for the same basket and strands the first as `pending`
   * forever. The order already exists and is already unpaid, so the right move
   * is to retry its payment, not to replace it.
   */
  const handleResumePayment = async () => {
    if (!order) return;

    setResuming(true);
    setResumeError(null);

    try {
      const result = await resumePayment({
        id: order.id,
        email: order.email ?? "",
        placedAt: order.placedAt,
      });

      if (!result.ok) {
        setResumeError(result.error);
        setResuming(false);
        return;
      }

      const cashfree = await loadCashfree({ mode: result.environment });
      if (!cashfree) {
        setResumeError("We could not open the payment page. Please try again.");
        setResuming(false);
        return;
      }

      // Navigates the tab away on success, so anything after this only runs
      // when the handoff itself failed.
      const checkout = await cashfree.checkout({
        paymentSessionId: result.paymentSessionId,
        redirectTarget: "_self",
      });

      if (checkout?.error) {
        setResumeError(
          checkout.error.message || "We could not open the payment page. Please try again.",
        );
        setResuming(false);
      }
    } catch (error) {
      console.error("[checkout] resume payment failed:", error);
      setResumeError("We could not reach the server. Please try again.");
      setResuming(false);
    }
  };

  useEffect(() => {
    if (!hydrated) return;

    let active = true;
    const ref = orderId
      ? listOrderRefs().find((entry) => entry.id === orderId)
      : undefined;

    // Resolve through a promise even when there is no claim ticket to redeem, so
    // state never changes synchronously inside the effect body and trigger a
    // cascading render.
    const load = ref ? lookupOrder(ref) : Promise.resolve(null);

    load
      .then((found) => {
        if (!active) return;
        setOrder(found);
        setState("done");
        // Clear the bag once the order is confirmed *paid* — not merely found.
        // A pending order (Cashfree's redirect landed before its webhook did) or
        // a failed one must not empty a shopper's bag; see the polling effect
        // below, which re-checks and clears once payment actually settles.
        /*
         * A COD order is confirmed the moment it exists — it is `pending` only
         * in the sense that no cash has changed hands yet, and it never will
         * until delivery. So it clears the bag like a paid order does, which it
         * previously did not: the shopper completed a real order and was left
         * with their basket still full.
         */
        const settled =
          found?.paymentStatus === "paid" || found?.paymentMethod === "cod";

        if (settled && !clearedRef.current) {
          clearedRef.current = true;
          clearCart();
        }
      })
      .catch(() => {
        if (active) setState("done");
      });

    return () => {
      active = false;
    };
    // `clearCart` is stable across renders (useCallback in CartProvider), so it
    // is safe to omit from deps without this effect re-running on every clear.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, orderId]);

  /*
   * Poll Cashfree while the order sits `pending`. Cashfree's redirect back to this
   * page and its webhook to `/api/payments/cashfree/webhook` are two independent
   * deliveries — nothing guarantees the webhook has landed by the time the shopper
   * arrives here, so this asks directly rather than showing a stale status.
   * Stops as soon as the order leaves `pending`, or after `RECONCILE_ATTEMPTS`.
   */
  useEffect(() => {
    if (state !== "done" || !order || order.paymentStatus !== "pending") return;

    /*
     * A cash-on-delivery order is `pending` by design and stays that way until
     * the courier hands over the money, so there is nothing to reconcile and
     * nobody to ask. Polling one would spin for the full backoff and then
     * announce that payment had failed to arrive — which is exactly what it was
     * doing before this guard.
     */
    if (order.paymentMethod === "cod") return;

    let active = true;
    let attempts = 0;

    const ref = { id: order.id, email: order.email ?? "", placedAt: order.placedAt };

    const schedule = () => {
      const delay = RECONCILE_DELAYS_MS[attempts];
      if (delay === undefined) {
        // Cashfree still reports no completed attempt after the whole backoff —
        // most commonly because the shopper never finished the hosted checkout,
        // not because anything here failed. Say so rather than spinning forever.
        setReconcileTimedOut(true);
        return;
      }
      attempts += 1;
      timer = setTimeout(poll, delay);
    };

    const poll = () => {
      reconcilePayment(ref)
        .then((updated) => {
          if (!active || !updated) return;
          setOrder(updated);
          if (updated.paymentStatus === "paid" && !clearedRef.current) {
            clearedRef.current = true;
            clearCart();
          }
          if (updated.paymentStatus === "pending") schedule();
        })
        .catch(() => {
          if (active) schedule();
        });
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    schedule();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
    // Re-runs when the order identity or its own payment status changes, or when
    // `pollGeneration` is bumped by the "Check again" button on the timed-out
    // screen. `clearCart` is stable (see the effect above) and intentionally
    // omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, order?.id, order?.paymentStatus, pollGeneration]);

  if (!hydrated || state === "loading") {
    return <ConfirmationSkeleton />;
  }

  if (!order) {
    return (
      <div className="page-gutter mx-auto max-w-page py-10">
        <EmptyState
          icon={<Package size={24} aria-hidden />}
          title="We can’t find that order"
          description="The reference may have been placed on another device or in another browser. Email client care with your reference and we will pull it up."
        >
          <ButtonLink href="/account/orders" size="md">
            View order history
          </ButtonLink>
          <ButtonLink href="/shop" variant="outline" size="md">
            Continue shopping
          </ButtonLink>
        </EmptyState>
      </div>
    );
  }

  /*
   * Checked before the pending branches below, because a COD order satisfies
   * `paymentStatus === "pending"` for its entire life before delivery and must
   * never be shown a payment-confirmation spinner.
   */
  const isCod = order.paymentMethod === "cod";

  if (!isCod && order.paymentStatus === "pending" && !reconcileTimedOut) {
    return (
      <div className="page-gutter mx-auto max-w-page py-16 lg:py-20">
        <div className="mx-auto max-w-md text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-surface-sunken text-content-muted">
            <CircleNotch size={26} aria-hidden className="animate-spin" />
          </span>
          <h1 className="mt-6 text-3xl leading-tight sm:text-4xl">Confirming your payment…</h1>
          <p className="mt-4 text-sm leading-relaxed text-content-muted">
            We are checking with Cashfree now. This page updates itself the moment your
            payment is confirmed — no need to refresh or pay again.
          </p>
          <p className="mt-6 text-xs text-content-subtle">
            Order reference <span data-numeric>{order.id}</span>
          </p>
        </div>
      </div>
    );
  }

  if (!isCod && order.paymentStatus === "pending" && reconcileTimedOut) {
    return (
      <div className="page-gutter mx-auto max-w-page py-10">
        <EmptyState
          icon={<WarningCircle size={24} aria-hidden />}
          title="Still waiting on payment"
          description="We have not heard back from Cashfree yet. If you completed payment on the checkout page, tap Check again — it usually only takes a few more seconds. If you closed or abandoned that page, nothing was charged and you can try again."
        >
          <Button
            size="md"
            onClick={() => {
              setReconcileTimedOut(false);
              // Bumping this restarts the polling effect below (it depends on
              // `pollGeneration`), which otherwise would not re-run just because
              // `reconcileTimedOut` flipped back to false — the effect's own guard
              // only cares about `order.paymentStatus` still being "pending".
              setPollGeneration((generation) => generation + 1);
            }}
          >
            Check again
          </Button>
          <Button
            variant="outline"
            size="md"
            onClick={handleResumePayment}
            disabled={resuming}
            aria-busy={resuming}
          >
            {resuming ? "Opening…" : "Pay for this order"}
          </Button>
          <ButtonLink href="/account/orders" variant="outline" size="md">
            View order history
          </ButtonLink>
        </EmptyState>

        {resumeError ? (
          <p
            role="alert"
            className="mx-auto mt-5 max-w-md border border-danger-500/40 bg-danger-500/5 p-4 text-center text-sm leading-relaxed text-danger-500 dark:text-danger-100"
          >
            {resumeError}
          </p>
        ) : null}

        <p className="mx-auto mt-4 max-w-md text-center text-xs text-content-subtle">
          Order reference <span data-numeric>{order.id}</span>
        </p>
      </div>
    );
  }

  if (order.paymentStatus === "failed") {
    return (
      <div className="page-gutter mx-auto max-w-page py-10">
        <EmptyState
          icon={<WarningCircle size={24} aria-hidden />}
          title="That payment did not go through"
          description="Nothing was charged, and your order is still saved under the reference below. Try paying for it again — your basket and address are already on it, so there is nothing to re-enter."
        >
          <Button
            size="md"
            onClick={handleResumePayment}
            disabled={resuming}
            aria-busy={resuming}
          >
            {resuming ? "Opening…" : "Try payment again"}
          </Button>
          <ButtonLink href="/account/orders" variant="outline" size="md">
            View order history
          </ButtonLink>
        </EmptyState>

        {resumeError ? (
          <p
            role="alert"
            className="mx-auto mt-5 max-w-md border border-danger-500/40 bg-danger-500/5 p-4 text-center text-sm leading-relaxed text-danger-500 dark:text-danger-100"
          >
            {resumeError}
          </p>
        ) : null}

        <p className="mx-auto mt-4 max-w-md text-center text-xs text-content-subtle">
          Order reference <span data-numeric>{order.id}</span> — client care can look this
          up if you have any questions.
        </p>
      </div>
    );
  }

  return (
    <div className="page-gutter mx-auto max-w-page py-12 lg:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <OrderConfirmedBadge />

        <h1 className="mt-6 text-4xl leading-tight sm:text-5xl">Thank you.</h1>
        <p className="mt-4 text-sm leading-relaxed text-content-muted sm:text-base">
          Your order is confirmed and is being picked and checked by hand before it
          ships.
          {isCod ? (
            <>
              {" "}
              You will pay{" "}
              <span data-numeric className="text-content">
                {money(order.totals.total)}
              </span>{" "}
              to the courier when it arrives — please keep the exact amount ready.
            </>
          ) : null}
        </p>

        <dl className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 border-y border-line py-5 text-sm">
          <div>
            <dt className="text-2xs uppercase tracking-[0.12em] text-content-muted">
              Order reference
            </dt>
            <dd data-numeric className="mt-1 text-content">
              {order.id}
            </dd>
          </div>
          <div>
            <dt className="text-2xs uppercase tracking-[0.12em] text-content-muted">
              {/* "Paid" would be a lie on a COD order until the courier collects. */}
              {isCod ? "Pay on delivery" : "Total paid"}
            </dt>
            <dd data-numeric className="mt-1 text-content">
              {money(order.totals.total)}
            </dd>
          </div>
          <div>
            <dt className="text-2xs uppercase tracking-[0.12em] text-content-muted">
              Estimated delivery
            </dt>
            <dd className="mt-1 text-content">{deliveryWindow(3, 5)}</dd>
          </div>
        </dl>
      </div>

      {/* What happens next */}
      <ol className="mx-auto mt-12 grid max-w-3xl gap-6 sm:grid-cols-3">
        {[
          {
            icon: Envelope,
            title: "Confirmation sent",
            body: `A receipt is on its way to ${order.email ?? "your inbox"}.`,
          },
          ...(isCod
            ? [
                {
                  icon: Money,
                  title: "Cash on delivery",
                  body: `Have ${money(order.totals.total)} ready for the courier. Exact amount, if you can — they rarely carry change.`,
                },
              ]
            : []),
          {
            icon: Package,
            title: "Picked and checked",
            body: "Every piece is inspected by hand before it leaves the studio.",
          },
          {
            icon: Truck,
            title: "Tracked dispatch",
            body: "You will get a tracking link the moment the courier collects.",
          },
        ].map(({ icon: Icon, title, body }, index) => (
          <li key={title} className="border border-line bg-surface p-5">
            <div className="flex items-center gap-3">
              <Icon size={18} aria-hidden className="shrink-0 text-content-muted" />
              <span data-numeric className="text-2xs text-content-subtle">
                Step {index + 1}
              </span>
            </div>
            <h2 className="mt-3 font-sans text-sm font-medium">{title}</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-content-muted">{body}</p>
          </li>
        ))}
      </ol>

      {/* Order detail */}
      <div className="mx-auto mt-14 max-w-3xl">
        <h2 className="eyebrow mb-4">Your order</h2>
        <OrderLines order={order} money={money} />

        <div className="mt-8 grid gap-6 border-t border-line pt-6 sm:grid-cols-2">
          <div>
            <h3 className="eyebrow mb-2">Delivering to</h3>
            <address className="text-sm not-italic leading-relaxed text-content-muted">
              {/* One formatter for both address shapes — see `addressName` for why. */}
              {addressName(order.shippingAddress)}
              <br />
              {order.shippingAddress.line1}
              {order.shippingAddress.line2 ? (
                <>
                  <br />
                  {order.shippingAddress.line2}
                </>
              ) : null}
              <br />
              {order.shippingAddress.city}, {order.shippingAddress.region}
              {order.shippingAddress.postalCode ? (
                <>
                  <br />
                  {order.shippingAddress.postalCode}
                </>
              ) : null}
              {order.shippingAddress.phone ? (
                <>
                  <br />
                  <span data-numeric>{order.shippingAddress.phone}</span>
                </>
              ) : null}
            </address>
          </div>

          <div>
            <h3 className="eyebrow mb-2">Need to change something?</h3>
            <p className="text-sm leading-relaxed text-content-muted">
              We can amend or cancel any order that has not yet been dispatched. Email{" "}
              <a href={`mailto:${settings.email}`} className="link-underline">
                {settings.email}
              </a>{" "}
              with your reference and we will sort it.
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/account/orders" size="md">
            Track this order
          </ButtonLink>
          <ButtonLink href="/shop" variant="outline" size="md">
            Continue shopping
          </ButtonLink>
        </div>
      </div>

      {recommendations.length > 0 ? (
        <section className="mt-20">
          <SectionHeading
            eyebrow="Goes with what you bought"
            title="You may also like"
            align="center"
            className="mb-10"
          />
          <ProductGrid products={recommendations} columns={4} />
        </section>
      ) : null}
    </div>
  );
}
