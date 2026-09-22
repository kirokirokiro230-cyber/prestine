import type { Metadata } from "next";
import Link from "next/link";
import { Panel, StatCard } from "@/components/admin/primitives";
import { BarList, RevenueChart } from "@/components/admin/revenue-chart";
import { createMoneyFormatter } from "@/lib/format";
import { dashboardMetrics, revenueByCategory } from "@/server/metrics";
import { listCustomers, listOrders } from "@/server/repositories/orders";
import { listProducts } from "@/server/repositories/products";
import { getSettings } from "@/server/repositories/settings";
import { requireAdmin } from "@/server/session";

export const metadata: Metadata = { title: "Reports" };

const WINDOWS = [7, 30, 90, 365];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireAdmin();
  const { days: rawDays } = await searchParams;
  const days = WINDOWS.includes(Number(rawDays)) ? Number(rawDays) : 90;

  const [settings, metrics, byCategory, products, orders, customers] = await Promise.all([
    getSettings(),
    dashboardMetrics({ days }),
    revenueByCategory(),
    listProducts(),
    listOrders(),
    listCustomers(),
  ]);

  const money = createMoneyFormatter(settings.currency, settings.locale);

  /* Margin analysis — only meaningful where a unit cost has been entered. */
  const withCost = products.filter((product) => typeof product.costPrice === "number");
  const marginRows = withCost
    .map((product) => ({
      label: product.name,
      value: Math.round(((product.price - product.costPrice!) / product.price) * 100),
      meta: `${money(product.price - product.costPrice!)} per unit`,
      href: `/admin/products/${product.id}`,
    }))
    .sort((a, b) => b.value - a.value);

  /**
   * Units sold per product.
   *
   * This used to be sell-through — units sold as a share of units sold plus units on
   * hand. That ratio needs an inventory count, and the shop does not keep one, so it
   * would have been a percentage of an invented denominator. Absolute units sold is the
   * honest version of the same question: what is actually moving.
   */
  const soldByProduct = new Map<string, number>();
  for (const order of orders) {
    if (order.status === "cancelled") continue;
    for (const line of order.lines) {
      soldByProduct.set(line.slug, (soldByProduct.get(line.slug) ?? 0) + line.quantity);
    }
  }

  const unitsSold = products
    .map((product) => {
      const sold = soldByProduct.get(product.slug) ?? 0;
      return {
        label: product.name,
        value: sold,
        meta: `${sold} ${sold === 1 ? "unit" : "units"}`,
        href: `/admin/products/${product.id}`,
      };
    })
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const repeatCustomers = customers.filter((customer) => customer.orderCount > 1);
  const lifetime = customers.reduce((sum, customer) => sum + customer.totalSpent, 0);

  const activeProducts = products.filter(
    (product) => (product.status ?? "active") === "active",
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl leading-tight">Reports</h1>
          <p className="mt-1.5 text-sm text-content-muted">
            Cancelled orders are excluded from every revenue figure.
          </p>
        </div>

        <nav aria-label="Reporting period" className="flex items-center gap-1">
          {WINDOWS.map((window) => (
            <Link
              key={window}
              href={`/admin/reports?days=${window}`}
              aria-current={window === days ? "page" : undefined}
              className={
                window === days
                  ? "border border-line-strong bg-inverse px-3 py-2 text-2xs uppercase tracking-[0.1em] text-on-inverse"
                  : "border border-line px-3 py-2 text-2xs uppercase tracking-[0.1em] text-content-muted transition-colors hover:border-line-strong hover:text-content"
              }
            >
              {window === 365 ? "12 months" : `${window} days`}
            </Link>
          ))}
        </nav>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`Revenue · ${days}d`}
          value={money(metrics.revenue)}
          change={metrics.revenueChange}
        />
        <StatCard label="Units sold" value={String(metrics.units)} />
        <StatCard
          label="Repeat rate"
          value={
            customers.length === 0
              ? "—"
              : `${Math.round((repeatCustomers.length / customers.length) * 100)}%`
          }
          hint={`${repeatCustomers.length} of ${customers.length}`}
        />
        <StatCard
          label="Lifetime revenue"
          value={money(lifetime)}
          hint={`${activeProducts} active products`}
        />
      </div>

      <Panel title="Revenue" description={`Daily totals over the last ${days} days.`}>
        <RevenueChart series={metrics.series} formatMoney={money} />
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Revenue by product" description="All time, merchandise only.">
          <BarList
            items={metrics.topProducts.map((product) => ({
              label: product.name,
              value: product.revenue,
              meta: `${product.units} units`,
              href: `/product/${product.slug}`,
            }))}
            formatValue={money}
          />
        </Panel>

        <Panel title="Revenue by category" description="All time.">
          <BarList
            items={byCategory.map((entry) => ({
              label: entry.category,
              value: entry.revenue,
              meta: `${entry.units} units`,
              href: `/admin/products?category=${entry.category}`,
            }))}
            formatValue={money}
          />
        </Panel>

        <Panel
          title="Gross margin"
          description="Selling price against unit cost. Only products with a cost entered appear."
        >
          <BarList
            items={marginRows.slice(0, 10)}
            formatValue={(value) => `${value}%`}
            emptyLabel="No unit costs recorded. Add a cost on a product to see its margin."
          />
          {marginRows.length > 0 ? (
            <p className="mt-4 border-t border-line pt-3 text-xs text-content-muted">
              Average margin across {marginRows.length} product
              {marginRows.length === 1 ? "" : "s"}:{" "}
              <span data-numeric className="text-content">
                {Math.round(
                  marginRows.reduce((sum, row) => sum + row.value, 0) / marginRows.length,
                )}
                %
              </span>
            </p>
          ) : null}
        </Panel>

        <Panel
          title="Units sold"
          description="Total units shipped per product. Cancelled orders excluded."
        >
          <BarList
            items={unitsSold}
            formatValue={(value) => String(value)}
            emptyLabel="No sales recorded yet."
          />
        </Panel>
      </div>

      <Panel
        title="Best customers"
        description="By lifetime spend."
        action={
          <Link
            href="/admin/customers"
            className="text-2xs uppercase tracking-[0.1em] text-content-muted transition-colors hover:text-content"
          >
            <span className="link-underline">All customers</span>
          </Link>
        }
      >
        <BarList
          items={customers.slice(0, 8).map((customer) => ({
            label: customer.name,
            value: customer.totalSpent,
            meta: `${customer.orderCount} order${customer.orderCount === 1 ? "" : "s"}`,
          }))}
          formatValue={money}
          emptyLabel="No customers yet."
        />
      </Panel>
    </div>
  );
}
