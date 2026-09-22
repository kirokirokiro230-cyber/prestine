import { eq, inArray } from "drizzle-orm";
import { addressName } from "@/lib/format";
import type { Order } from "@/lib/types";
import { getDb, isDatabaseConfigured } from "../db/client";
import { fromOrder, toOrder } from "../db/mappers";
import { orderLines, orders as ordersTable } from "../db/schema";
import { mutateStore, readStore } from "../store";

/**
 * Order persistence and lifecycle.
 *
 * Status transitions are validated here rather than in the UI, so an order cannot
 * be moved from delivered back to processing by a crafted request.
 *
 * Two backends, chosen by whether a database is configured — see `login-attempts.ts`
 * for the precedent. Against Postgres, an order's lines live in `order_lines`
 * (see `schema.ts`); every write is wrapped in a transaction so the order and its
 * lines change atomically, the same guarantee the JSON store gets for free from its
 * write queue.
 */

export interface OrderQuery {
  search?: string;
  status?: Order["status"] | "all";
  /** Inclusive ISO dates. */
  from?: string;
  to?: string;
  sort?: "date-desc" | "date-asc" | "total-desc" | "total-asc";
  page?: number;
  perPage?: number;
}

async function assembleOrders(
  db: ReturnType<typeof getDb>,
  rows: (typeof ordersTable.$inferSelect)[],
): Promise<Order[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const lines = await db.select().from(orderLines).where(inArray(orderLines.orderId, ids));
  return rows.map((row) => toOrder(row, lines.filter((line) => line.orderId === row.id)));
}

export async function listOrders(): Promise<Order[]> {
  if (!isDatabaseConfigured()) {
    return (await readStore()).orders;
  }

  const db = getDb();
  const rows = await db.select().from(ordersTable);
  return assembleOrders(db, rows);
}

export async function getOrder(id: string): Promise<Order | undefined> {
  if (!isDatabaseConfigured()) {
    return (await readStore()).orders.find((order) => order.id === id);
  }

  const db = getDb();
  const [row] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!row) return undefined;
  const [assembled] = await assembleOrders(db, [row]);
  return assembled;
}

export async function queryOrders(query: OrderQuery = {}) {
  const {
    search,
    status = "all",
    from,
    to,
    sort = "date-desc",
    page = 1,
    perPage = 20,
  } = query;

  const needle = search?.trim().toLowerCase();

  // Both backends filter/sort/paginate in application code over the full set, for the
  // same reason `queryProducts` does — the search haystack must behave identically on
  // both backends rather than being re-derived in SQL.
  const all = await listOrders();

  let items = all.filter((order) => {
    if (status !== "all" && order.status !== status) return false;
    if (from && order.placedAt < from) return false;
    // `to` is an inclusive date, so compare against the end of that day.
    if (to && order.placedAt > `${to}T23:59:59.999Z`) return false;

    if (needle) {
      const haystack = [
        order.id,
        // Reads both address shapes, so a search still finds a historical order.
        addressName(order.shippingAddress),
        order.shippingAddress.city,
        order.shippingAddress.postalCode ?? "",
        order.shippingAddress.phone ?? "",
        order.email ?? "",
        order.trackingNumber ?? "",
        order.lines.map((line) => line.name).join(" "),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }

    return true;
  });

  items = [...items].sort((a, b) => {
    switch (sort) {
      case "date-asc":
        return a.placedAt.localeCompare(b.placedAt);
      case "total-desc":
        return b.totals.total - a.totals.total;
      case "total-asc":
        return a.totals.total - b.totals.total;
      case "date-desc":
      default:
        return b.placedAt.localeCompare(a.placedAt);
    }
  });

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);

  return {
    items: items.slice((safePage - 1) * perPage, safePage * perPage),
    total,
    page: safePage,
    perPage,
    totalPages,
  };
}

export async function createOrder(order: Order): Promise<Order> {
  if (!isDatabaseConfigured()) {
    return mutateStore((store) => {
      store.orders.unshift(order);
      return order;
    });
  }

  return getDb().transaction(async (tx) => {
    const rows = fromOrder(order);
    await tx.insert(ordersTable).values(rows.order);
    if (rows.lines.length > 0) await tx.insert(orderLines).values(rows.lines);
    return order;
  });
}

/**
 * Allowed status moves.
 *
 * Forward-only, except that anything not yet delivered can be cancelled. This
 * prevents an accidental click from un-shipping a parcel that is already gone.
 */
