import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ callRpc: vi.fn() }));

vi.mock("../supabase", () => ({
  callRpc: mocks.callRpc,
  db: () => ({}),
}));

import { claimFirstOrder, firstOrderStatus, releaseFirstOrder } from "../first-order";

const KEYS = ["c:cus_a", "e:asha@gmail.com", "p:9876543210"];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

/*
 * The property that matters here: every failure to get an answer is "no discount". A
 * broken check that came out as "eligible" would give the discount again each time the
 * database hiccupped.
 */
describe("firstOrderStatus fails closed", () => {
  it("reads an answer from the database", async () => {
    mocks.callRpc.mockResolvedValue({ data: "available", error: null });
    expect(await firstOrderStatus(KEYS)).toEqual({ kind: "available" });

    mocks.callRpc.mockResolvedValue({ data: "held:PR-1", error: null });
    expect(await firstOrderStatus(KEYS)).toEqual({ kind: "held", orderId: "PR-1" });
  });

  it("is unavailable when the call returns an error, such as migration 21 not being run", async () => {
    mocks.callRpc.mockResolvedValue({
      data: null,
      error: { message: "Could not find the function public.first_order_discount_status" },
    });

    expect(await firstOrderStatus(KEYS)).toEqual({ kind: "unavailable" });
  });

  it("is unavailable when the call throws", async () => {
    mocks.callRpc.mockRejectedValue(new Error("network"));

    expect(await firstOrderStatus(KEYS)).toEqual({ kind: "unavailable" });
  });

  it("is unavailable for an answer it does not recognise", async () => {
    mocks.callRpc.mockResolvedValue({ data: "sure, why not", error: null });
    expect(await firstOrderStatus(KEYS)).toEqual({ kind: "unavailable" });

    mocks.callRpc.mockResolvedValue({ data: null, error: null });
    expect(await firstOrderStatus(KEYS)).toEqual({ kind: "unavailable" });
  });

  it("does not put the identity keys, which hold an email and phone numbers, in the log", async () => {
    mocks.callRpc.mockRejectedValue(new Error("boom"));

    await firstOrderStatus(KEYS);

    const logged = JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls);
    expect(logged).not.toContain("asha@gmail.com");
    expect(logged).not.toContain("9876543210");
  });
});

describe("claimFirstOrder", () => {
  it("succeeds only on 'claimed'", async () => {
    mocks.callRpc.mockResolvedValue({ data: "claimed", error: null });

    expect(await claimFirstOrder(KEYS, "PR-1", 10_000)).toEqual({ kind: "available" });
    expect(mocks.callRpc).toHaveBeenCalledWith(expect.anything(), "claim_first_order_discount", {
      p_keys: KEYS,
      p_order_id: "PR-1",
      p_discount: 10_000,
    });
  });

  it("does not read a bare 'available' as a claim", async () => {
    mocks.callRpc.mockResolvedValue({ data: "available", error: null });

    expect(await claimFirstOrder(KEYS, "PR-1", 10_000)).toEqual({ kind: "unavailable" });
  });

  it.each([
    ["used", { kind: "used" }],
    ["returning", { kind: "returning" }],
    ["held:PR-0", { kind: "held", orderId: "PR-0" }],
    ["duplicate", { kind: "used" }],
  ])("reports why it was refused: %s", async (data, expected) => {
    mocks.callRpc.mockResolvedValue({ data, error: null });

    expect(await claimFirstOrder(KEYS, "PR-1", 10_000)).toEqual(expected);
  });

  it("is refused on any failure", async () => {
    mocks.callRpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await claimFirstOrder(KEYS, "PR-1", 10_000)).toEqual({ kind: "unavailable" });

    mocks.callRpc.mockRejectedValue(new Error("network"));
    expect(await claimFirstOrder(KEYS, "PR-1", 10_000)).toEqual({ kind: "unavailable" });
  });
});

describe("releaseFirstOrder", () => {
  it("asks the database to release the claim for that order", async () => {
    mocks.callRpc.mockResolvedValue({ data: null, error: null });

    await releaseFirstOrder("PR-1");

    expect(mocks.callRpc).toHaveBeenCalledWith(expect.anything(), "release_first_order_claim", {
      p_order_id: "PR-1",
    });
  });

  it("never throws, because it runs while another failure is being reported", async () => {
    mocks.callRpc.mockRejectedValue(new Error("network"));
    await expect(releaseFirstOrder("PR-1")).resolves.toBeUndefined();

    mocks.callRpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(releaseFirstOrder("PR-1")).resolves.toBeUndefined();
  });
});
