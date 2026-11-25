import { addressName } from "@/lib/format";
import type { Address, Order, OrderLine } from "@/lib/types";
import { callRpc, db, insertInto, unwrap, updateTable } from "../supabase";
import type { OrderLineRow, OrderNoteRow, OrderRow } from "../database.types";

/**
 * Order persistence and lifecycle.
 *
 * Status transitions are validated here rather than in the UI, so an order cannot
 * be moved from delivered back to processing by a crafted request. The actual
 * enforcement lives in `update_order_status()` / `cancel_order_as_customer()`
 * (see `supabase/migrations/00000000000003_functions.sql`) — this file calls
 * those RPCs rather than re-implementing the transition table, so there is
 * exactly one place a forward-only rule could be weakened, and it is the
 * database, not application code that a future change could bypass.
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

/* ------------------------------------------------------------------ */
/* Row → domain assembly                                               */
/* ------------------------------------------------------------------ */

function addressFromRow(row: OrderRow): Address {
  return {
    name: row.ship_name,
    line1: row.ship_line1,
    city: row.ship_city,
    region: row.ship_region,
    phone: row.ship_phone,
    firstName: row.ship_first_name ?? undefined,
    lastName: row.ship_last_name ?? undefined,
    line2: row.ship_line2 ?? undefined,
    postalCode: row.ship_postal_code ?? undefined,
    country: row.ship_country ?? undefined,
  };
}

function lineFromRow(row: OrderLineRow): OrderLine {
  return {
    productId: row.product_id ?? undefined,
    slug: row.slug,
    name: row.name,
    colorId: row.color_id ?? undefined,
    colorName: row.color_name,
    colorHex: row.color_hex,
    size: row.size,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    category: row.category,
  };
}

function assembleOrder(row: OrderRow, lines: OrderLineRow[], notes: OrderNoteRow[]): Order {
  return {
    id: row.id,
    placedAt: row.placed_at,
    status: row.status,
    lines: lines.filter((line) => line.order_id === row.id).map(lineFromRow),
    totals: {
      subtotal: row.subtotal,
      discount: row.discount,
      shipping: row.shipping,
      tax: row.tax,
      codFee: row.cod_fee ?? 0,
      total: row.total,
    },
    shippingAddress: addressFromRow(row),
    customerId: row.customer_id ?? undefined,
    email: row.email ?? undefined,
    promoCode: row.promo_code ?? undefined,
    cardLast4: row.card_last4 ?? undefined,
    trackingNumber: row.tracking_number ?? undefined,
    carrier: row.carrier ?? undefined,
    shippingStatus: row.shipping_status ?? undefined,
    expectedDeliveryDate: row.expected_delivery_date ?? undefined,
    shippedAt: row.shipped_at ?? undefined,
    deliveredAt: row.delivered_at ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    cancellationReason: row.cancellation_reason ?? undefined,
    reviewRequestedAt: row.review_requested_at ?? undefined,
    paymentStatus: row.payment_status,
    // Defaulted rather than asserted: rows written before migration 12 have no
    // value, and every one of them predates COD.
    paymentMethod: row.payment_method === "cod" ? "cod" : "prepaid",
    codFee: row.cod_fee ?? 0,
    paymentProvider: row.payment_provider ?? undefined,
    cashfreeOrderId: row.cashfree_order_id ?? undefined,
    cashfreePaymentSessionId: row.cashfree_payment_session_id ?? undefined,
    cashfreePaymentId: row.cashfree_payment_id ?? undefined,
    paidAt: row.paid_at ?? undefined,
    notes: notes
      .filter((note) => note.order_id === row.id)
      .map((note) => ({ at: note.created_at, body: note.body })),
  };
}

