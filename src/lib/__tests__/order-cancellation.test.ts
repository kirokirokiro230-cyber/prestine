import { describe, expect, it } from "vitest";
import { cancelEligibility, courierHasCollected } from "../order-cancellation";

const processing = (shippingStatus?: string, shippedAt?: string) => ({
  status: "processing" as const,
  shippingStatus,
  shippedAt,
});

describe("courierHasCollected", () => {
  it("treats no status at all as not collected", () => {
    expect(courierHasCollected({})).toBe(false);
    expect(courierHasCollected({ status: "" })).toBe(false);
    expect(courierHasCollected({ status: null })).toBe(false);
  });

  it("treats the states before pickup as not collected", () => {
    for (const status of [
      "Manifested",
      "manifested",
      "Pending",
      "Not Picked",
      "Pickup Scheduled",
      "Pickup Pending",
      "Ready to Ship",
      "Ready for Pickup",
      "Awaiting pickup",
    ]) {
      expect(courierHasCollected({ status }), status).toBe(false);
    }
  });

  it("treats everything from pickup onwards as collected", () => {
    for (const status of [
      "In Transit",
      "Dispatched",
      "Out for Delivery",
      "Delivered",
      "RTO",
      "RTO Delivered",
      "Picked Up",
    ]) {
      expect(courierHasCollected({ status }), status).toBe(true);
    }
  });

  /*
   * The safe direction to be wrong in. A status nobody has seen before must hide the
   * button, because a customer who cannot cancel emails us, while one who cancels a
   * moving parcel costs return freight.
   */
  it("treats a status it does not recognise as collected", () => {
    expect(courierHasCollected({ status: "Some New Courier State" })).toBe(true);
    expect(courierHasCollected({ status: "Held at facility" })).toBe(true);
  });

  /*
   * "Pending" appears both before pickup (our own initial value) and after a failed
   * delivery attempt. A recorded pickup time is what tells them apart.
   */
  it("lets a recorded pickup override a status that reads like the early states", () => {
    expect(courierHasCollected({ pickedUp: true, status: "Pending" })).toBe(true);
    expect(courierHasCollected({ pickedUp: true, status: "Manifested" })).toBe(true);
    expect(courierHasCollected({ pickedUp: true })).toBe(true);
  });

  it("does not let 'pending' match inside a longer status", () => {
    expect(courierHasCollected({ status: "Delivery Pending Reattempt" })).toBe(true);
  });
});

describe("cancelEligibility", () => {
  it("allows a processing order with no shipment yet", () => {
    expect(cancelEligibility(processing()).allowed).toBe(true);
  });

  it("allows a processing order whose parcel is manifested but not collected", () => {
    expect(cancelEligibility(processing("Manifested")).allowed).toBe(true);
    expect(cancelEligibility(processing("pending")).allowed).toBe(true);
    expect(cancelEligibility(processing("Not Picked")).allowed).toBe(true);
  });

  it("refuses once the courier has collected it, even if the order still says processing", () => {
    const result = cancelEligibility(processing("In Transit"));
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.explain).toBe(true);
      expect(result.reason).toMatch(/collected/i);
    }
  });

  it("refuses when a pickup time is recorded, whatever the status text says", () => {
    expect(cancelEligibility(processing("Manifested", "2026-10-17T09:00:00Z")).allowed).toBe(false);
  });

  it("refuses shipped, delivered and cancelled orders", () => {
    for (const status of ["shipped", "delivered", "cancelled"] as const) {
      expect(cancelEligibility({ status }).allowed, status).toBe(false);
    }
  });

  it("only explains the refusal for an order that is actually on its way", () => {
    const explain = (status: "shipped" | "delivered" | "cancelled") => {
      const result = cancelEligibility({ status });
      return result.allowed ? null : result.explain;
    };

    expect(explain("shipped")).toBe(true);
    expect(explain("delivered")).toBe(false);
    expect(explain("cancelled")).toBe(false);
  });
});
