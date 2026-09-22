import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import { OrderFulfilment } from "@/components/admin/order-fulfilment";
import { Panel, StatusPill } from "@/components/admin/primitives";
import { GarmentArt } from "@/components/product/garment-art";
import { createMoneyFormatter, formatDate } from "@/lib/format";
import { auditFor } from "@/server/audit";
import { emailLogForOrder } from "@/server/repositories/email";
import { getOrder, queryOrders } from "@/server/repositories/orders";
import { getSettings } from "@/server/repositories/settings";
import { can, requireAdmin } from "@/server/session";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Order ${id}` };
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdmin();
  const { id } = await params;

  const order = await getOrder(id);
  if (!order) notFound();

  const [settings, history, emails, customerOrders] = await Promise.all([
    getSettings(),
    auditFor("order", id),
    emailLogForOrder(id),
    // Other orders from the same customer, to spot a repeat buyer at a glance.
    queryOrders({
      // Email where captured, else the phone number — the identity the customer
      // projection now groups on. Postcode is the last resort for legacy orders.
      search:
        order.email ??
        order.shippingAddress.phone ??
        order.shippingAddress.postalCode,
      perPage: 6,
    }),
  ]);

  const money = createMoneyFormatter(settings.currency, settings.locale);
  const units = order.lines.reduce((sum, line) => sum + line.quantity, 0);
  const repeatOrders = customerOrders.items.filter((entry) => entry.id !== order.id);

  const timeline = [
    { label: "Placed", at: order.placedAt },
    { label: "Shipped", at: order.shippedAt },
    { label: "Delivered", at: order.deliveredAt },
    { label: "Cancelled", at: order.cancelledAt },
  ].filter((entry): entry is { label: string; at: string } => Boolean(entry.at));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/orders"
          className="inline-flex items-center gap-1.5 text-xs text-content-muted transition-colors hover:text-content"
        >
          <CaretLeft size={12} aria-hidden />
          Orders
        </Link>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 data-numeric className="font-display text-3xl leading-tight">
            {order.id}
          </h1>
          <StatusPill status={order.status} />
        </div>

        <p className="mt-1.5 text-sm text-content-muted">
          Placed {formatDate(order.placedAt)} · {units} item{units === 1 ? "" : "s"} ·{" "}
          <span data-numeric>{money(order.totals.total)}</span>
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr] xl:items-start">
        <div className="flex flex-col gap-6">
          {/* Line items */}
          <Panel title="Items" bodyClassName="px-0 py-0">
            <ul className="divide-y divide-line">
              {order.lines.map((line, index) => (
                <li key={`${line.slug}-${line.size}-${index}`} className="flex gap-4 px-5 py-4">
                  <div className="relative w-14 shrink-0 overflow-hidden bg-surface-sunken">
                    <div className="aspect-3/4">
                      <GarmentArt
                        product={{
                          id: line.productId ?? line.slug,
                          slug: line.slug,
                          name: line.name,
                          category: line.category,
                        }}
                        colorHex={line.colorHex}
                        colorName={line.colorName}
                      />
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
                    <div className="min-w-0">
                      <Link
                        href={`/product/${line.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="link-underline text-sm font-medium"
                      >
                        {line.name}
                      </Link>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-content-muted">
                        <span
                          aria-hidden
                          style={{ backgroundColor: line.colorHex }}
                          className="inline-block size-2.5 rounded-full ring-1 ring-inset ring-black/12"
                        />
                        {line.colorName}
                        <span aria-hidden className="text-content-subtle">·</span>
                        Size {line.size}
                        <span aria-hidden className="text-content-subtle">·</span>
                        <span data-numeric>
                          {line.quantity} × {money(line.unitPrice)}
                        </span>
                      </p>
                    </div>

                    <span data-numeric className="shrink-0 text-sm">
                      {money(line.unitPrice * line.quantity)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            <dl className="flex flex-col gap-2 border-t border-line px-5 py-4 text-sm">
              <Row term="Subtotal">{money(order.totals.subtotal)}</Row>
              {order.totals.discount > 0 ? (
                <Row term={`Discount${order.promoCode ? ` (${order.promoCode})` : ""}`} positive>
                  −{money(order.totals.discount)}
                </Row>
              ) : null}
              <Row term="Shipping">
                {order.totals.shipping === 0 ? "Complimentary" : money(order.totals.shipping)}
              </Row>
              <Row term="Tax">{money(order.totals.tax)}</Row>
              <div className="mt-1 flex items-baseline justify-between border-t border-line pt-3">
                <dt className="font-medium">Total</dt>
                <dd data-numeric className="text-base">
                  {money(order.totals.total)}
                </dd>
              </div>
            </dl>
          </Panel>

          <OrderFulfilment order={order} canWrite={can(admin, "orders:write")} />

          {/* Internal notes */}
          {order.notes && order.notes.length > 0 ? (
            <Panel title="Internal notes" description="Never shown to the customer.">
              <ul className="flex flex-col divide-y divide-line">
                {order.notes.map((note, index) => (
                  <li key={index} className="py-2.5 first:pt-0 last:pb-0">
                    <p className="text-sm">{note.body}</p>
                    <p className="mt-1 text-xs text-content-subtle">
                      {formatDate(note.at, "short")}
                    </p>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-6">
          <Panel title="Customer">
            <p className="text-sm font-medium">
              {order.shippingAddress.firstName} {order.shippingAddress.lastName}
            </p>
            {order.email ? (
              <p className="mt-1 text-sm">
                <a href={`mailto:${order.email}`} className="link-underline text-content-muted">
                  {order.email}
                </a>
              </p>
            ) : null}
            {order.shippingAddress.phone ? (
              <p data-numeric className="mt-1 text-sm text-content-muted">
                {order.shippingAddress.phone}
              </p>
            ) : null}

            <h3 className="mt-5 text-2xs font-medium uppercase tracking-[0.12em] text-content-muted">
              Shipping address
            </h3>
            <address className="mt-2 text-sm not-italic leading-relaxed text-content-muted">
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
              {order.shippingAddress.country ? (
                <>
                  <br />
                  {order.shippingAddress.country}
                </>
              ) : null}
              {order.shippingAddress.phone ? (
                <>
                  <br />
                  <span data-numeric>{order.shippingAddress.phone}</span>
                </>
              ) : null}
            </address>

            {repeatOrders.length > 0 ? (
              <div className="mt-5 border-t border-line pt-4">
                <h3 className="text-2xs font-medium uppercase tracking-[0.12em] text-content-muted">
                  Other orders
                </h3>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {repeatOrders.map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between gap-3 text-sm">
                      <Link href={`/admin/orders/${entry.id}`} data-numeric className="link-underline">
                        {entry.id}
                      </Link>
                      <span data-numeric className="text-content-muted">
                        {money(entry.totals.total)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Panel>

          <Panel title="Payment">
            <dl className="flex flex-col gap-2 text-sm">
              <Row term="Method">
                {order.cardLast4 ? `Card ending ${order.cardLast4}` : "Not recorded"}
              </Row>

            </dl>
            <p className="mt-4 text-xs leading-relaxed text-content-subtle">
              This build does not process payments, so there is nothing to refund here.
              Once a payment provider is connected, refunds belong on this panel.
            </p>
          </Panel>

          <Panel title="Timeline">
            <ol className="flex flex-col gap-3">
              {timeline.map((entry) => (
                <li key={entry.label} className="flex items-baseline gap-3 text-sm">
                  <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                  <span className="flex-1">{entry.label}</span>
                  <span className="text-xs text-content-muted">
                    {formatDate(entry.at, "short")}
                  </span>
                </li>
              ))}
            </ol>

            {history.length > 0 ? (
              <ul className="mt-5 flex flex-col gap-2 border-t border-line pt-4">
                {history.map((entry) => (
                  <li key={entry.id} className="text-xs text-content-muted">
                    {entry.summary}
                    <span className="block text-content-subtle">
                      {entry.actorEmail} · {formatDate(entry.at, "short")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Panel>

          {/*
            What this customer has actually been told, on the page where someone is
            answering "why haven't they heard from us". Rendered only when there is
            something to show: an empty panel on every legacy order is noise.
          */}
          {emails.length > 0 ? (
            <Panel
              title="Emails sent"
              description="Everything this customer has received about this order."
            >
              <ul className="flex flex-col gap-3">
                {emails.map((record) => (
                  <li key={record.id} className="text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate">{record.subject}</span>
                      <span className="shrink-0 text-xs text-content-muted">
                        {formatDate(record.at, "short")}
                      </span>
                    </div>
                    <span className="mt-0.5 block text-xs text-content-subtle">
                      {record.status === "sent"
                        ? `Delivered to ${record.to}`
                        : record.status === "logged"
                          ? "Composed but not delivered — no email provider configured"
                          : `Failed — ${record.error ?? "unknown error"}`}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Row({
  term,
  positive,
  children,
}: {
  term: string;
  positive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-content-muted">{term}</dt>
      <dd
        data-numeric
        className={positive ? "text-success-700 dark:text-success-500" : "text-content"}
      >
        {children}
      </dd>
    </div>
  );
}
