import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Order } from "@/lib/types";
import { CashfreeApiError, type CashfreeConfig, type CashfreeRefund } from "../cashfree";
import type { OrderRefund } from "../repositories/refunds";

/*
 * The refund service decides when money is reserved, when Cashfree is asked, and when the
 * reservation is released. The database and Cashfree are replaced; what is being tested is
 * the order of those steps and what each outcome does.
 */

const config: CashfreeConfig = {
  appId: "app",
  secretKey: "secret",
  environment: "sandbox",
  webhookSecret: "secret",
  apiVersion: "2023-08-01",
  apiBase: "https://sandbox.cashfree.com",
};

const mocks = vi.hoisted(() => ({
  cashfreeConfig: vi.fn(),
  createCashfreeRefund: vi.fn(),
  fetchCashfreeOrder: vi.fn(),
  fetchCashfreeRefund: vi.fn(),
  getOrder: vi.fn(),
  addOrderNote: vi.fn(),
  reserveRefund: vi.fn(),
  applyRefundOutcome: vi.fn(),
  getRefund: vi.fn(),
  listOrderRefunds: vi.fn(),
  updateReturnStatus: vi.fn(),
  refundFailed: vi.fn(),
}));

vi.mock("../cashfree", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../cashfree")>()),
  cashfreeConfig: mocks.cashfreeConfig,
  createCashfreeRefund: mocks.createCashfreeRefund,
  fetchCashfreeOrder: mocks.fetchCashfreeOrder,
  fetchCashfreeRefund: mocks.fetchCashfreeRefund,
}));
vi.mock("../repositories/orders", () => ({
  getOrder: mocks.getOrder,
  addOrderNote: mocks.addOrderNote,
}));
vi.mock("../repositories/refunds", () => ({
  reserveRefund: mocks.reserveRefund,
  applyRefundOutcome: mocks.applyRefundOutcome,
  getRefund: mocks.getRefund,
  listOrderRefunds: mocks.listOrderRefunds,
}));
vi.mock("../repositories/shipping", () => ({ updateReturnStatus: mocks.updateReturnStatus }));
vi.mock("../notifications", () => ({ announce: { refundFailed: mocks.refundFailed } }));

import { afterRefundChange, issueRefund, refreshFromCashfree } from "../refunds";

const KEY = "3f2b8c1e-9d4a-4c7e-8a15-6b0e2d9f7c41";
const REFUND_ID = "rf_3f2b8c1e9d4a4c7e8a156b0e2d9f7c41";

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "PR-1",
    paymentMethod: "prepaid",
    paymentStatus: "paid",
    status: "delivered",
    cashfreeOrderId: "PR-1-RAB12",
    totals: { subtotal: 200_000, discount: 0, shipping: 0, tax: 0, total: 249_900, codFee: 0 },
    ...overrides,
  } as unknown as Order;
}

function ledgerRow(overrides: Partial<OrderRefund> = {}): OrderRefund {
  return {
    id: "row-1",
    refundId: REFUND_ID,
    orderId: "PR-1",
    cashfreeOrderId: "PR-1-RAB12",
    amount: 100_000,
    status: "requested",
    note: "Cancelled",
    actorEmail: "staff@example.com",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const accepted = (overrides: Partial<CashfreeRefund> = {}): CashfreeRefund => ({
  refundId: REFUND_ID,
  cfRefundId: "991",
  orderId: "PR-1-RAB12",
  amountMinorUnits: 100_000,
  status: "pending",
  ...overrides,
});

const input = (overrides = {}) => ({
  orderId: "PR-1",
  amount: 100_000,
  note: "Cancelled before dispatch",
  key: KEY,
  actorEmail: "staff@example.com",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});

  mocks.cashfreeConfig.mockReturnValue(config);
  mocks.getOrder.mockResolvedValue(order());
  mocks.fetchCashfreeOrder.mockResolvedValue({
    orderId: "PR-1-RAB12",
    orderStatus: "PAID",
    orderAmount: 2499,
    orderCurrency: "INR",
  });
  mocks.reserveRefund.mockImplementation(async (args) => ({
    ok: true,
    refund: ledgerRow({ amount: args.amount, cashfreeOrderId: args.cashfreeOrderId }),
  }));
  mocks.createCashfreeRefund.mockResolvedValue(accepted());
  mocks.applyRefundOutcome.mockImplementation(async (_id, outcome) => ({
    refund: ledgerRow({ status: outcome.status, failureReason: outcome.failureReason }),
    changed: true,
  }));
  mocks.addOrderNote.mockResolvedValue(undefined);
  mocks.listOrderRefunds.mockResolvedValue({ refunds: [], available: true });
  mocks.updateReturnStatus.mockResolvedValue({});
  mocks.refundFailed.mockResolvedValue(undefined);
});

