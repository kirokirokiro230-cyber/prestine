import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Package, Receipt, Warning } from "@phosphor-icons/react/dist/ssr";
import { BarList, RevenueChart } from "@/components/admin/revenue-chart";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Panel, StatCard, StatusPill } from "@/components/admin/primitives";
import { createMoneyFormatter, formatDate } from "@/lib/format";
import { listAudit } from "@/server/audit";
import { dashboardMetrics, revenueByCategory } from "@/server/metrics";
import { queryOrders } from "@/server/repositories/orders";
import { getSettings } from "@/server/repositories/settings";
import { requireAdmin } from "@/server/session";

export const metadata: Metadata = { title: "Dashboard" };

const WINDOWS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "12 months" },
];

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const admin = await requireAdmin();
  const { days: rawDays } = await searchParams;

  const days = WINDOWS.some((window) => String(window.days) === rawDays)
    ? Number(rawDays)
    : 30;

  const [settings, metrics, byCategory, recentOrders, audit] = await Promise.all([
    getSettings(),
    dashboardMetrics({ days }),
    revenueByCategory(),
    queryOrders({ perPage: 6, sort: "date-desc" }),
    listAudit(8),
  ]);

  const money = createMoneyFormatter(settings.currency, settings.locale);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        eyebrow="Overview"
        title={`${greeting()}, ${admin.name.split(" ")[0]}`}
        description={
          metrics.statusCounts.processing > 0
            ? `${metrics.statusCounts.processing} order${
                metrics.statusCounts.processing === 1 ? "" : "s"
              } waiting to be fulfilled.`
            : "Everything is up to date. Nothing is waiting to be fulfilled."
        }
        actions={
          <nav
            aria-label="Reporting period"
            className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1 shadow-xs"
          >
            {WINDOWS.map((window) => (
              <Link
                key={window.days}
                href={`/admin?days=${window.days}`}
                aria-current={window.days === days ? "page" : undefined}
                className={
                  window.days === days
                    ? "rounded-lg bg-accent px-3 py-2 text-2xs font-bold uppercase tracking-[0.1em] text-on-accent shadow-sm"
                    : "rounded-lg px-3 py-2 text-2xs font-semibold uppercase tracking-[0.1em] text-content-muted transition-colors hover:bg-surface-sunken hover:text-content"
                }
              >
                {window.label}
              </Link>
            ))}
          </nav>
        }
      />

      {/* Headline metrics */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`Revenue · ${days}d`}
          value={money(metrics.revenue)}
          change={metrics.revenueChange}
          hint="vs previous period"
        />
        <StatCard
          label={`Orders · ${days}d`}
          value={String(metrics.orders)}
          change={metrics.ordersChange}
          hint={`${metrics.units} units`}
        />
        <StatCard
          label="Average order"
          value={money(metrics.averageOrderValue)}
          change={metrics.aovChange}
        />
        <StatCard
          label="To fulfil"
          value={String(metrics.statusCounts.processing)}
          hint={metrics.statusCounts.processing === 1 ? "order waiting" : "orders waiting"}
          href="/admin/orders?status=processing"
        />
      </div>

      <Panel
        title="Revenue"
        description={`Daily totals for the last ${days} days. Cancelled orders excluded.`}
      >
        <RevenueChart series={metrics.series} formatMoney={money} />
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="Best sellers"
          description="By revenue, all time."
          action={
            <Link
              href="/admin/reports"
              className="inline-flex items-center gap-1.5 text-2xs uppercase tracking-[0.1em] text-content-muted transition-colors hover:text-content"
            >
              <span className="link-underline">Reports</span>
              <ArrowRight size={12} aria-hidden />
            </Link>
          }
        >
          <BarList
            items={metrics.topProducts.map((product) => ({
              label: product.name,
              value: product.revenue,
              meta: `${product.units} sold`,
              href: `/product/${product.slug}`,
            }))}
            formatValue={money}
            emptyLabel="No sales recorded yet."
          />
        </Panel>

        <Panel title="Revenue by category" description="All time, merchandise only.">
          <BarList
            items={byCategory.map((entry) => ({
              label: entry.category,
              value: entry.revenue,
              meta: `${entry.units} units`,
              href: `/admin/products?category=${entry.category}`,
            }))}
            formatValue={money}
            emptyLabel="No sales recorded yet."
          />
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        {/* Recent orders */}
        <Panel
          title="Recent orders"
          action={
            <Link
              href="/admin/orders"
              className="inline-flex items-center gap-1.5 text-2xs uppercase tracking-[0.1em] text-content-muted transition-colors hover:text-content"
            >
              <span className="link-underline">All orders</span>
              <ArrowRight size={12} aria-hidden />
            </Link>
          }
          bodyClassName="px-0 py-0"
        >
          {recentOrders.items.length === 0 ? (
            <p className="px-5 py-8 text-sm text-content-muted">
              No orders yet. They will appear here the moment one is placed.
            </p>
          ) : (
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
              <caption className="sr-only">Most recent orders</caption>
              <thead>
                <tr className="border-b border-line text-left">
                  <th scope="col" className="px-5 py-2.5 text-2xs font-medium uppercase tracking-[0.1em] text-content-muted">
                    Order
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-2xs font-medium uppercase tracking-[0.1em] text-content-muted">
                    Customer
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-2xs font-medium uppercase tracking-[0.1em] text-content-muted">
                    Status
                  </th>
                  <th scope="col" className="px-5 py-2.5 text-right text-2xs font-medium uppercase tracking-[0.1em] text-content-muted">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.items.map((order) => (
                  <tr key={order.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        data-numeric
                        className="link-underline font-medium"
                      >
                        {order.id}
                      </Link>
                      <span className="block text-xs text-content-subtle">
                        {formatDate(order.placedAt, "short")}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="block truncate">
                        {order.shippingAddress.firstName} {order.shippingAddress.lastName}
                      </span>
                      <span className="block truncate text-xs text-content-subtle">
                        {order.shippingAddress.city}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill status={order.status} />
                    </td>
                    <td data-numeric className="px-5 py-3 text-right">
                      {money(order.totals.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="flex flex-col gap-6">
          {/* Fulfilment queue */}
          <Panel title="Fulfilment">
            <dl className="grid grid-cols-2 gap-4">
              {(
                [
                  ["processing", "To fulfil", Receipt],
                  ["shipped", "In transit", Package],
                  ["delivered", "Delivered", Package],
                  ["cancelled", "Cancelled", Warning],
                ] as const
              ).map(([status, label, Icon]) => (
                <div key={status} className="rounded-xl border border-line bg-surface-sunken/50 px-3 py-3 transition-colors hover:border-line-strong">
                  <dt className="flex items-center gap-1.5 text-2xs uppercase tracking-[0.1em] text-content-muted">
                    <Icon size={12} aria-hidden />
                    {label}
                  </dt>
                  <dd data-numeric className="mt-2 font-sans text-2xl font-bold leading-none tracking-[-0.03em]">
                    <Link href={`/admin/orders?status=${status}`} className="hover:text-accent">
                      {metrics.statusCounts[status]}
                    </Link>
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>

        </div>
      </div>

      {/* Activity */}
      <Panel
        title="Recent activity"
        description="Every change is recorded with who made it."
        action={
          <Link
            href="/admin/activity"
            className="text-2xs uppercase tracking-[0.1em] text-content-muted transition-colors hover:text-content"
          >
            <span className="link-underline">Full log</span>
          </Link>
        }
      >
        {audit.length === 0 ? (
          <p className="text-sm text-content-muted">Nothing logged yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {audit.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 first:pt-0 last:pb-0">
                <span className="text-sm">{entry.summary}</span>
                <span className="text-xs text-content-subtle">
                  {entry.actorEmail} · {formatDate(entry.at, "short")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
