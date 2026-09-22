import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { Panel, StatCard } from "@/components/admin/primitives";
import { Badge } from "@/components/ui/badge";
import { addressName, createMoneyFormatter, formatDate } from "@/lib/format";
import { getCustomer } from "@/server/repositories/orders";
import { getSettings } from "@/server/repositories/settings";
import { requireAdmin } from "@/server/session";

export const metadata: Metadata = { title: "Customer" };

const STATUS_TONE = {
  processing: "accent",
  shipped: "new",
  delivered: "eco",
  cancelled: "muted",
} as const;

/**
 * One customer, assembled from their orders.
 *
 * There is no customers table — guests can check out, so the orders *are* the record.
 * The route key is the grouping key from `listCustomers`: an email address, or
 * `name|phone` for an order placed without one. It arrives percent-encoded because both
 * forms contain characters that are not safe in a path segment.
 *
 * Everything here is read-only, which is not a limitation to be fixed later: there is no
 * row to write to. Editing a name would mean rewriting it across every order, which is
 * falsifying history rather than correcting a record.
 */
export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  await requireAdmin();

  const [{ key }, settings] = await Promise.all([params, getSettings()]);

  const found = await getCustomer(decodeURIComponent(key));
  // A 404 rather than an empty page, which would read as "a customer with no orders".
  if (!found) notFound();

  const { customer, orders } = found;
  const money = createMoneyFormatter(settings.currency, settings.locale);

  // The most recent address is the one worth showing — people move.
  const latest = orders[0];

  const cancelled = orders.filter((order) => order.status === "cancelled").length;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link
          href="/admin/customers"
          className="inline-flex items-center gap-1.5 text-2xs uppercase tracking-[0.12em] text-content-muted transition-colors hover:text-content"
        >
          <ArrowLeft size={12} aria-hidden />
          All customers
        </Link>

        <h1 className="mt-3 font-display text-3xl leading-tight">{customer.name}</h1>
        <p className="mt-1.5 text-sm text-content-muted">
          {customer.email === "—" ? (
            "No email captured — grouped by name and phone number."
          ) : (
            <a href={`mailto:${customer.email}`} className="link-underline">
              {customer.email}
            </a>
          )}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Orders" value={String(customer.orderCount)} />
        <StatCard
          label="Lifetime value"
          value={money(customer.totalSpent)}
          hint={`${money(customer.averageOrderValue)} average`}
        />
        <StatCard
          label="First order"
          value={formatDate(customer.firstOrderAt, "short")}
          hint={`Last ${formatDate(customer.lastOrderAt, "short")}`}
        />
        <StatCard
          label="Cancelled"
          value={String(cancelled)}
          hint={cancelled > 0 ? "See reasons below" : "None"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_20rem] xl:items-start">
        <Panel title="Order history" description="Most recent first.">
          <ul className="mt-2 flex flex-col divide-y divide-line border-y border-line">
            {orders.map((order) => (
              <li key={order.id} className="flex flex-col gap-2 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      data-numeric
                      className="link-underline font-sans text-sm font-medium"
                    >
                      {order.id}
                    </Link>
                    <Badge tone={STATUS_TONE[order.status]}>{order.status}</Badge>
                  </div>

                  <div className="flex items-center gap-5 text-xs text-content-muted">
                    <span>{formatDate(order.placedAt, "short")}</span>
                    <span data-numeric className="font-medium text-content">
                      {money(order.totals.total)}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-content-subtle">
                  {order.lines.map((line) => `${line.quantity}× ${line.name}`).join(", ")}
                </p>

                {/* Surfaced here so a pattern of cancellations is visible at a glance. */}
                {order.cancellationReason ? (
                  <p className="text-xs leading-relaxed text-content-muted">
                    <span className="font-medium text-content">Cancelled:</span>{" "}
                    {order.cancellationReason}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Latest address" description="From their most recent order.">
          {latest ? (
            <address className="mt-2 text-sm not-italic leading-relaxed text-content-muted">
              <span className="block font-medium text-content">
                {addressName(latest.shippingAddress)}
              </span>
              {latest.shippingAddress.line1}
              {latest.shippingAddress.line2 ? (
                <>
                  <br />
                  {latest.shippingAddress.line2}
                </>
              ) : null}
              <br />
              {latest.shippingAddress.city}, {latest.shippingAddress.region}
              {latest.shippingAddress.postalCode ? (
                <>
                  <br />
                  {latest.shippingAddress.postalCode}
                </>
              ) : null}
              {latest.shippingAddress.country ? (
                <>
                  <br />
                  {latest.shippingAddress.country}
                </>
              ) : null}
              {latest.shippingAddress.phone ? (
                <>
                  <br />
                  <span data-numeric>{latest.shippingAddress.phone}</span>
                </>
              ) : null}
            </address>
          ) : null}
        </Panel>
      </div>

      <p className="text-xs leading-relaxed text-content-subtle">
        Assembled from {customer.orderCount}{" "}
        {customer.orderCount === 1 ? "order" : "orders"} — there is no customer record to
        edit. Correct a name or address on the order it belongs to.
      </p>
    </div>
  );
}
