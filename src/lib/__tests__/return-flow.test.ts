import { describe, expect, it } from "vitest";
import type { ReturnStatus } from "../delhivery/types";
import {
  MAX_RETURN_DETAILS,
  RETURN_REASONS,
  canMoveReturn,
  customerReturnLabel,
  isFinalReturnStatus,
  nextReturnStatuses,
  staffReturnLabel,
  validateReturnRequest,
  type ReturnRequestInput,
} from "../return-flow";

const valid = (overrides: Partial<ReturnRequestInput> = {}): ReturnRequestInput => ({
  reason: "size",
  details: "",
  requireUpi: true,
  upiId: "asha@okaxis",
  upiConfirm: "asha@okaxis",
  ...overrides,
});

describe("validateReturnRequest", () => {
  it("accepts a complete request and returns the label staff will read", () => {
    const result = validateReturnRequest(valid());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reasonLabel).toBe("Doesn’t fit, or wrong size");
      expect(result.upiId).toBe("asha@okaxis");
      expect(result.details).toBe("");
    }
  });

  it("only accepts a reason from the list", () => {
    expect(validateReturnRequest(valid({ reason: "made-up" })).ok).toBe(false);
    expect(validateReturnRequest(valid({ reason: "" })).ok).toBe(false);

    for (const entry of RETURN_REASONS) {
      expect(validateReturnRequest(valid({ reason: entry.value, details: "x" })).ok).toBe(true);
    }
  });

  it("asks for words when the reason is 'something else'", () => {
    const result = validateReturnRequest(valid({ reason: "other", details: "   " }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.details).toMatch(/tell us/i);
  });

  it("does not require words for the listed reasons", () => {
    expect(validateReturnRequest(valid({ reason: "faulty", details: "" })).ok).toBe(true);
  });

  it("limits the length of the note", () => {
    expect(validateReturnRequest(valid({ details: "x".repeat(MAX_RETURN_DETAILS) })).ok).toBe(true);

    const result = validateReturnRequest(valid({ details: "x".repeat(MAX_RETURN_DETAILS + 1) }));
    expect(result.ok).toBe(false);
  });

  /*
   * A typo in a refund destination is not an error, it is a payment to a stranger. The
   * second entry is the safeguard, and it has to actually compare.
   */
  it("requires the UPI ID to be entered twice, identically", () => {
    const result = validateReturnRequest(valid({ upiConfirm: "asha@okaxi" }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.upiConfirm).toMatch(/do not match/i);
  });

  it("treats the two entries as equal regardless of case and spaces", () => {
    const result = validateReturnRequest(
      valid({ upiId: " Asha@OKAXIS ", upiConfirm: "asha@okaxis" }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.upiId).toBe("asha@okaxis");
  });

  /*
   * A prepaid order is refunded through Cashfree to whatever it was paid with, so asking for
   * a UPI ID would only offer a worse place to send the money. And a UPI ID that is typed
   * anyway (a stale form) must be dropped, not stored.
   */
  describe("when no UPI ID is needed (a prepaid order)", () => {
    it("accepts a request with no UPI ID at all", () => {
      const result = validateReturnRequest(valid({ requireUpi: false, upiId: "", upiConfirm: "" }));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.upiId).toBeNull();
    });

    it("does not complain about a UPI ID that is wrong or mismatched", () => {
      const result = validateReturnRequest(
        valid({ requireUpi: false, upiId: "nope", upiConfirm: "different" }),
      );
      expect(result.ok).toBe(true);
    });

    it("drops a UPI ID that was sent anyway", () => {
      const result = validateReturnRequest(valid({ requireUpi: false }));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.upiId).toBeNull();
    });

    it("still checks the reason", () => {
      expect(validateReturnRequest(valid({ requireUpi: false, reason: "" })).ok).toBe(false);
    });
  });

  it("rejects an invalid UPI ID before comparing the two", () => {
    const result = validateReturnRequest(valid({ upiId: "nope", upiConfirm: "nope" }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.upiId).toBeDefined();
      expect(result.fieldErrors.upiConfirm).toBeUndefined();
    }
  });

  it("reports every problem at once", () => {
    const result = validateReturnRequest({
      reason: "",
      details: "",
      requireUpi: true,
      upiId: "",
      upiConfirm: "",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.fieldErrors).sort()).toEqual(["reason", "upiId"]);
    }
  });
});

describe("the return lifecycle", () => {
  const ALL: ReturnStatus[] = [
    "requested",
    "approved",
    "rejected",
    "picked_up",
    "in_transit",
    "received",
    "refunded",
    "cancelled",
  ];

  it("moves forward through the normal path", () => {
    expect(canMoveReturn("requested", "approved")).toBe(true);
    expect(canMoveReturn("approved", "received")).toBe(true);
    expect(canMoveReturn("received", "refunded")).toBe(true);
  });

  it("does not let a refund happen before the goods are back", () => {
    expect(canMoveReturn("requested", "refunded")).toBe(false);
    expect(canMoveReturn("approved", "refunded")).toBe(false);
    expect(canMoveReturn("in_transit", "refunded")).toBe(false);
  });

  it("can turn a return down after inspecting what came back", () => {
    expect(canMoveReturn("received", "rejected")).toBe(true);
  });

  it("never moves backwards", () => {
    expect(canMoveReturn("approved", "requested")).toBe(false);
    expect(canMoveReturn("received", "approved")).toBe(false);
    expect(canMoveReturn("refunded", "received")).toBe(false);
  });

  it("treats refunded, rejected and cancelled as final", () => {
    for (const status of ["refunded", "rejected", "cancelled"] as const) {
      expect(isFinalReturnStatus(status), status).toBe(true);
      expect(nextReturnStatuses(status)).toEqual([]);
    }
  });

  it("treats every other state as still open", () => {
    for (const status of ["requested", "approved", "picked_up", "in_transit", "received"] as const) {
      expect(isFinalReturnStatus(status), status).toBe(false);
    }
  });

  it("refuses a move to the same state", () => {
    for (const status of ALL) expect(canMoveReturn(status, status), status).toBe(false);
  });

  it("has a label for every state, for both audiences", () => {
    for (const status of ALL) {
      expect(customerReturnLabel(status).length, status).toBeGreaterThan(0);
      expect(staffReturnLabel(status).length, status).toBeGreaterThan(0);
    }
  });
});
