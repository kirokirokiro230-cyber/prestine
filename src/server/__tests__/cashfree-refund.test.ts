import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CashfreeApiError,
  createCashfreeRefund,
  fetchCashfreeRefund,
  refundOutcomeIsKnown,
  type CashfreeConfig,
} from "../cashfree";

const config: CashfreeConfig = {
  appId: "app",
  secretKey: "secret",
  environment: "sandbox",
  webhookSecret: "secret",
  apiVersion: "2023-08-01",
  apiBase: "https://sandbox.cashfree.com",
};

function respond(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createCashfreeRefund", () => {
  it("posts rupees, our refund id and a generic note to the paid order", async () => {
    const fetchMock = respond(200, {
      cf_refund_id: 991,
      refund_id: "rf_abc",
      order_id: "PR-1",
      refund_amount: 1999.5,
      refund_status: "PENDING",
      status_description: "In Progress",
    });
    vi.stubGlobal("fetch", fetchMock);

    const refund = await createCashfreeRefund(config, {
      orderId: "PR-1",
      refundId: "rf_abc",
      amountMinorUnits: 199_950,
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://sandbox.cashfree.com/pg/orders/PR-1/refunds");
    expect(init.method).toBe("POST");

    const body = JSON.parse(String(init.body));
    expect(body.refund_amount).toBe(1999.5);
    expect(body.refund_id).toBe("rf_abc");
    expect(body.refund_speed).toBe("STANDARD");
    // Staff's reason is internal and must not be sent to a payment processor.
    expect(body.refund_note).toBe("Refund for order PR-1");

    const headers = init.headers as Record<string, string>;
    expect(headers["x-client-id"]).toBe("app");
    expect(headers["x-client-secret"]).toBe("secret");
    expect(headers["x-idempotency-key"]).toBe("rf_abc");

    expect(refund).toMatchObject({
      refundId: "rf_abc",
      cfRefundId: "991",
      orderId: "PR-1",
      amountMinorUnits: 199_950,
      status: "pending",
    });
  });

  it("converts paise to rupees without float error", async () => {
    const fetchMock = respond(200, { refund_status: "PENDING", refund_amount: 4.35 });
    vi.stubGlobal("fetch", fetchMock);

    await createCashfreeRefund(config, { orderId: "PR-1", refundId: "rf_x", amountMinorUnits: 435 });

    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.refund_amount).toBe(4.35);
  });

  it("reads a response that arrives wrapped in an array", async () => {
    vi.stubGlobal("fetch", respond(200, [{ refund_status: "SUCCESS", refund_amount: 10, refund_id: "rf_a" }]));

    const refund = await createCashfreeRefund(config, {
      orderId: "PR-1",
      refundId: "rf_a",
      amountMinorUnits: 1000,
    });

    expect(refund.status).toBe("success");
    expect(refund.amountMinorUnits).toBe(1000);
  });

  it("never reads an unrecognised status as success", async () => {
    vi.stubGlobal("fetch", respond(200, { refund_status: "WHO_KNOWS", refund_amount: 10 }));

    const refund = await createCashfreeRefund(config, {
      orderId: "PR-1",
      refundId: "rf_a",
      amountMinorUnits: 1000,
    });

    expect(refund.status).toBe("pending");
  });

  it("reports an unreadable amount as NaN rather than zero", async () => {
    vi.stubGlobal("fetch", respond(200, { refund_status: "PENDING" }));

    const refund = await createCashfreeRefund(config, {
      orderId: "PR-1",
      refundId: "rf_a",
      amountMinorUnits: 1000,
    });

    expect(Number.isNaN(refund.amountMinorUnits)).toBe(true);
  });

  it("encodes an order id that is not URL-safe", async () => {
    const fetchMock = respond(200, { refund_status: "PENDING", refund_amount: 1 });
    vi.stubGlobal("fetch", fetchMock);

    await createCashfreeRefund(config, {
      orderId: "PR/1?x=y",
      refundId: "rf_a",
      amountMinorUnits: 100,
    });

    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      "https://sandbox.cashfree.com/pg/orders/PR%2F1%3Fx%3Dy/refunds",
    );
  });

  it("throws with Cashfree's own message when it refuses", async () => {
    vi.stubGlobal("fetch", respond(400, { message: "refund_amount is more than refundable amount" }));

    await expect(
      createCashfreeRefund(config, { orderId: "PR-1", refundId: "rf_a", amountMinorUnits: 100 }),
    ).rejects.toMatchObject({
      name: "CashfreeApiError",
      status: 400,
      message: "refund_amount is more than refundable amount",
    });
  });

  it("throws a status-0 error when Cashfree cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("socket hang up");
    }));

    await expect(
      createCashfreeRefund(config, { orderId: "PR-1", refundId: "rf_a", amountMinorUnits: 100 }),
    ).rejects.toMatchObject({ status: 0 });
  });
});

describe("fetchCashfreeRefund", () => {
  it("reads one refund back", async () => {
    const fetchMock = respond(200, {
      cf_refund_id: "55",
      refund_id: "rf_a",
      order_id: "PR-1",
      refund_amount: 20,
      refund_status: "SUCCESS",
      processed_at: "2026-09-25T10:00:00+05:30",
    });
    vi.stubGlobal("fetch", fetchMock);

    const refund = await fetchCashfreeRefund(config, "PR-1", "rf_a");

    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      "https://sandbox.cashfree.com/pg/orders/PR-1/refunds/rf_a",
    );
    expect(refund).toMatchObject({ status: "success", amountMinorUnits: 2000 });
    expect(refund?.processedAt).toBe("2026-09-25T10:00:00+05:30");
  });

  it("answers null when Cashfree has never heard of the refund", async () => {
    vi.stubGlobal("fetch", respond(404, { message: "refund not found" }));
    expect(await fetchCashfreeRefund(config, "PR-1", "rf_a")).toBeNull();
  });

  it("does not hide other failures as 'not found'", async () => {
    vi.stubGlobal("fetch", respond(500, { message: "boom" }));
    await expect(fetchCashfreeRefund(config, "PR-1", "rf_a")).rejects.toBeInstanceOf(CashfreeApiError);
  });
});

/*
 * This decides whether reserved money is released. Getting it wrong in one direction loses
 * a refund; in the other, it refunds the customer twice.
 */
describe("refundOutcomeIsKnown", () => {
  const err = (status: number) => new CashfreeApiError("x", status, null);

  it("is known when Cashfree read the request and refused it", () => {
    for (const status of [400, 401, 403, 404, 422, 429]) {
      expect(refundOutcomeIsKnown(err(status))).toBe(true);
    }
  });

  it("is NOT known after a network failure, which may have reached Cashfree", () => {
    expect(refundOutcomeIsKnown(err(0))).toBe(false);
  });

  it("is NOT known after a server error or a timeout", () => {
    for (const status of [408, 500, 502, 503, 504]) {
      expect(refundOutcomeIsKnown(err(status))).toBe(false);
    }
  });

  it("is NOT known on a conflict, which means the refund id already exists", () => {
    expect(refundOutcomeIsKnown(err(409))).toBe(false);
  });

  it("is NOT known for anything that is not a Cashfree error", () => {
    expect(refundOutcomeIsKnown(new Error("boom"))).toBe(false);
    expect(refundOutcomeIsKnown(null)).toBe(false);
  });
});
