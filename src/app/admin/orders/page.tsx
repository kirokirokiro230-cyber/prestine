import type { Metadata } from "next";
import Link from "next/link";
import { Panel, StatCard, StatusPill } from "@/components/admin/primitives";
import { OrderFilters } from "@/components/admin/order-filters";
import { createMoneyFormatter, formatDate } from "@/lib/format";
import type { Order } from "@/lib/types";
import { dashboardMetrics } from "@/server/metrics";
import { queryOrders } from "@/server/repositories/orders";
import { getSettings } from "@/server/repositories/settings";
import { requireAdmin } from "@/server/session";

export const metadata: Metadata = { title: "Orders" };

const SORTS = ["date-desc", "date-asc", "total-desc", "total-asc"] as const;

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;

  const status = (["processing", "shipped", "delivered", "cancelled"] as Order["status"][]).includes(
    params.status as Order["status"],
  )
    ? (params.status as Order["status"])
    : "all";

  const sort = SORTS.includes(params.sort as (typeof SORTS)[number])
    ? (params.sort as (typeof SORTS)[number])
    : "date-desc";

  const [result, settings, metrics] = await Promise.all([
    queryOrders({
      search: params.q,
      status,
      from: params.from,
      to: params.to,
      sort,
      page: Math.max(1, Number(params.page ?? 1) || 1),
      perPage: 25,
    }),
    getSettings(),
    dashboardMetrics({ days: 30 }),
  ]);

  const money = createMoneyFormatter(settings.currency, settings.locale);

  // Totals for the current filter, not just the visible page — that is the number a
  // merchant reconciling a day's takings actually wants.
  const filteredRevenue = result.items.reduce(
    (sum, order) => (order.status === "cancelled" ? sum : sum + order.totals.total),
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl leading-tight">Orders</h1>
        <p data-numeric className="mt-1.5 text-sm text-content-muted">
          {result.total} order{result.total === 1 ? "" : "s"}
          {status !== "all" ? ` · ${status}` : ""}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="To fulfil"
          value={String(metrics.statusCounts.processing)}
          hint="Awaiting dispatch"
          href="/admin/orders?status=processing"
        />
        <StatCard
          label="In transit"
          value={String(metrics.statusCounts.shipped)}
          href="/admin/orders?status=shipped"
        />
        <StatCard label="Revenue · 30d" value={money(metrics.revenue)} change={metrics.revenueChange} />
        <StatCard label="Average order" value={money(metrics.averageOrderValue)} change={metrics.aovChange} />
      </div>

      <Panel
        title="All orders"
        description="Search by reference, customer, city, postcode, email or tracking number."
        bodyClassName="px-0 py-0"
      >
        <OrderFilters />

        {result.items.length === 0 ? (
          <p className="px-5 py-16 text-center text-sm text-content-muted">
            No orders match those filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-3xl text-sm">
              <caption className="sr-only">
                Orders, page {result.page} of {result.totalPages}
              </caption>
              <thead>
                <tr className="border-b border-line text-left">
                  {["Order", "Placed", "Customer", "Items", "Status", "Total"].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className={
                        heading === "Total" || heading === "Items"
                          ? "px-3 py-2.5 text-right text-2xs font-medium uppercase tracking-[0.1em] text-content-muted"
                          : "px-3 py-2.5 text-2xs font-medium uppercase tracking-[0.1em] text-content-muted"
                      }
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {result.items.map((order) => {
                  const units = order.lines.reduce((sum, line) => sum + line.quantity, 0);

                  return (
                    <tr key={order.id} className="border-b border-line last:border-0">
                      <td className="px-3 py-3 pl-5">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          data-numeric
                          className="link-underline font-medium"
                        >
                          {order.id}
                        </Link>
                        {order.trackingNumber ? (
                          <span data-numeric className="block text-xs text-content-subtle">
                            {order.carrier} {order.trackingNumber}
                          </span>
                        ) : null}
                      </td>

                      <td className="px-3 py-3 text-content-muted">
                        {formatDate(order.placedAt, "short")}
                      </td>

                      <td className="px-3 py-3">
                        <span className="block truncate">
                          {order.shippingAddress.firstName} {order.shippingAddress.lastName}
                        </span>
                        <span className="block truncate text-xs text-content-subtle">
                          {order.email ?? order.shippingAddress.city}
                        </span>
                      </td>

                      <td data-numeric className="px-3 py-3 text-right text-content-muted">
                        {units}
                      </td>

                      <td className="px-3 py-3">
                        <StatusPill status={order.status} />
                      </td>

                      <td data-numeric className="px-3 py-3 pr-5 text-right">
                        {money(order.totals.total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-xs text-content-muted">
          <p data-numeric>
            Page {result.page} of {result.totalPages} · {money(filteredRevenue)} on this page
          </p>

          <div className="flex items-center gap-2">
            {result.page > 1 ? (
              <Link
                href={`/admin/orders?${new URLSearchParams({ ...params, page: String(result.page - 1) } as Record<string, string>).toString()}`}
                className="link-underline"
              >
                Previous
              </Link>
            ) : null}
            {result.page < result.totalPages ? (
              <Link
                href={`/admin/orders?${new URLSearchParams({ ...params, page: String(result.page + 1) } as Record<string, string>).toString()}`}
                className="link-underline"
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      </Panel>
    </div>
  );
}