describe("issueRefund: before any money is reserved", () => {
  it("refuses a key that is not a UUID, so a request cannot pick its own refund id", async () => {
    const result = await issueRefund(input({ key: "rf_chosen_by_attacker" }));

    expect(result.ok).toBe(false);
    expect(mocks.reserveRefund).not.toHaveBeenCalled();
    expect(mocks.createCashfreeRefund).not.toHaveBeenCalled();
  });

  it("refuses when Cashfree is not configured", async () => {
    mocks.cashfreeConfig.mockReturnValue(null);

    expect((await issueRefund(input())).ok).toBe(false);
    expect(mocks.reserveRefund).not.toHaveBeenCalled();
  });

  it("refuses a cash-on-delivery order and points to the UPI route", async () => {
    mocks.getOrder.mockResolvedValue(order({ paymentMethod: "cod" }));

    const result = await issueRefund(input());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/UPI/);
    expect(mocks.reserveRefund).not.toHaveBeenCalled();
    expect(mocks.createCashfreeRefund).not.toHaveBeenCalled();
  });

  it("refuses an order that was never paid", async () => {
    mocks.getOrder.mockResolvedValue(order({ paymentStatus: "pending" }));

    expect((await issueRefund(input())).ok).toBe(false);
    expect(mocks.reserveRefund).not.toHaveBeenCalled();
  });

  it("refuses when Cashfree does not show the order paid for the right amount", async () => {
    mocks.fetchCashfreeOrder.mockResolvedValue({
      orderId: "PR-1-RAB12",
      orderStatus: "PAID",
      orderAmount: 1000,
      orderCurrency: "INR",
    });

    const result = await issueRefund(input());

    expect(result.ok).toBe(false);
    expect(mocks.reserveRefund).not.toHaveBeenCalled();
  });

  it("refuses when Cashfree cannot be reached to check, rather than guessing", async () => {
    mocks.fetchCashfreeOrder.mockRejectedValue(new CashfreeApiError("down", 0, null));

    const result = await issueRefund(input());

    expect(result.ok).toBe(false);
    expect(mocks.reserveRefund).not.toHaveBeenCalled();
  });

  /*
   * A payment retried through a new session can leave the order pointing at an attempt that
   * was never paid. The order's own id is the other place the money may be.
   */
  it("falls back to the order's own Cashfree id when the newest attempt is not the paid one", async () => {
    mocks.fetchCashfreeOrder.mockImplementation(async (_config, id: string) => {
      if (id === "PR-1-RAB12") throw new CashfreeApiError("not found", 404, null);
      return { orderId: id, orderStatus: "PAID", orderAmount: 2499, orderCurrency: "INR" };
    });

    const result = await issueRefund(input());

    expect(result.ok).toBe(true);
    expect(mocks.reserveRefund).toHaveBeenCalledWith(
      expect.objectContaining({ cashfreeOrderId: "PR-1" }),
    );
    expect(mocks.createCashfreeRefund).toHaveBeenCalledWith(
      config,
      expect.objectContaining({ orderId: "PR-1" }),
    );
  });
});

