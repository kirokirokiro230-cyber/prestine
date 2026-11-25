import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRefundByRefundId: vi.fn(),
  refreshFromCashfree: vi.fn(),
  findOrderByCashfreeId: vi.fn(),
  settleCashfreePayment: vi.fn(),
}));

vi.mock("@/server/repositories/refunds", () => ({
  getRefundByRefundId: mocks.getRefundByRefundId,
}));
vi.mock("@/server/refunds", () => ({ refreshFromCashfree: mocks.refreshFromCashfree }));
vi.mock("@/server/repositories/orders", () => ({
  findOrderByCashfreeId: mocks.findOrderByCashfreeId,
}));
vi.mock("@/server/payment-settlement", () => ({
  settleCashfreePayment: mocks.settleCashfreePayment,
}));

import { POST } from "@/app/api/payments/cashfree/webhook/route";

const SECRET = "test-secret";

function signed(body: unknown, overrides: { signature?: string } = {}): Request {
  const raw = JSON.stringify(body);
  const timestamp = String(Date.now());
  const signature =
    overrides.signature ??
    createHmac("sha256", SECRET)
      .update(timestamp + raw)
      .digest("base64");

  return new Request("https://shop.example/api/payments/cashfree/webhook", {
    method: "POST",
    headers: { "x-webhook-timestamp": timestamp, "x-webhook-signature": signature },
    body: raw,
  });
}

const refundEvent = {
  type: "REFUND_STATUS_WEBHOOK",
  data: { refund: { order_id: "PR-1", refund_id: "rf_abc", refund_status: "SUCCESS" } },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("CASHFREE_APP_ID", "app");
  vi.stubEnv("CASHFREE_SECRET_KEY", SECRET);
  vi.stubEnv("CASHFREE_WEBHOOK_SECRET", SECRET);
});

describe("refund events on the Cashfree webhook", () => {
  it("rejects an unsigned or wrongly signed event before looking at anything", async () => {
    const response = await POST(signed(refundEvent, { signature: "forged" }));

    expect(response.status).toBe(401);
    expect(mocks.getRefundByRefundId).not.toHaveBeenCalled();
  });

  it("reads the refund back from Cashfree instead of trusting the payload's status", async () => {
    const row = { refundId: "rf_abc", status: "pending" };
    mocks.getRefundByRefundId.mockResolvedValue(row);
    mocks.refreshFromCashfree.mockResolvedValue({ ok: true, refund: row, message: "ok" });

    const response = await POST(signed(refundEvent));

    expect(response.status).toBe(200);
    expect(mocks.getRefundByRefundId).toHaveBeenCalledWith("rf_abc");
    // The payload says SUCCESS; what happens is decided by what Cashfree says when asked.
    expect(mocks.refreshFromCashfree).toHaveBeenCalledWith(expect.anything(), row);
  });

  it("acknowledges a refund this app did not create, and leaves it alone", async () => {
    mocks.getRefundByRefundId.mockResolvedValue(undefined);

    const response = await POST(signed(refundEvent));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ignored: true });
    expect(mocks.refreshFromCashfree).not.toHaveBeenCalled();
  });

  it("acknowledges a refund event with no refund id", async () => {
    const response = await POST(signed({ type: "REFUND_STATUS_WEBHOOK", data: {} }));

    expect(response.status).toBe(200);
    expect(mocks.getRefundByRefundId).not.toHaveBeenCalled();
  });

  it("answers 500 when Cashfree cannot be reached, so the event is delivered again", async () => {
    mocks.getRefundByRefundId.mockResolvedValue({ refundId: "rf_abc", status: "pending" });
    mocks.refreshFromCashfree.mockResolvedValue({ ok: false, error: "down", retryable: true });

    expect((await POST(signed(refundEvent))).status).toBe(500);
  });

  it("does not ask for a retry when retrying would not change the answer", async () => {
    mocks.getRefundByRefundId.mockResolvedValue({ refundId: "rf_abc", status: "pending" });
    mocks.refreshFromCashfree.mockResolvedValue({ ok: false, error: "no record" });

    expect((await POST(signed(refundEvent))).status).toBe(200);
  });

  it("does not make Cashfree retry forever when the refunds table has not been created", async () => {
    mocks.getRefundByRefundId.mockRejectedValue(
      new Error('relation "public.order_refunds" does not exist'),
    );

    expect((await POST(signed(refundEvent))).status).toBe(200);
  });

  it("asks for a retry on an unexpected failure", async () => {
    mocks.getRefundByRefundId.mockRejectedValue(new Error("connection reset"));

    expect((await POST(signed(refundEvent))).status).toBe(500);
  });

  it("leaves payment events on the payment path", async () => {
    mocks.findOrderByCashfreeId.mockResolvedValue({ id: "PR-1", paymentStatus: "paid" });

    const response = await POST(
      signed({
        type: "PAYMENT_SUCCESS_WEBHOOK",
        data: { order: { order_id: "PR-1" }, payment: { cf_payment_id: 1 } },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.findOrderByCashfreeId).toHaveBeenCalledWith("PR-1");
    expect(mocks.getRefundByRefundId).not.toHaveBeenCalled();
  });
});