/** Load lines and notes for a set of orders in two queries, not one per order. */
async function loadOrderChildren(
  orderIds: string[],
): Promise<{ lines: OrderLineRow[]; notes: OrderNoteRow[] }> {
  if (orderIds.length === 0) return { lines: [], notes: [] };

  const [lines, notes] = await Promise.all([
    unwrap(
      await db()
        .from("order_lines")
        .select("*")
        .in("order_id", orderIds)
        .order("position", { ascending: true })
        .overrideTypes<OrderLineRow[], { merge: false }>(),
    ),
    unwrap(
      await db()
        .from("order_notes")
        .select("*")
        .in("order_id", orderIds)
        .order("created_at", { ascending: true })
        .overrideTypes<OrderNoteRow[], { merge: false }>(),
    ),
  ]);

  return { lines, notes };
}

async function assembleOrders(rows: OrderRow[]): Promise<Order[]> {
  if (rows.length === 0) return [];
  const { lines, notes } = await loadOrderChildren(rows.map((row) => row.id));
  return rows.map((row) => assembleOrder(row, lines, notes));
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export async function listOrders(): Promise<Order[]> {
  const rows = unwrap(
    await db()
      .from("orders")
      .select("*")
      .order("placed_at", { ascending: false })
      .overrideTypes<OrderRow[], { merge: false }>(),
  );
  return assembleOrders(rows);
}

export async function getOrder(id: string): Promise<Order | undefined> {
  const row = unwrap(
    await db()
      .from("orders")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .overrideTypes<OrderRow, { merge: false }>(),
  );
  if (!row) return undefined;
  const [order] = await assembleOrders([row]);
  return order;
}

/**
 * Orders placed by one signed-in customer.
 *
 * Exists so the review prompt reads one customer's orders instead of
 * `listOrders()`, which loads every order in the shop (plus all their lines and
 * notes) on every page view of every signed-in shopper. That was a full-table read
 * triggerable by anyone with an account, and it grows with the order book.
 */
export async function listOrdersForCustomer(customerId: string): Promise<Order[]> {
  const rows = unwrap(
    await db()
      .from("orders")
      .select("*")
      .eq("customer_id", customerId)
      .order("placed_at", { ascending: false })
      .overrideTypes<OrderRow[], { merge: false }>(),
  );
  return assembleOrders(rows);
}

/**
 * Resolve the order a Cashfree order id belongs to.
 *
 * A payment retry is registered with Cashfree under a suffixed id
 * (`PR-260930-AB23-R7K2`), because Cashfree refuses to reuse an id. The webhook only
 * knows Cashfree's id, so looking it up as if it were ours — which it used to — found
 * nothing for any retried payment and silently dropped it: the customer paid, and the
 * order stayed unpaid.
 *
 * Tried in order: our own id, the id of the order's current attempt, and finally the
 * id with a retry suffix removed (an earlier attempt that has since been replaced).
 */
export async function findOrderByCashfreeId(
  cashfreeOrderId: string,
): Promise<Order | undefined> {
  const direct = await getOrder(cashfreeOrderId);
  if (direct) return direct;

  const row = unwrap(
    await db()
      .from("orders")
      .select("id")
      .eq("cashfree_order_id", cashfreeOrderId)
      .maybeSingle()
      .overrideTypes<{ id: string }, { merge: false }>(),
  );
  if (row) return getOrder(row.id);

  const stripped = cashfreeOrderId.replace(/-R[A-Z0-9]{1,6}$/, "");
  if (stripped !== cashfreeOrderId) return getOrder(stripped);

  return undefined;
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

  let builder = db().from("orders").select("*", { count: "exact" });

  if (status !== "all") builder = builder.eq("status", status);
  if (from) builder = builder.gte("placed_at", from);
  // `to` is an inclusive date, so compare against the end of that day.
  if (to) builder = builder.lte("placed_at", `${to}T23:59:59.999Z`);

  if (search?.trim()) {
    const needle = search.trim();
    /*
     * Matches the JSON store's haystack (id, name, city, postcode, phone,
     * email, tracking, line item names) as closely as one request allows —
     * the shipping name is a composite of two possible column sets (current
     * vs legacy), so it is matched via `ship_name` (current orders) OR the
     * legacy first/last name pair, alongside every other field.
     *
     * Line-item names are matched by a *separate* query against
     * `order_lines` rather than embedded into the same `.or()` string:
     * `.or()`'s raw filter syntax has its own escaping rules for lists and
     * values (PostgREST/postgrest#701), and every order id here is app-
     * generated so it can never collide with that syntax — but there is no
     * reason to hand-format a filter string when `.in()` already escapes
     * correctly. The two result sets are unioned by matching either the
     * `.or()` filter OR being one of the ids found in `order_lines`, which
     * is what a single query would have expressed anyway.
     */
    const lineMatches = unwrap(
      await db()
        .from("order_lines")
        .select("order_id")
        .ilike("name", `%${needle}%`)
        .overrideTypes<Array<{ order_id: string }>, { merge: false }>(),
    );
    const matchingOrderIds = [...new Set(lineMatches.map((row) => row.order_id))];

    const fieldFilter = [
      `id.ilike.%${needle}%`,
      `ship_name.ilike.%${needle}%`,
      `ship_first_name.ilike.%${needle}%`,
      `ship_last_name.ilike.%${needle}%`,
      `ship_city.ilike.%${needle}%`,
      `ship_postal_code.ilike.%${needle}%`,
      `ship_phone.ilike.%${needle}%`,
      `email.ilike.%${needle}%`,
      `tracking_number.ilike.%${needle}%`,
    ].join(",");

    if (matchingOrderIds.length > 0) {
      // PostgREST has no "OR this filter with this separate .in() list" in
      // one call, so this branches into two full builder chains and the
      // results are unioned by id afterward — the same shape `withFilters`
      // in `repositories/products.ts` uses for its own count-then-page split.
      const [byFields, byLineNames] = await Promise.all([
        db()
          .from("orders")
          .select("id")
          .or(fieldFilter)
          .overrideTypes<Array<{ id: string }>, { merge: false }>(),
        db()
          .from("orders")
          .select("id")
          .in("id", matchingOrderIds)
          .overrideTypes<Array<{ id: string }>, { merge: false }>(),
      ]);
      const unionIds = [
        ...new Set([
          ...(byFields.data ?? []).map((row) => row.id),
          ...(byLineNames.data ?? []).map((row) => row.id),
        ]),
      ];
      builder = builder.in("id", unionIds.length > 0 ? unionIds : ["__no_match__"]);
    } else {
      builder = builder.or(fieldFilter);
    }
  }

  switch (sort) {
    case "date-asc":
      builder = builder.order("placed_at", { ascending: true });
      break;
    case "total-desc":
      builder = builder.order("total", { ascending: false });
      break;
    case "total-asc":
      builder = builder.order("total", { ascending: true });
      break;
    case "date-desc":
    default:
      builder = builder.order("placed_at", { ascending: false });
      break;
  }

  const { count } = await builder;
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const raw = unwrap<unknown>(
    await builder
      .range((safePage - 1) * perPage, safePage * perPage - 1)
      .overrideTypes<unknown, { merge: false }>(),
  );
  const rows = raw as OrderRow[];

  const items = await assembleOrders(rows);

  return { items, total, page: safePage, perPage, totalPages };
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export interface CreateOrderPayment {
  provider?: string;
  cashfreeOrderId?: string;
  cashfreePaymentSessionId?: string;
}

/**
 * Record an order, awaiting payment.
 *
 * `payment` describes the Cashfree order/session already opened for this order by
 * the time this is called from checkout (see `placeOrder` in
 * `src/app/actions/checkout.ts`) — every real checkout order supplies it. It is
 * optional only so the test suite and any future offline/manual order entry can
 * create a row without a live Cashfree call; the row is always written with
 * `payment_status = 'pending'` regardless. The only function that can move an order
 * to `'paid'` is `markOrderPaid`, called from the webhook handler or a
 * reconciliation fetch, never from here.
 */
export async function createOrder(
  order: Order,
  payment: CreateOrderPayment = {},
): Promise<Order> {
  const { error } = await callRpc(db(), "create_order_with_lines", {
    p_id: order.id,
    p_placed_at: order.placedAt,
    p_customer_id: order.customerId ?? null,
    p_email: order.email ?? null,
    p_promo_code: order.promoCode ?? null,
    p_card_last4: order.cardLast4 ?? null,
    p_subtotal: order.totals.subtotal,
    p_discount: order.totals.discount,
    p_shipping: order.totals.shipping,
    p_tax: order.totals.tax,
    p_total: order.totals.total,
    p_payment_method: order.paymentMethod,
    p_cod_fee: order.totals.codFee,
    p_ship_name: order.shippingAddress.name,
    p_ship_line1: order.shippingAddress.line1,
    p_ship_city: order.shippingAddress.city,
    p_ship_region: order.shippingAddress.region,
    p_ship_phone: order.shippingAddress.phone,
    p_ship_postal_code: order.shippingAddress.postalCode ?? null,
    p_lines: order.lines.map((line) => ({
      productId: line.productId ?? null,
      slug: line.slug,
      name: line.name,
      colorId: line.colorId ?? null,
      colorName: line.colorName,
      colorHex: line.colorHex,
      size: line.size,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      category: line.category,
    })),
    p_payment_provider: payment.provider ?? null,
    p_cashfree_order_id: payment.cashfreeOrderId ?? null,
    p_cashfree_payment_session_id: payment.cashfreePaymentSessionId ?? null,
  });

  if (error) throw new Error(error.message);

  const created = await getOrder(order.id);
  if (!created) throw new Error("Order was created but could not be re-read.");
  return created;
}

/**
 * Mark an order paid. The only path that moves `paymentStatus` to `"paid"`.
 *
 * Idempotent: `mark_order_paid` (see `00000000000006_payments.sql`) only updates a
 * row still `pending`, so calling this twice for the same order — a retried webhook
 * delivery, or a webhook arriving after a reconciliation fetch already caught up —
 * returns `null` on the second call rather than re-running whatever the caller does
 * on a fresh transition (dispatching the confirmation email). Callers must treat
 * `null` as "already handled", not as an error.
 */
export async function markOrderPaid(
  id: string,
  cashfreePaymentId: string,
): Promise<Order | null> {
  // Documented above. Kept as one function; see `findOrderByCashfreeId` for how a
  // webhook that only knows Cashfree's id reaches the right order.
  const { data, error } = await callRpc(db(), "mark_order_paid", {
    p_order_id: id,
    p_cashfree_payment_id: cashfreePaymentId,
  });

  if (error) throw new Error(error.message);
  if (!data) return null;

  const order = await getOrder(id);
  return order ?? null;
}

/**
 * Mark a COD order's cash as collected, on delivery.
 *
 * The COD counterpart to `markOrderPaid`, and idempotent in exactly the same way:
 * `mark_cod_order_collected` only updates a row that is still `pending`, so a
 * repeated tracking sweep returns `null` rather than re-running whatever the
 * caller does on a fresh transition.
 *
 * Refuses an order that is not `payment_method = 'cod'`, so this can never be
 * used to mark a prepaid order paid without a real payment behind it.
 */
export async function markCodOrderCollected(id: string): Promise<Order | null> {
  const { data, error } = await callRpc(db(), "mark_cod_order_collected", {
    p_order_id: id,
  });

  if (error) throw new Error(error.message);
  if (!data) return null;

  const order = await getOrder(id);
  return order ?? null;
}

/** Record a failed/dropped payment attempt. Never reverts an order already paid. */
export async function markOrderPaymentFailed(id: string): Promise<Order | null> {
  const { data, error } = await callRpc(db(), "mark_order_payment_failed", {
    p_order_id: id,
  });

  if (error) throw new Error(error.message);
  if (!data) return null;

  const order = await getOrder(id);
  return order ?? null;
}

/**
 * Allowed status moves.
 *
 * Forward-only, except that anything not yet delivered can be cancelled.
 * Kept here too (not only in the database) purely so callers can check
 * `canTransition` synchronously before attempting a move and show a
 * disabled button rather than a round trip that always fails — the RPC is
 * still what actually enforces it.
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
  const { error } = await callRpc(db(), "update_order_status", {
    p_order_id: id,
    p_next_status: status,
    p_tracking_number: options.trackingNumber ?? null,
    p_carrier: options.carrier ?? null,
    p_reason: options.reason ?? null,
  });

  if (error) throw new Error(error.message);

  const order = await getOrder(id);
  if (!order) throw new Error(`Order ${id} not found`);
  return order;
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
  const { error } = await callRpc(db(), "cancel_order_as_customer", {
    p_order_id: id,
    p_reason: reason,
  });

  if (error) throw new Error(error.message);

  const order = await getOrder(id);
  if (!order) throw new Error(`Order ${id} not found`);
  return order;
}

/**
 * Point an unpaid order at a new Cashfree session.
 *
 * Used when a shopper retries a payment they abandoned. Both columns move
 * together: `cashfree_order_id` is what the webhook and the reconciliation fetch
 * query by, so updating the session without it would leave a successful retry
 * reporting against an id nothing is watching.
 *
 * Guarded on `payment_status <> 'paid'` so a late retry can never detach a paid
 * order from the payment that settled it.
 */
export async function setOrderPaymentAttempt(
  id: string,
  cashfreeOrderId: string,
  cashfreePaymentSessionId: string,
): Promise<void> {
  const { error } = await updateTable(db(), "orders", {
    cashfree_order_id: cashfreeOrderId,
    cashfree_payment_session_id: cashfreePaymentSessionId,
  })
    .eq("id", id)
    .neq("payment_status", "paid");

  if (error) throw new Error(error.message);
}

/**
 * Record which Cashfree order actually took the payment.
 *
 * A retried payment is registered under a new suffixed id and `cashfree_order_id` is
 * moved to it, but an EARLIER attempt can still be the one the shopper pays (they finish
 * the first tab after opening a second). Refunds are made against the Cashfree order that
 * was paid, so once payment settles, the column is pointed at it.
 *
 * Only on an order that is already paid: while unpaid, the column means "the attempt
 * currently open". Never throws: failing to tidy this must not fail the payment, and the
 * refund code verifies the Cashfree order with Cashfree anyway.
 */
export async function recordPaidCashfreeOrder(
  id: string,
  cashfreeOrderId: string,
): Promise<void> {
  const { error } = await updateTable(db(), "orders", {
    cashfree_order_id: cashfreeOrderId,
  })
    .eq("id", id)
    .eq("payment_status", "paid");

  if (error) {
    console.error(`[payment] could not record the paid Cashfree order for ${id}:`, error.message);
  }
}

/** Internal note visible only in admin. */
export async function addOrderNote(id: string, note: string): Promise<Order> {
  const { error } = await insertInto(db(), "order_notes", { order_id: id, body: note });
  if (error) throw new Error(error.message);

  const order = await getOrder(id);
  if (!order) throw new Error(`Order ${id} not found`);
  return order;
}

/* ------------------------------------------------------------------ */
/* Customers, derived from order history                               */
/* ------------------------------------------------------------------ */

/**
 * Customers, derived from order history.
 *
 * There is no separate customer table consulted here — `customers` (the
 * authenticated account table) is a different concept, handled in
 * `src/server/customers.ts`. This view groups **orders**, including guest
 * orders that were never tied to an account, by email or by a name+contact
 * fallback for legacy orders that predate email capture.
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
 * Built on `listCustomers` rather than repeating the grouping — see that
 * function's own note on why one grouping implementation matters. Returns
 * `null` for an unknown key so the caller can render a 404 rather than an
 * empty page that looks like a customer with no orders.
 */
export async function getCustomer(
  key: string,
): Promise<{ customer: CustomerSummary; orders: Order[] } | null> {
  const customer = (await listCustomers()).find((entry) => entry.key === key);
  if (!customer) return null;

  const rows = unwrap(
    await db()
      .from("orders")
      .select("*")
      .in("id", customer.orderIds)
      .order("placed_at", { ascending: false })
      .overrideTypes<OrderRow[], { merge: false }>(),
  );

  const orders = await assembleOrders(rows);

  return { customer, orders };
}
