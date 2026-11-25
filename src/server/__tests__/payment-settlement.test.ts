import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Order } from "@/lib/types";
import type { CashfreeConfig } from "../cashfree";

const mocks = vi.hoisted(() => ({
  fetchCashfreeOrder: vi.fn(),
  markOrderPaid: vi.fn(),
  markOrderPaymentFailed: vi.fn(),
  recordPaidCashfreeOrder: vi.fn(),
  addOrderNote: vi.fn(),
}));

vi.mock("../cashfree", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../cashfree")>()),
  fetchCashfreeOrder: mocks.fetchCashfreeOrder,
  terminateCashfreeOrder: vi.fn(),
}));
vi.mock("../repositories/orders", () => ({
  markOrderPaid: mocks.markOrderPaid,
  markOrderPaymentFailed: mocks.markOrderPaymentFailed,
  recordPaidCashfreeOrder: mocks.recordPaidCashfreeOrder,
  addOrderNote: mocks.addOrderNote,
}));
vi.mock("../email/after-response", () => ({ afterResponse: vi.fn() }));
vi.mock("../email/dispatch", () => ({ dispatchOrderConfirmation: vi.fn() }));
vi.mock("../notifications", () => ({
  announce: { orderPaid: vi.fn(), paymentHeld: vi.fn(), paidAfterCancellation: vi.fn() },
}));
vi.mock("../shipping-service", () => ({ manifestShipmentForOrder: vi.fn() }));

import { settleCashfreePayment } from "../payment-settlement";

const config: CashfreeConfig = {
  appId: "app",
  secretKey: "secret",
  environment: "sandbox",
  webhookSecret: "secret",
  apiVersion: "2023-08-01",
  apiBase: "https://sandbox.cashfree.com",
};

const unpaid = {
  id: "PR-1",
  status: "processing",
  paymentMethod: "prepaid",
  paymentStatus: "pending",
  // The newest attempt, which is the one the order currently points at.
  cashfreeOrderId: "PR-1-RNEW1",
  totals: { total: 249_900 },
} as unknown as Order;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchCashfreeOrder.mockResolvedValue({
    orderId: "PR-1",
    orderStatus: "PAID",
    orderAmount: 2499,
    orderCurrency: "INR",
  });
  mocks.recordPaidCashfreeOrder.mockResolvedValue(undefined);
  mocks.addOrderNote.mockResolvedValue(undefined);
});

/*
 * A refund is made against the Cashfree order that took the money. A shopper who retries
 * payment and then finishes the FIRST tab pays an earlier attempt, while the order points at
 * the newest one. Without recording which was paid, a refund would be aimed at an order
 * that was never charged.
 */
describe("which Cashfree order was paid", () => {
  it("points the order at the attempt that was paid when it is not the one it pointed at", async () => {
    mocks.markOrderPaid.mockResolvedValue({ ...unpaid, paymentStatus: "paid", cashfreeOrderId: "PR-1-RNEW1" });

    await settleCashfreePayment(config, unpaid, "PR-1");

    expect(mocks.recordPaidCashfreeOrder).toHaveBeenCalledWith("PR-1", "PR-1");
  });

  it("leaves it alone when the paid attempt is the one it already points at", async () => {
    mocks.fetchCashfreeOrder.mockResolvedValue({
      orderId: "PR-1-RNEW1",
      orderStatus: "PAID",
      orderAmount: 2499,
      orderCurrency: "INR",
    });
    mocks.markOrderPaid.mockResolvedValue({ ...unpaid, paymentStatus: "paid", cashfreeOrderId: "PR-1-RNEW1" });

    await settleCashfreePayment(config, unpaid, "PR-1-RNEW1");

    expect(mocks.recordPaidCashfreeOrder).not.toHaveBeenCalled();
  });

  it("does nothing on a repeated delivery, which has already recorded it", async () => {
    mocks.markOrderPaid.mockResolvedValue(null);

    await settleCashfreePayment(config, unpaid, "PR-1");

    expect(mocks.recordPaidCashfreeOrder).not.toHaveBeenCalled();
  });

  it("records nothing for a payment of the wrong amount, which is held rather than paid", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.fetchCashfreeOrder.mockResolvedValue({
      orderId: "PR-1",
      orderStatus: "PAID",
      orderAmount: 1,
      orderCurrency: "INR",
    });

    const outcome = await settleCashfreePayment(config, unpaid, "PR-1");

    expect(outcome.kind).toBe("held");
    expect(mocks.markOrderPaid).not.toHaveBeenCalled();
    expect(mocks.recordPaidCashfreeOrder).not.toHaveBeenCalled();
  });
});
