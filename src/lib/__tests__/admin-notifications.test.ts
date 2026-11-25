import { describe, expect, it } from "vitest";
import {
  clip,
  codCollected,
  courierCancelFailed,
  orderCancelledByCustomer,
  orderDelivered,
  orderPaid,
  orderPlacedCod,
  orderShipped,
  paidAfterCancellation,
  parcelReturning,
  paymentHeld,
  refundFailed,
  returnRequested,
  shipmentFailed,
  timeAgo,
} from "../admin-notifications";
import type { Order } from "../types";

const money = (minor: number) => `₹${(minor / 100).toFixed(2)}`;

function orderWith(overrides: Partial<Order> = {}): Order {
  return {
    id: "PR-261016-AB23",
    placedAt: "2026-10-16T10:00:00.000Z",
    status: "processing",
    paymentStatus: "paid",
    paymentMethod: "prepaid",
    email: "buyer@example.com",
    lines: [
      {
        slug: "merino-crew",
        name: "Merino Crew",
        colorName: "Oat",
        colorHex: "#ddd",
        size: "M",
        quantity: 2,
        unitPrice: 12000,
        category: "knitwear",
      },
    ],
    totals: { subtotal: 24000, discount: 0, shipping: 0, tax: 4800, codFee: 0, total: 28800 },
    shippingAddress: {
      name: "Asha Kapoor",
      line1: "12 Mill Lane",
      city: "Bengaluru",
      region: "Karnataka",
      phone: "9876543210",
    },
    ...overrides,
  };
}

describe("new-order alerts", () => {
  it("names the order, the amount, the customer, the method and the city", () => {
    const n = orderPaid(orderWith(), money);

    expect(n.kind).toBe("order.paid");
    expect(n.severity).toBe("success");
    expect(n.title).toBe("New order PR-261016-AB23 · ₹288.00");
    expect(n.body).toBe("Asha Kapoor · 2 items · Prepaid · Bengaluru");
    expect(n.href).toBe("/admin/orders/PR-261016-AB23");
    expect(n.orderId).toBe("PR-261016-AB23");
  });

  it("counts items across lines, not lines", () => {
    const order = orderWith({
      lines: [
        { ...orderWith().lines[0], quantity: 1 },
        { ...orderWith().lines[0], quantity: 3 },
      ],
    });

    expect(orderPaid(order, money).body).toContain("4 items");
  });

  it("uses the singular for one item", () => {
    const order = orderWith({ lines: [{ ...orderWith().lines[0], quantity: 1 }] });

    expect(orderPaid(order, money).body).toContain("1 item ·");
  });

  it("tells staff how much cash to collect on a COD order", () => {
    const n = orderPlacedCod(orderWith({ paymentMethod: "cod", paymentStatus: "pending" }), money);

    expect(n.kind).toBe("order.placed");
    expect(n.title).toContain("COD");
    expect(n.body).toContain("Cash on delivery");
    expect(n.body).toContain("collect ₹288.00 on delivery");
  });

  /*
   * The key is what stops a retried Cashfree webhook, a re-polled confirmation page and a
   * second settlement path from each raising their own "New order". Distinct kinds for
   * prepaid and COD so the two keys can never collide.
   */
  it("keys each event on the order so a repeat delivery is one alert", () => {
    const order = orderWith();

    expect(orderPaid(order, money).dedupeKey).toBe(`order.paid:${order.id}`);
    expect(orderPaid(order, money).dedupeKey).toBe(orderPaid(order, money).dedupeKey);
    expect(orderPlacedCod(order, money).dedupeKey).not.toBe(orderPaid(order, money).dedupeKey);
  });

  it("falls back gracefully when the customer has no name", () => {
    const order = orderWith({ shippingAddress: { ...orderWith().shippingAddress, name: "" } });

    expect(orderPaid(order, money).body).toContain("A customer");
  });
});

describe("cancellation alerts", () => {
  it("is a warning when nothing was paid", () => {
    const n = orderCancelledByCustomer(
      orderWith({ paymentStatus: "pending" }),
      "Ordered by mistake",
      money,
    );

    expect(n.severity).toBe("warning");
    expect(n.title).toBe("Order PR-261016-AB23 cancelled by customer");
    expect(n.body).toContain("Ordered by mistake");
  });

  /*
   * The difference between "FYI" and "do something today". A paid prepaid order that is
   * cancelled owes the customer money, and a warning-level alert would let it scroll by.
   */
  it("is critical, and says a refund is needed, when a prepaid order was already paid", () => {
    const n = orderCancelledByCustomer(orderWith(), "Changed my mind", money);

    expect(n.severity).toBe("critical");
    expect(n.title).toMatch(/refund needed/i);
    expect(n.body).toContain("already paid");
  });

  it("does not demand a refund for a COD order, where no money has moved", () => {
    const n = orderCancelledByCustomer(
      orderWith({ paymentMethod: "cod", paymentStatus: "pending" }),
      "Found it cheaper",
      money,
    );

    expect(n.severity).toBe("warning");
    expect(n.title).not.toMatch(/refund/i);
  });

  it("keeps a very long reason within the column limit", () => {
    const n = orderCancelledByCustomer(orderWith(), "x ".repeat(600), money);

    expect((n.body ?? "").length).toBeLessThanOrEqual(600);
  });
});

