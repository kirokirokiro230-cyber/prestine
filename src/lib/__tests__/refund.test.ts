import { describe, expect, it } from "vitest";
import {
  isLiveRefund,
  isSettledRefund,
  normaliseRefundStatus,
  parseRefundAmount,
  refundIdFromKey,
  refundNoteError,
  refundableRemaining,
  refundedTotal,
  type RefundStatus,
} from "../refund";

describe("normaliseRefundStatus", () => {
  it("maps Cashfree's statuses", () => {
    expect(normaliseRefundStatus("SUCCESS")).toBe("success");
    expect(normaliseRefundStatus("FAILED")).toBe("failed");
    expect(normaliseRefundStatus("CANCELLED")).toBe("cancelled");
    expect(normaliseRefundStatus("ONHOLD")).toBe("onhold");
    expect(normaliseRefundStatus("PENDING")).toBe("pending");
  });

  it("ignores case and spacing", () => {
    expect(normaliseRefundStatus(" success ")).toBe("success");
    expect(normaliseRefundStatus("canceled")).toBe("cancelled");
  });

  it("reads anything it does not recognise as pending, never as success", () => {
    expect(normaliseRefundStatus("SOMETHING_NEW")).toBe("pending");
    expect(normaliseRefundStatus("")).toBe("pending");
    expect(normaliseRefundStatus(undefined)).toBe("pending");
    expect(normaliseRefundStatus(null)).toBe("pending");
    expect(normaliseRefundStatus(1)).toBe("pending");
  });
});

describe("live and settled", () => {
  const all: RefundStatus[] = ["requested", "pending", "onhold", "success", "failed", "cancelled"];

  it("counts failed and cancelled refunds as money not spent", () => {
    expect(all.filter(isLiveRefund)).toEqual(["requested", "pending", "onhold", "success"]);
  });

  it("treats only success, failed and cancelled as finished", () => {
    expect(all.filter(isSettledRefund)).toEqual(["success", "failed", "cancelled"]);
  });
});

describe("what can still be refunded", () => {
  it("is the whole total when nothing has been refunded", () => {
    expect(refundableRemaining(249_900, [])).toBe(249_900);
  });

  it("subtracts refunds that are processing or done", () => {
    const refunds = [
      { amount: 50_000, status: "success" as const },
      { amount: 20_000, status: "pending" as const },
    ];
    expect(refundedTotal(refunds)).toBe(70_000);
    expect(refundableRemaining(249_900, refunds)).toBe(179_900);
  });

  it("gives money back when a refund failed or was cancelled", () => {
    const refunds = [
      { amount: 100_000, status: "failed" as const },
      { amount: 40_000, status: "cancelled" as const },
    ];
    expect(refundableRemaining(249_900, refunds)).toBe(249_900);
  });

  it("holds the money of a refund Cashfree has not confirmed", () => {
    expect(refundableRemaining(100_000, [{ amount: 100_000, status: "requested" }])).toBe(0);
  });

  it("never goes negative", () => {
    expect(refundableRemaining(1_000, [{ amount: 5_000, status: "success" }])).toBe(0);
  });
});

describe("parseRefundAmount", () => {
  it.each([
    ["1", 100],
    ["1250", 125_000],
    ["1,250.00", 125_000],
    ["₹1250", 125_000],
    [" 99.5 ", 9_950],
    ["99.50", 9_950],
    ["0.01", 1],
    ["0.10", 10],
    ["2499", 249_900],
    ["1.15", 115],
  ])("reads %s as %i paise", (input, minor) => {
    expect(parseRefundAmount(input)).toEqual({ ok: true, minor });
  });

  it("does not suffer float error on amounts like 1.15 or 4.35", () => {
    expect(parseRefundAmount("4.35")).toEqual({ ok: true, minor: 435 });
    expect(parseRefundAmount("19.99")).toEqual({ ok: true, minor: 1_999 });
  });

  it.each(["", "   ", "abc", "-5", "1.234", "1e3", "1.", ".5", "12,34,56.789", "0", "0.00", "NaN", "Infinity", "1 000 000 000 00"])(
    "refuses %j",
    (input) => {
      expect(parseRefundAmount(input).ok).toBe(false);
    },
  );

  it("refuses an amount too large to be a real refund", () => {
    expect(parseRefundAmount("1234567890").ok).toBe(false);
  });
});

describe("refundNoteError", () => {
  it("wants a reason", () => {
    expect(refundNoteError("")).not.toBeNull();
    expect(refundNoteError("  ok ")).not.toBeNull();
    expect(refundNoteError("  Cancelled before dispatch ")).toBeNull();
  });

  it("caps the length", () => {
    expect(refundNoteError("x".repeat(200))).toBeNull();
    expect(refundNoteError("x".repeat(201))).not.toBeNull();
  });
});

describe("refundIdFromKey", () => {
  it("derives a stable, Cashfree-safe id from a UUID", () => {
    const id = refundIdFromKey("3f2b8c1e-9d4a-4c7e-8a15-6b0e2d9f7c41");
    expect(id).toBe("rf_3f2b8c1e9d4a4c7e8a156b0e2d9f7c41");
    expect(id).toMatch(/^rf_[0-9a-f]{32}$/);
    expect(id!.length).toBeLessThanOrEqual(40);
  });

  it("gives the same id for the same key, which is what makes a double click safe", () => {
    const key = "3f2b8c1e-9d4a-4c7e-8a15-6b0e2d9f7c41";
    expect(refundIdFromKey(key)).toBe(refundIdFromKey(key.toUpperCase()));
  });

  it("refuses anything that is not a UUID, so a request cannot pick its own id", () => {
    expect(refundIdFromKey("")).toBeNull();
    expect(refundIdFromKey("rf_anything")).toBeNull();
    expect(refundIdFromKey("../../etc/passwd")).toBeNull();
    expect(refundIdFromKey("3f2b8c1e-9d4a-4c7e-8a15-6b0e2d9f7c41; drop table")).toBeNull();
  });
});