const TRANSITIONS: Record<Order["status"], Order["status"][]> = {
  processing: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export function canTransition(from: Order["status"], to: Order["status"]): boolean {
  return TRANSITIONS[from].includes(to);
}

export async function updateOrderStatus(
  id: string,
  status: Order["status"],
  options: { trackingNumber?: string; carrier?: string; reason?: string } = {},
): Promise<Order> {
  if (!isDatabaseConfigured()) {
    const order = await getOrder(id);
    if (!order) throw new Error(`Order ${id} not found`);

    if (!canTransition(order.status, status)) {
      throw new Error(`Cannot move an order from ${order.status} to ${status}.`);
    }

    return mutateStore((store) => {
      const target = store.orders.find((entry) => entry.id === id);
      if (!target) throw new Error(`Order ${id} not found`);

      target.status = status;
      if (options.trackingNumber !== undefined) {
        target.trackingNumber = options.trackingNumber || undefined;
      }
      if (options.carrier !== undefined) target.carrier = options.carrier || undefined;
      if (status === "shipped") target.shippedAt = new Date().toISOString();
      if (status === "delivered") target.deliveredAt = new Date().toISOString();
      if (status === "cancelled") {
        target.cancelledAt = new Date().toISOString();
        /*
         * Only set on the transition, never cleared. A reason is a record of why
         * something happened, so a later write with no reason must not erase it.
         */
        if (options.reason?.trim()) target.cancellationReason = options.reason.trim();
      }

      return target;
    });
  }

  return getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(ordersTable).where(eq(ordersTable.id, id));
    if (!row) throw new Error(`Order ${id} not found`);

    if (!canTransition(row.status, status)) {
      throw new Error(`Cannot move an order from ${row.status} to ${status}.`);
    }

    const patch: Partial<typeof ordersTable.$inferInsert> = { status };
    if (options.trackingNumber !== undefined) {
      patch.trackingNumber = options.trackingNumber || null;
    }
    if (options.carrier !== undefined) patch.carrier = options.carrier || null;
    if (status === "shipped") patch.shippedAt = new Date();
    if (status === "delivered") patch.deliveredAt = new Date();
    if (status === "cancelled") {
      patch.cancelledAt = new Date();
      // Only set on the transition, never cleared — see the JSON-store branch above.
      if (options.reason?.trim()) patch.cancellationReason = options.reason.trim();
    }

    const [updated] = await tx
      .update(ordersTable)
      .set(patch)
      .where(eq(ordersTable.id, id))
      .returning();
    const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, id));
    return toOrder(updated, lines);
  });
}

/**
 * Cancel an order at the customer's request.
 *
 * Separate from `updateOrderStatus` because the authority is different: an admin action
 * is gated on `orders:write`, whereas this is gated on the caller proving they hold the
 * claim ticket — which the calling server action checks, exactly as order lookup does.
 *
 * Only an order that has not shipped can be cancelled this way. Once a parcel is with a
 * courier, stopping it is a conversation rather than a button, and pretending otherwise
 * would leave the customer believing a delivery is not coming.
 */
export async function cancelOrderAsCustomer(id: string, reason: string): Promise<Order> {
  const order = await getOrder(id);
  if (!order) throw new Error(`Order ${id} not found`);

  if (order.status !== "processing") {
    throw new Error(
      order.status === "cancelled"
        ? "This order has already been cancelled."
        : `This order is already ${order.status} and can no longer be cancelled online.`,
    );
  }

  return updateOrderStatus(id, "cancelled", { reason });
}

/** Attach or replace tracking details without changing status. */
export async function setTracking(
  id: string,
  carrier: string,
  trackingNumber: string,
): Promise<Order> {
  if (!isDatabaseConfigured()) {
    return mutateStore((store) => {
      const order = store.orders.find((entry) => entry.id === id);
      if (!order) throw new Error(`Order ${id} not found`);

      order.carrier = carrier || undefined;
      order.trackingNumber = trackingNumber || undefined;
      return order;
    });
  }

  return getDb().transaction(async (tx) => {
    const [updated] = await tx
      .update(ordersTable)
      .set({ carrier: carrier || null, trackingNumber: trackingNumber || null })
      .where(eq(ordersTable.id, id))
      .returning();
    if (!updated) throw new Error(`Order ${id} not found`);
    const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, id));
    return toOrder(updated, lines);
  });
}