describe("returns", () => {
  it("names the order and the reason, and keys on the return so two returns are two alerts", () => {
    const a = returnRequested(orderWith(), "Too small", "ret-1");
    const b = returnRequested(orderWith(), "Too small", "ret-2");

    expect(a.kind).toBe("return.requested");
    expect(a.severity).toBe("warning");
    expect(a.title).toBe("Return requested for PR-261016-AB23");
    expect(a.body).toContain("Too small");
    expect(a.dedupeKey).not.toBe(b.dedupeKey);
  });
});

describe("money problems are all critical", () => {
  it("a held payment", () => {
    const n = paymentHeld(orderWith(), "Cashfree reports ₹1 but the total is ₹288.00");

    expect(n.severity).toBe("critical");
    expect(n.kind).toBe("payment.held");
    expect(n.body).toContain("₹288.00");
  });

  it("a payment that arrived after the order was cancelled", () => {
    const n = paidAfterCancellation(orderWith({ status: "cancelled" }), money);

    expect(n.severity).toBe("critical");
    expect(n.title).toMatch(/refund needed/i);
    expect(n.body).toMatch(/do not ship/i);
  });

  it("a refund that failed after it was accepted, which the customer is still owed", () => {
    const n = refundFailed(orderWith(), 100_000, "Account closed.", "rf_abc", money);

    expect(n.severity).toBe("critical");
    expect(n.kind).toBe("refund.failed");
    expect(n.title).toContain("₹1000.00");
    expect(n.body).toContain("Account closed.");
    expect(n.body).toMatch(/refund it again/i);
    expect(n.href).toBe("/admin/orders/PR-261016-AB23");
  });

  it("a failed refund is one alert per refund, and a second failed attempt is another", () => {
    const first = refundFailed(orderWith(), 100, "x", "rf_one", money);
    const repeat = refundFailed(orderWith(), 100, "x", "rf_one", money);
    const second = refundFailed(orderWith(), 100, "x", "rf_two", money);

    expect(repeat.dedupeKey).toBe(first.dedupeKey);
    expect(second.dedupeKey).not.toBe(first.dedupeKey);
  });

  it("a shipment that could not be booked, which includes an empty courier wallet", () => {
    const n = shipmentFailed("PR-261016-AB23", "Insufficient wallet balance.");

    expect(n.severity).toBe("critical");
    expect(n.body).toContain("Insufficient wallet balance.");
    expect(n.href).toBe("/admin/orders/PR-261016-AB23");
  });

  it("a courier booking that is still live for a cancelled order", () => {
    const n = courierCancelFailed("PR-261016-AB23", "68101710000125", "Not confirmed.");

    expect(n.severity).toBe("critical");
    expect(n.title).toContain("68101710000125");
  });
});

describe("progress updates are quiet", () => {
  it("shipped, delivered and COD collected are info, not warnings", () => {
    expect(orderShipped(orderWith()).severity).toBe("info");
    expect(orderDelivered(orderWith()).severity).toBe("info");
    expect(codCollected(orderWith({ paymentMethod: "cod" }), money).severity).toBe("info");
  });

  it("a parcel coming back is a warning", () => {
    const n = parcelReturning(orderWith());

    expect(n.severity).toBe("warning");
    expect(n.kind).toBe("shipment.rto");
  });

  it("every event has a distinct dedupe key for the same order", () => {
    const order = orderWith();
    const keys = [
      orderPaid(order, money).dedupeKey,
      orderPlacedCod(order, money).dedupeKey,
      orderShipped(order).dedupeKey,
      orderDelivered(order).dedupeKey,
      codCollected(order, money).dedupeKey,
      parcelReturning(order).dedupeKey,
      paymentHeld(order, "r").dedupeKey,
      paidAfterCancellation(order, money).dedupeKey,
      orderCancelledByCustomer(order, "r", money).dedupeKey,
      shipmentFailed(order.id, "e").dedupeKey,
      courierCancelFailed(order.id, "w", "d").dedupeKey,
    ];

    // One event must never swallow a different one for the same order.
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("clip", () => {
  it("leaves short text alone and collapses whitespace", () => {
    expect(clip("  hello \n  world ", 50)).toBe("hello world");
  });

  it("cuts on a word boundary and marks the cut", () => {
    const out = clip("one two three four five six seven", 20);

    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/\s…$/);
  });

  it("hard-cuts a single unbroken word rather than returning nothing", () => {
    const out = clip("a".repeat(100), 10);

    expect(out).toHaveLength(10);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-10-16T12:00:00.000Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("reads naturally at each scale", () => {
    expect(timeAgo(ago(5_000), now)).toBe("just now");
    expect(timeAgo(ago(4 * 60_000), now)).toBe("4 min ago");
    expect(timeAgo(ago(3 * 3_600_000), now)).toBe("3 h ago");
    expect(timeAgo(ago(2 * 86_400_000), now)).toBe("2 d ago");
  });

  it("does not show a negative time when the server clock is slightly ahead", () => {
    expect(timeAgo(new Date(now + 60_000).toISOString(), now)).toBe("just now");
  });

  it("returns nothing for a value it cannot read", () => {
    expect(timeAgo("not a date", now)).toBe("");
  });
});
