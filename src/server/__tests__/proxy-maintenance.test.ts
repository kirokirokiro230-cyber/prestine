import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Maintenance mode closes the storefront to shoppers. It must not also close the
 * endpoints other systems call, or paying customers and parcels silently stall for as long
 * as the shop is shut.
 *
 * The store-offline lookup is mocked rather than switched on in a real database: the
 * point under test is what the proxy does when the shop IS closed.
 */
const isStoreOffline = vi.fn<() => Promise<boolean>>();

vi.mock("@/server/repositories/settings", () => ({
  isStoreOffline: () => isStoreOffline(),
}));

const { proxy } = await import("../../proxy");

function request(path: string, init?: { cookie?: string }) {
  return new NextRequest(`https://shop.example${path}`, {
    method: "POST",
    headers: init?.cookie ? { cookie: init.cookie } : undefined,
  });
}

/** `NextResponse.next()` marks itself with this header; a 503 or a rewrite does not. */
const passedThrough = (response: Response) => response.headers.get("x-middleware-next") === "1";

describe("proxy while the shop is closed for maintenance", () => {
  beforeEach(() => {
    isStoreOffline.mockReset();
    isStoreOffline.mockResolvedValue(true);
  });

  it.each([
    "/api/shipping/sync-tracking",
    "/api/payments/cashfree/webhook",
    "/api/webhooks/delhivery",
    "/api/email/review-requests",
  ])("lets %s through, because other systems call it", async (path) => {
    const response = await proxy(request(path));

    expect(response.status).toBe(200);
    expect(passedThrough(response)).toBe(true);
  });

  it("does not even look up the maintenance flag for those endpoints", async () => {
    await proxy(request("/api/shipping/sync-tracking"));

    expect(isStoreOffline).not.toHaveBeenCalled();
  });

  it.each(["/api/search", "/api/products", "/api/shipping/serviceability"])(
    "still closes the shopper-facing %s",
    async (path) => {
      const response = await proxy(request(path));

      expect(response.status).toBe(503);
    },
  );

  /*
   * The exemption is exact paths. A route nobody has opted in must stay closed, so adding
   * an endpoint under /api cannot accidentally bypass maintenance.
   */
  it("does not exempt a path that merely starts with an exempt one", async () => {
    const response = await proxy(request("/api/shipping/sync-tracking-extra"));

    expect(response.status).toBe(503);
  });

  it("still shows the maintenance page for ordinary storefront pages", async () => {
    const response = await proxy(request("/shop"));

    expect(passedThrough(response)).toBe(false);
    expect(response.headers.get("x-middleware-rewrite")).toContain("/maintenance");
  });

  it("leaves everything alone when the shop is open", async () => {
    isStoreOffline.mockResolvedValue(false);

    expect(passedThrough(await proxy(request("/api/search")))).toBe(true);
    expect(passedThrough(await proxy(request("/shop")))).toBe(true);
  });
});