/** Internal note visible only in admin. */
export async function addOrderNote(id: string, note: string): Promise<Order> {
  if (!isDatabaseConfigured()) {
    return mutateStore((store) => {
      const order = store.orders.find((entry) => entry.id === id);
      if (!order) throw new Error(`Order ${id} not found`);

      order.notes = [
        ...(order.notes ?? []),
        { at: new Date().toISOString(), body: note },
      ];
      return order;
    });
  }

  return getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(ordersTable).where(eq(ordersTable.id, id));
    if (!row) throw new Error(`Order ${id} not found`);

    const notes = [...(row.notes ?? []), { at: new Date().toISOString(), body: note }];
    const [updated] = await tx
      .update(ordersTable)
      .set({ notes })
      .where(eq(ordersTable.id, id))
      .returning();
    const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, id));
    return toOrder(updated, lines);
  });
}

/**
 * Customers, derived from order history.
 *
 * There is no separate customer table because guests can check out — the orders
 * are the record. Grouped by email, falling back to name plus postcode when an
 * order predates email capture.
 */
export interface CustomerSummary {
  key: string;
  name: string;
  email: string;
  city: string;
  /** Country on legacy orders, state/county on ones placed since the form was reduced. */
  country: string;
  /** The contact number from the most recent address seen for this customer. */
  phone: string;
  orderCount: number;
  /** Lifetime value in minor units. */
  totalSpent: number;
  averageOrderValue: number;
  firstOrderAt: string;
  lastOrderAt: string;
  orderIds: string[];
}

export async function listCustomers(): Promise<CustomerSummary[]> {
  const orders = await listOrders();
  const map = new Map<string, CustomerSummary>();

  for (const order of orders) {
    const address = order.shippingAddress;
    const name = addressName(address);
    /*
     * Email is the identity where it was captured. The fallback used to be
     * name + postcode; since checkout no longer collects a postcode it is
     * name + phone, which is at least as distinguishing and is always present on a
     * new order. Legacy orders keep resolving through their postcode.
     */
    const fallback = address.phone?.trim() || address.postalCode?.trim() || address.city;
    const key = (order.email ?? `${name}|${fallback}`).toLowerCase();

    const existing = map.get(key);
    if (existing) {
      existing.orderCount += 1;
      existing.totalSpent += order.totals.total;
      existing.orderIds.push(order.id);
      if (order.placedAt < existing.firstOrderAt) existing.firstOrderAt = order.placedAt;
      if (order.placedAt > existing.lastOrderAt) existing.lastOrderAt = order.placedAt;
      existing.averageOrderValue = Math.round(existing.totalSpent / existing.orderCount);
      continue;
    }

    map.set(key, {
      key,
      name,
      email: order.email ?? "—",
      city: address.city,
      /*
       * Checkout no longer collects a country, so this is the state/county for new
       * orders and the country for legacy ones. The admin column is headed "Location",
       * which is true of both — inventing a country from an address that does not
       * carry one would be worse than showing the region.
       */
      country: address.country ?? address.region,
      phone: address.phone ?? "",
      orderCount: 1,
      totalSpent: order.totals.total,
      averageOrderValue: order.totals.total,
      firstOrderAt: order.placedAt,
      lastOrderAt: order.placedAt,
      orderIds: [order.id],
    });
  }

  return [...map.values()].sort((a, b) => b.totalSpent - a.totalSpent);
}

/**
 * One customer and their full order history.
 *
 * Built on `listCustomers` rather than repeating the grouping. The grouping key is the
 * subtle part — email where captured, `name|phone` otherwise — and two implementations
 * of it would eventually disagree about who is the same person, which would show up as
 * a detail page whose totals do not match the row that linked to it.
 *
 * Returns `null` for an unknown key so the caller can render a 404 rather than an empty
 * page that looks like a customer with no orders.
 */
export async function getCustomer(
  key: string,
): Promise<{ customer: CustomerSummary; orders: Order[] } | null> {
  const customer = (await listCustomers()).find((entry) => entry.key === key);
  if (!customer) return null;

  const all = await listOrders();
  const ids = new Set(customer.orderIds);

  const orders = all
    .filter((order) => ids.has(order.id))
    .sort((a, b) => b.placedAt.localeCompare(a.placedAt));

  return { customer, orders };
}
