import type { DashboardMetrics, MetricPoint, Order } from "@/lib/types";
import { listOrders } from "./repositories/orders";

/**
 * Reporting.
 *
 * Cancelled orders are excluded from revenue everywhere — counting them would
 * flatter the numbers and make the dashboard useless for deciding anything.
 * Revenue means merchandise plus shipping and tax actually charged, which is what
 * reconciles against a payment provider.
 */

const DAY_MS = 86_400_000;

function isCounted(order: Order): boolean {
  return order.status !== "cancelled";
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Percentage change, or null when the previous window had nothing to compare to. */
function change(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export interface MetricsOptions {
  /** Window length in days, counted back from today. */
  days?: number;
  /** Reference "now", for deterministic tests. */
  now?: Date;
}

export async function dashboardMetrics(
  options: MetricsOptions = {},
): Promise<DashboardMetrics> {
  const { days = 30, now = new Date() } = options;
  const orders = await listOrders();

  const end = now.getTime();
  const start = end - days * DAY_MS;
  const previousStart = start - days * DAY_MS;

  const counted = orders.filter(isCounted);

  const inWindow = counted.filter((order) => {
    const at = new Date(order.placedAt).getTime();
    return at >= start && at <= end;
  });

  const inPrevious = counted.filter((order) => {
    const at = new Date(order.placedAt).getTime();
    return at >= previousStart && at < start;
  });

  const sumRevenue = (orders: Order[]) =>
    orders.reduce((total, order) => total + order.totals.total, 0);

  const sumUnits = (orders: Order[]) =>
    orders.reduce(
      (total, order) =>
        total + order.lines.reduce((lineTotal, line) => lineTotal + line.quantity, 0),
      0,
    );

  const revenue = sumRevenue(inWindow);
  const previousRevenue = sumRevenue(inPrevious);
  const orderCount = inWindow.length;
  const units = sumUnits(inWindow);

  const aov = orderCount === 0 ? 0 : Math.round(revenue / orderCount);
  const previousAov =
    inPrevious.length === 0 ? 0 : Math.round(previousRevenue / inPrevious.length);

  /* -------------------------------------------------------------- */
  /* Daily series — every day present, including zeros              */
  /* -------------------------------------------------------------- */

  const buckets = new Map<string, MetricPoint>();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const key = dayKey(new Date(end - offset * DAY_MS).toISOString());
    buckets.set(key, { date: key, revenue: 0, orders: 0, units: 0 });
  }

  for (const order of inWindow) {
    const bucket = buckets.get(dayKey(order.placedAt));
    if (!bucket) continue;
    bucket.revenue += order.totals.total;
    bucket.orders += 1;
    bucket.units += order.lines.reduce((sum, line) => sum + line.quantity, 0);
  }

  /* -------------------------------------------------------------- */
  /* Top products, all time                                         */
  /* -------------------------------------------------------------- */

  const productTotals = new Map<string, { name: string; units: number; revenue: number }>();
  for (const order of counted) {
    for (const line of order.lines) {
      const entry = productTotals.get(line.slug) ?? {
        name: line.name,
        units: 0,
        revenue: 0,
      };
      entry.units += line.quantity;
      entry.revenue += line.unitPrice * line.quantity;
      productTotals.set(line.slug, entry);
    }
  }

  const topProducts = [...productTotals.entries()]
    .map(([slug, entry]) => ({ slug, ...entry }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  /* -------------------------------------------------------------- */
  /* Fulfilment queue                                                */
  /* -------------------------------------------------------------- */

  const statusCounts: Record<Order["status"], number> = {
    processing: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
  };
  for (const order of orders) statusCounts[order.status] += 1;

  return {
    revenue,
    orders: orderCount,
    units,
    averageOrderValue: aov,
    revenueChange: change(revenue, previousRevenue),
    ordersChange: change(orderCount, inPrevious.length),
    aovChange: change(aov, previousAov),
    series: [...buckets.values()],
    topProducts,
    statusCounts,
  };
}

/** Revenue split by category, for the dashboard breakdown. */
export async function revenueByCategory(): Promise<
  Array<{ category: string; revenue: number; units: number }>
> {
  const orders = await listOrders();
  const totals = new Map<string, { revenue: number; units: number }>();

  for (const order of orders) {
    if (!isCounted(order)) continue;
    for (const line of order.lines) {
      const entry = totals.get(line.category) ?? { revenue: 0, units: 0 };
      entry.revenue += line.unitPrice * line.quantity;
      entry.units += line.quantity;
      totals.set(line.category, entry);
    }
  }

  return [...totals.entries()]
    .map(([category, entry]) => ({ category, ...entry }))
    .sort((a, b) => b.revenue - a.revenue);
}