describe("issueRefund: reserving", () => {
  it("says how much is left when the amount is too large", async () => {
    mocks.reserveRefund.mockResolvedValue({ ok: false, reason: "exceeds", remaining: 49_900 });

    const result = await issueRefund(input({ amount: 200_000 }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("499.00");
    expect(mocks.createCashfreeRefund).not.toHaveBeenCalled();
  });

  it("says so when everything has already been refunded", async () => {
    mocks.reserveRefund.mockResolvedValue({ ok: false, reason: "exceeds", remaining: 0 });

    const result = await issueRefund(input());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/already been refunded in full/i);
  });

  it("treats a repeated submission as already done, and does not ask Cashfree again", async () => {
    mocks.reserveRefund.mockResolvedValue({ ok: false, reason: "duplicate" });

    const result = await issueRefund(input());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/already submitted/i);
    expect(mocks.createCashfreeRefund).not.toHaveBeenCalled();
  });

  it("tells staff to run the migration when the ledger is missing", async () => {
    mocks.reserveRefund.mockResolvedValue({ ok: false, reason: "unavailable" });

    const result = await issueRefund(input());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("00000000000020_order_refunds.sql");
    expect(mocks.createCashfreeRefund).not.toHaveBeenCalled();
  });

  it("reserves BEFORE asking Cashfree, and sends Cashfree the same id", async () => {
    const order_: string[] = [];
    mocks.reserveRefund.mockImplementation(async (args) => {
      order_.push("reserve");
      return { ok: true, refund: ledgerRow({ amount: args.amount }) };
    });
    mocks.createCashfreeRefund.mockImplementation(async () => {
      order_.push("cashfree");
      return accepted();
    });

    await issueRefund(input());

    expect(order_).toEqual(["reserve", "cashfree"]);
    expect(mocks.reserveRefund).toHaveBeenCalledWith(
      expect.objectContaining({ refundId: REFUND_ID, amount: 100_000, orderId: "PR-1" }),
    );
    expect(mocks.createCashfreeRefund).toHaveBeenCalledWith(
      config,
      expect.objectContaining({ refundId: REFUND_ID, amountMinorUnits: 100_000 }),
    );
  });

  it("passes the return it settles through to the ledger", async () => {
    await issueRefund(input({ returnId: "ret-1" }));

    expect(mocks.reserveRefund).toHaveBeenCalledWith(expect.objectContaining({ returnId: "ret-1" }));
  });
});

describe("issueRefund: what Cashfree answers", () => {
  it("records a refund Cashfree accepted as pending and reports success", async () => {
    const result = await issueRefund(input());

    expect(result.ok).toBe(true);
    expect(mocks.applyRefundOutcome).toHaveBeenCalledWith(
      REFUND_ID,
      expect.objectContaining({ status: "pending", cfRefundId: "991" }),
    );
    // Accepted is not delivered: nothing that depends on the money arriving runs yet.
    expect(mocks.updateReturnStatus).not.toHaveBeenCalled();
  });

  it("RELEASES the money when Cashfree definitely refused (a 4xx)", async () => {
    mocks.createCashfreeRefund.mockRejectedValue(
      new CashfreeApiError("refund_amount is more than refundable amount", 400, null),
    );

    const result = await issueRefund(input());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("refund_amount is more than refundable amount");
    expect(mocks.applyRefundOutcome).toHaveBeenCalledWith(
      REFUND_ID,
      expect.objectContaining({ status: "failed" }),
    );
  });

  it.each([
    ["a network failure", new CashfreeApiError("socket hang up", 0, null)],
    ["a timeout", new CashfreeApiError("timeout", 408, null)],
    ["a server error", new CashfreeApiError("bad gateway", 502, null)],
    ["a conflict", new CashfreeApiError("exists", 409, null)],
  ])("KEEPS the money reserved after %s, because the refund may exist", async (_label, error) => {
    mocks.createCashfreeRefund.mockRejectedValue(error);

    const result = await issueRefund(input());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/check status/i);
      expect(result.refund?.status).toBe("requested");
    }
    // Releasing it here is what would allow a second refund while the first is in flight.
    expect(mocks.applyRefundOutcome).not.toHaveBeenCalled();
  });

  it("reports a refund Cashfree accepted and then immediately failed", async () => {
    mocks.createCashfreeRefund.mockResolvedValue(
      accepted({ status: "failed", statusDescription: "Beneficiary account closed" }),
    );

    const result = await issueRefund(input());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Beneficiary account closed");
  });

  it("still reports success when Cashfree took the refund but the answer could not be recorded", async () => {
    mocks.applyRefundOutcome.mockRejectedValue(new Error("database down"));

    const result = await issueRefund(input());

    // Cashfree has the refund. Saying "failed" would invite a second one.
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message).toMatch(/check status/i);
  });
});

