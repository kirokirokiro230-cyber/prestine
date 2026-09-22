"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle, Envelope, Package, Truck } from "@phosphor-icons/react";
import { lookupOrder } from "@/app/actions/orders";
import { OrderLines } from "@/components/account/order-lines";
import { ProductGrid } from "@/components/product/product-grid";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { useIsHydrated } from "@/hooks/use-store";
import { addressName, createMoneyFormatter, deliveryWindow } from "@/lib/format";
import { listOrderRefs } from "@/lib/orders";
import type { Order, Product } from "@/lib/types";

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

  const [order, setOrder] = useState<Order | null>(null);
  const [state, setState] = useState<"loading" | "done">("loading");

  const money = createMoneyFormatter(settings.currency, settings.locale);

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
      })
      .catch(() => {
        if (active) setState("done");
      });

    return () => {
      active = false;
    };
  }, [hydrated, orderId]);

  if (!hydrated || state === "loading") {
    return (
      <div className="page-gutter mx-auto max-w-page py-20">
        <div className="h-10 w-64 animate-shimmer bg-surface-sunken" />
        <div className="mt-8 h-80 animate-shimmer bg-surface-sunken" />
      </div>
    );
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

  return (
    <div className="page-gutter mx-auto max-w-page py-12 lg:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-success-100 text-success-700 dark:bg-success-700/25 dark:text-success-100">
          <CheckCircle size={26} weight="fill" aria-hidden />
        </span>

        <h1 className="mt-6 text-4xl leading-tight sm:text-5xl">Thank you.</h1>
        <p className="mt-4 text-sm leading-relaxed text-content-muted sm:text-base">
          Your order is confirmed and heading to our studio in London to be picked and
          checked by hand before it ships.
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
              Total paid
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
