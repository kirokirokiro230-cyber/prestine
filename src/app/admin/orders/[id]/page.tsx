import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import { OrderFulfilment } from "@/components/admin/order-fulfilment";
import { OrderRefunds, type RefundView } from "@/components/admin/order-refunds";
import { OrderReturns } from "@/components/admin/order-returns";
import { OrderShipment } from "@/components/admin/order-shipment";
import { Panel, StatusPill } from "@/components/admin/primitives";
import { GarmentArt } from "@/components/product/garment-art";
import { createMoneyFormatter, formatDate } from "@/lib/format";
import { refundableRemaining } from "@/lib/refund";
import { auditFor } from "@/server/audit";
import { orderUsedFirstOrderDiscount } from "@/server/first-order";
import { emailLogForOrder } from "@/server/repositories/email";
import { getOrder, queryOrders } from "@/server/repositories/orders";
import { listOrderRefunds } from "@/server/repositories/refunds";
import { getOrderReturns, getOrderShipments, getShipmentScans } from "@/server/repositories/shipping";
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

  const [settings, history, emails, customerOrders, shipments, returns, refundLedger, usedFirstOrder] = await Promise.all([
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
    getOrderShipments(id),
    // Never let a returns problem take the whole order page down.
    getOrderReturns(id).catch(() => []),
    // Same: a refund ledger problem must not stop staff opening the order.
    listOrderRefunds(id).catch((error) => {
      console.error("[refund] could not load refunds:", (error as Error).message);
      return { refunds: [], available: false };
    }),
    // Only a label. Never throws.
    orderUsedFirstOrderDiscount(id),
  ]);

  const { refunds, available: refundsAvailable } = refundLedger;

  /*
   * The outbound parcel. A return creates a second, reverse shipment against the
   * same order, and that one does not belong in the fulfilment panel.
   */
  const forwardShipment =
    shipments.find((entry) => entry.shipment_type === "forward") ?? null;

  const scans = forwardShipment ? await getShipmentScans(forwardShipment.id) : [];

  const money = createMoneyFormatter(settings.currency, settings.locale);
  const currencySymbol =
    new Intl.NumberFormat(settings.locale, { style: "currency", currency: settings.currency })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value ?? settings.currency;
  /*
   * Refunds go back through Cashfree, so only a prepaid order that was actually paid has
   * anything to send. A COD order's refund is a manual UPI transfer, handled in the Return
   * panel.
   */
  const canRefundOnline = order.paymentMethod !== "cod" && order.paymentStatus === "paid";
  const refundable = refundableRemaining(order.totals.total, refunds);

  // Only what the browser needs. The ledger row also carries Cashfree's ids.
  const refundViews: RefundView[] = refunds.map((entry) => ({
    id: entry.id,
    amount: entry.amount,
    status: entry.status,
    note: entry.note,
    actorEmail: entry.actorEmail,
    failureReason: entry.failureReason,
    createdAt: entry.createdAt,
    returnId: entry.returnId,
  }));

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
                <Row
                  term={`Discount${
                    order.promoCode ? ` (${order.promoCode})` : usedFirstOrder ? " (first order)" : ""
                  }`}
                  positive
                >
                  −{money(order.totals.discount)}
                </Row>
              ) : null}
              <Row term="Shipping">
                {order.totals.shipping === 0 ? "Complimentary" : money(order.totals.shipping)}
              </Row>
              <Row term="Tax">{money(order.totals.tax)}</Row>
              {order.totals.codFee > 0 ? (
                <Row term="COD fee">{money(order.totals.codFee)}</Row>
              ) : null}
              <div className="mt-1 flex items-baseline justify-between border-t border-line pt-3">
                <dt className="font-medium">Total</dt>
                <dd data-numeric className="text-base">
                  {money(order.totals.total)}
                </dd>
              </div>
              {/*
                Spelled out for whoever is packing: a COD parcel has cash to
                collect, and the amount is the order total including the fee.
              */}
              {order.paymentMethod === "cod" ? (
                <p className="mt-2 border-t border-line pt-3 text-xs leading-relaxed text-content-muted">
                  Cash on delivery —{" "}
                  <span className="font-medium text-content">{money(order.totals.total)}</span>{" "}
                  to collect at the door.
                  {order.paymentStatus === "paid"
                    ? " Collected."
                    : " Not yet collected."}
                </p>
              ) : null}
            </dl>
          </Panel>

          <OrderShipment
            orderId={order.id}
            shipment={forwardShipment}
            scans={scans}
            canWrite={can(admin, "orders:write")}
          />

          <OrderReturns
            returns={returns}
            orderTotal={order.totals.total}
            currencySymbol={currencySymbol}
            canWrite={can(admin, "orders:write")}
            prepaid={order.paymentMethod !== "cod"}
            refundable={refundable}
            refundKey={randomUUID()}
          />

          <OrderRefunds
            orderId={order.id}
            orderTotal={order.totals.total}
            currencySymbol={currencySymbol}
            refunds={refundViews}
            available={refundsAvailable}
            canWrite={can(admin, "orders:write")}
            canRefund={canRefundOnline}
            cancelled={order.status === "cancelled"}
            refundKey={randomUUID()}
          />

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
              <Row term="Status">
                <span
                  className={
                    order.paymentStatus === "paid"
                      ? "text-success-700 dark:text-success-500"
                      : order.paymentStatus === "failed"
                        ? "text-danger-500 dark:text-danger-100"
                        : "text-content-muted"
                  }
                >
                  {order.paymentStatus === "paid"
                    ? "Paid"
                    : order.paymentStatus === "failed"
                      ? "Failed"
                      : "Awaiting payment"}
                </span>
              </Row>
              <Row term="Provider">{order.paymentProvider ?? "Not recorded"}</Row>
              {order.cashfreeOrderId ? (
                <Row term="Cashfree order">
                  <span data-numeric>{order.cashfreeOrderId}</span>
                </Row>
              ) : null}
              {order.cashfreePaymentId ? (
                <Row term="Cashfree payment">
                  <span data-numeric>{order.cashfreePaymentId}</span>
                </Row>
              ) : null}
              {order.paidAt ? (
                <Row term="Paid at">{formatDate(order.paidAt, "short")}</Row>
              ) : null}
              <Row term="Method">
                {order.cardLast4 ? `Card ending ${order.cardLast4}` : "Not recorded"}
              </Row>
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-content-subtle">
              Prepaid orders are refunded from the Refunds panel, back to what the customer
              paid with. A cash-on-delivery return is paid to the customer’s UPI ID by hand;
              see the Return panel. This panel reflects status only.
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