describe("afterRefundChange", () => {
  it("does nothing when nothing changed, so a repeated webhook has no effect", async () => {
    await afterRefundChange(ledgerRow({ status: "success", returnId: "ret-1" }), false);

    expect(mocks.addOrderNote).not.toHaveBeenCalled();
    expect(mocks.updateReturnStatus).not.toHaveBeenCalled();
  });

  it("marks the return refunded, with the amount that actually landed, once money has arrived", async () => {
    mocks.listOrderRefunds.mockResolvedValue({
      available: true,
      refunds: [
        ledgerRow({ id: "a", status: "success", amount: 100_000, returnId: "ret-1" }),
        ledgerRow({ id: "b", status: "success", amount: 25_000, returnId: "ret-1" }),
        ledgerRow({ id: "c", status: "failed", amount: 900_000, returnId: "ret-1" }),
        ledgerRow({ id: "d", status: "success", amount: 77_000, returnId: "other-return" }),
      ],
    });

    await afterRefundChange(ledgerRow({ status: "success", returnId: "ret-1" }), true);

    expect(mocks.updateReturnStatus).toHaveBeenCalledWith("ret-1", "refunded", {
      refundAmount: 125_000,
      expectedFrom: "received",
    });
  });

  it("does not touch a return when the refund was not for one", async () => {
    await afterRefundChange(ledgerRow({ status: "success" }), true);

    expect(mocks.updateReturnStatus).not.toHaveBeenCalled();
  });

  it("leaves the return alone when a refund fails, and tells staff", async () => {
    await afterRefundChange(
      ledgerRow({ status: "failed", failureReason: "Account closed", returnId: "ret-1" }),
      true,
    );

    expect(mocks.updateReturnStatus).not.toHaveBeenCalled();
    expect(mocks.addOrderNote).toHaveBeenCalledWith("PR-1", expect.stringContaining("Account closed"));
    expect(mocks.refundFailed).toHaveBeenCalledWith(
      expect.objectContaining({ id: "PR-1" }),
      100_000,
      "Account closed",
      REFUND_ID,
    );
  });

  it("does not let a failure here escape", async () => {
    mocks.addOrderNote.mockRejectedValue(new Error("boom"));

    await expect(
      afterRefundChange(ledgerRow({ status: "failed" }), true),
    ).resolves.toBeUndefined();
  });
});

describe("refreshFromCashfree", () => {
  it("updates the ledger from what Cashfree reports", async () => {
    mocks.fetchCashfreeRefund.mockResolvedValue(accepted({ status: "success" }));

    const result = await refreshFromCashfree(config, ledgerRow({ status: "pending" }));

    expect(result.ok).toBe(true);
    expect(mocks.applyRefundOutcome).toHaveBeenCalledWith(
      REFUND_ID,
      expect.objectContaining({ status: "success" }),
    );
  });

  it("does not ask Cashfree about a refund that is already settled", async () => {
    const result = await refreshFromCashfree(config, ledgerRow({ status: "success" }));

    expect(result.ok).toBe(true);
    expect(mocks.fetchCashfreeRefund).not.toHaveBeenCalled();
  });

  it("is retryable when Cashfree cannot be reached", async () => {
    mocks.fetchCashfreeRefund.mockRejectedValue(new CashfreeApiError("down", 0, null));

    const result = await refreshFromCashfree(config, ledgerRow({ status: "pending" }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retryable).toBe(true);
  });

  /*
   * "Cashfree has no record" frees the money, so it has to be certain. Straight after a
   * timeout, a missing record may only mean the refund has not landed yet.
   */
  it("does NOT release a fresh unconfirmed refund that Cashfree has no record of yet", async () => {
    mocks.fetchCashfreeRefund.mockResolvedValue(null);

    const result = await refreshFromCashfree(
      config,
      ledgerRow({ status: "requested", createdAt: new Date().toISOString() }),
    );

    expect(result.ok).toBe(false);
    expect(mocks.applyRefundOutcome).not.toHaveBeenCalled();
  });

  it("releases an old unconfirmed refund that Cashfree never received", async () => {
    mocks.fetchCashfreeRefund.mockResolvedValue(null);

    const result = await refreshFromCashfree(
      config,
      ledgerRow({
        status: "requested",
        createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      }),
    );

    expect(result.ok).toBe(true);
    expect(mocks.applyRefundOutcome).toHaveBeenCalledWith(
      REFUND_ID,
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("never releases a refund Cashfree accepted earlier, even if it now reports no record", async () => {
    mocks.fetchCashfreeRefund.mockResolvedValue(null);

    const result = await refreshFromCashfree(
      config,
      ledgerRow({
        status: "pending",
        createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      }),
    );

    expect(result.ok).toBe(false);
    expect(mocks.applyRefundOutcome).not.toHaveBeenCalled();
  });
});
