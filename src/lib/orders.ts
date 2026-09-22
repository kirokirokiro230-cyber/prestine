import { orderStore } from "./stores";
import type { Order, OrderRef } from "./types";

/**
 * Client-side order references.
 *
 * Orders are recorded on the server by the `placeOrder` action. All the browser
 * keeps is a claim ticket — reference plus the email it was placed with — which
 * `lookupOrders` exchanges for the authoritative record. Totals, status and
 * tracking are therefore always read from the server and can never drift from what
 * the admin panel shows.
 */

export function listOrderRefs(): OrderRef[] {
  return orderStore.read();
}

export function rememberOrder(ref: OrderRef): void {
  const existing = orderStore.read().filter((entry) => entry.id !== ref.id);
  orderStore.write([ref, ...existing]);
}

/**
 * Sample history seeded into the store on first run, so the admin dashboard,
 * reports and order screens have real content to work against. Delete these from
 * the admin panel once live orders arrive.
 */
export const demoOrders: Order[] = [
  {
    id: "PR-260612-K4TQ",
    placedAt: "2026-06-12T09:24:00.000Z",
    status: "delivered",
    email: "alex.morgan@example.com",
    cardLast4: "4242",
    lines: [
      {
        productId: "p-005",
        slug: "grade-a-cashmere-crew",
        name: "Grade-A Cashmere Crew",
        colorId: "oat",
        colorName: "Oat",
        colorHex: "#D9CDB8",
        size: "M",
        quantity: 1,
        unitPrice: 34500,
        category: "knitwear",
      },
      {
        productId: "p-010",
        slug: "long-staple-poplin-shirt",
        name: "Long-Staple Poplin Shirt",
        colorId: "white",
        colorName: "Optic White",
        colorHex: "#F7F5F0",
        size: "M",
        quantity: 2,
        unitPrice: 14500,
        category: "shirts",
      },
    ],
    totals: { subtotal: 63500, discount: 6350, shipping: 0, tax: 4572, total: 61722 },
    promoCode: "WELCOME10",
    shippingAddress: {
      name: "Alex Morgan",
      phone: "+44 20 7946 0102",
      line1: "48 Cheshire Street",
      city: "London",
      region: "Greater London",
      postalCode: "E2 6EH",
      country: "United Kingdom",
    },
    trackingNumber: "GB4471902288",
    carrier: "DPD",
    shippedAt: "2026-06-13T08:10:00.000Z",
    deliveredAt: "2026-06-16T11:02:00.000Z",
  },
  {
    id: "PR-260504-9WZM",
    placedAt: "2026-05-04T15:41:00.000Z",
    status: "delivered",
    email: "alex.morgan@example.com",
    cardLast4: "4242",
    lines: [
      {
        productId: "p-022",
        slug: "selvedge-straight-jean",
        name: "Selvedge Straight Jean",
        colorId: "raw-indigo",
        colorName: "Raw Indigo",
        colorHex: "#2C3A55",
        size: "32",
        quantity: 1,
        unitPrice: 22500,
        category: "denim",
      },
    ],
    totals: { subtotal: 22500, discount: 0, shipping: 0, tax: 1800, total: 24300 },
    shippingAddress: {
      name: "Alex Morgan",
      phone: "+44 20 7946 0102",
      line1: "48 Cheshire Street",
      city: "London",
      region: "Greater London",
      postalCode: "E2 6EH",
      country: "United Kingdom",
    },
    trackingNumber: "GB4460118742",
    carrier: "DPD",
    shippedAt: "2026-05-05T09:30:00.000Z",
    deliveredAt: "2026-05-07T14:18:00.000Z",
  },
];
