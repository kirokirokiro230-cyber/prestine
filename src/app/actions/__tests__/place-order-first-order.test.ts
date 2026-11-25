import { beforeEach, describe, expect, it, vi } from "vitest";
/*
 * placeOrder, with the database and Cashfree replaced, to check how it treats the
 * first-order discount: that the discount is claimed before anything is charged, never
 * given when it cannot be claimed, and released when the order is not recorded.
 */

const mocks = vi.hoisted(() => ({
  consumeIpRateLimit: vi.fn(),
  currentCustomer: vi.fn(),
  getSettings: vi.fn(),
  listPromoCodes: vi.fn(),
  listActiveProducts: vi.fn(),
  getOrder: vi.fn(),
  createOrder: vi.fn(),
  cashfreeConfig: vi.fn(),
  createCashfreeOrder: vi.fn(),
  firstOrderStatus: vi.fn(),
  claimFirstOrder: vi.fn(),
  releaseFirstOrder: vi.fn(),
  checkPincode: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "shop.example", "x-forwarded-proto": "https" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/rate-limit", () => ({
  LIMITS: { checkout: 15, pincodeLookup: 30 },
  consumeIpRateLimit: mocks.consumeIpRateLimit,
  rateLimitMessage: () => "slow down",
}));
vi.mock("@/server/customer-session", () => ({ currentCustomer: mocks.currentCustomer }));
vi.mock("@/server/repositories/settings", () => ({
  getSettings: mocks.getSettings,
  listPromoCodes: mocks.listPromoCodes,
}));
vi.mock("@/server/repositories/products", () => ({ listActiveProducts: mocks.listActiveProducts }));
vi.mock("@/server/repositories/orders", () => ({
  getOrder: mocks.getOrder,
  createOrder: mocks.createOrder,
  setOrderPaymentAttempt: vi.fn(),
}));
vi.mock("@/server/cashfree", () => ({
  CashfreeApiError: class extends Error {},
  cashfreeAmountMatches: vi.fn(),
  cashfreeConfig: mocks.cashfreeConfig,
  createCashfreeOrder: mocks.createCashfreeOrder,
  fetchCashfreeOrder: vi.fn(),
  terminateCashfreeOrder: vi.fn(),
}));
vi.mock("@/server/first-order", () => ({
  firstOrderStatus: mocks.firstOrderStatus,
  claimFirstOrder: mocks.claimFirstOrder,
  releaseFirstOrder: mocks.releaseFirstOrder,
}));
vi.mock("@/server/delhivery", () => ({ checkPincode: mocks.checkPincode }));
vi.mock("@/server/notifications", () => ({
  announce: { orderPlacedCod: vi.fn(), orderPaid: vi.fn() },
}));
vi.mock("@/server/payment-settlement", () => ({ settleCashfreePayment: vi.fn() }));
vi.mock("@/server/email/after-response", () => ({ afterResponse: vi.fn() }));
vi.mock("@/server/email/dispatch", () => ({ dispatchOrderConfirmation: vi.fn() }));
vi.mock("@/server/shipping-service", () => ({ manifestShipmentForOrder: vi.fn() }));
vi.mock("../orders", () => ({ lookupOrder: vi.fn() }));

import { placeOrder, type PlaceOrderInput } from "../checkout";

const settings = {
  taxRate: 0,
  freeShippingThreshold: 0,
  standardShippingRate: 0,
  deliveryDaysMin: 3,
  deliveryDaysMax: 5,
  locale: "en-IN",
  currency: "INR",
  codEnabled: true,
  codFee: 0,
  codMinOrder: 0,
  codMaxOrder: 0,
  firstOrderDiscountPercent: 10,
};

const product = {
  id: "p1",
  slug: "coat",
  name: "Coat",
  price: 100_000,
  category: "outerwear",
  colors: [{ id: "c1", name: "Oat", hex: "#ddd" }],
  sizes: [{ label: "M" }],
};

const input = (overrides: Partial<PlaceOrderInput> = {}): PlaceOrderInput => ({
  email: "Asha.K+shop@gmail.com",
  address: {
    name: "Asha K",
    line1: "12 Mill Lane",
    city: "Bengaluru",
    region: "Karnataka",
    phone: "+91 98765 43210",
    postalCode: "560001",
  },
  items: [{ productId: "p1", colorId: "c1", size: "M", quantity: 1 }],
  paymentMethod: "prepaid",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});

  mocks.consumeIpRateLimit.mockResolvedValue(null);
  mocks.currentCustomer.mockResolvedValue({ id: "cus_a", phone: "+919000000001" });
  mocks.getSettings.mockResolvedValue({ ...settings });
  mocks.listPromoCodes.mockResolvedValue([
    { code: "BIG25", percentOff: 25, description: "25% off" },
    { code: "SMALL5", percentOff: 5, description: "5% off" },
  ]);
  mocks.listActiveProducts.mockResolvedValue([product]);
  mocks.getOrder.mockResolvedValue(undefined);
  mocks.createOrder.mockResolvedValue(undefined);
  mocks.cashfreeConfig.mockReturnValue({ environment: "sandbox" });
  mocks.createCashfreeOrder.mockResolvedValue({ paymentSessionId: "sess_1" });
  mocks.firstOrderStatus.mockResolvedValue({ kind: "available" });
  mocks.claimFirstOrder.mockResolvedValue({ kind: "available" });
  mocks.releaseFirstOrder.mockResolvedValue(undefined);
  mocks.checkPincode.mockResolvedValue({ configured: false });
});

const recorded = () => mocks.createOrder.mock.calls[0]?.[0];

describe("a customer eligible for the first-order discount", () => {
  it("is charged 10% less, and the order records it", async () => {
    const result = await placeOrder(input({ expectFirstOrder: true }));

    expect(result.ok).toBe(true);
    expect(recorded().totals).toMatchObject({ subtotal: 100_000, discount: 10_000, total: 90_000 });
    // The same recomputed figure is what Cashfree is told to collect.
    expect(mocks.createCashfreeOrder).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ amountMinorUnits: 90_000 }),
    );
    // Not a promotion code: that column is a foreign key to the promo table.
    expect(recorded().promoCode).toBeUndefined();
  });

  it("claims the discount, for every way the customer can be recognised, before charging", async () => {
    const order: string[] = [];
    mocks.claimFirstOrder.mockImplementation(async () => {
      order.push("claim");
      return { kind: "available" };
    });
    mocks.createCashfreeOrder.mockImplementation(async () => {
      order.push("cashfree");
      return { paymentSessionId: "s" };
    });
    mocks.createOrder.mockImplementation(async () => {
      order.push("record");
    });

    await placeOrder(input());

    expect(order).toEqual(["claim", "cashfree", "record"]);
    expect(mocks.claimFirstOrder).toHaveBeenCalledWith(
      // account, canonical email (no dots, no +tag), account phone, delivery phone
      ["c:cus_a", "e:ashak@gmail.com", "p:9000000001", "p:9876543210"],
      expect.stringMatching(/^PR-/),
      10_000,
    );
  });

  it("is asked about with the same keys it is later claimed with", async () => {
    await placeOrder(input());

    expect(mocks.firstOrderStatus).toHaveBeenCalledWith([
      "c:cus_a",
      "e:ashak@gmail.com",
      "p:9000000001",
      "p:9876543210",
    ]);
  });

  it("also gets it on a cash-on-delivery order", async () => {
    const result = await placeOrder(input({ paymentMethod: "cod" }));

    expect(result.ok).toBe(true);
    expect(recorded().totals.discount).toBe(10_000);
    expect(mocks.claimFirstOrder).toHaveBeenCalledTimes(1);
  });

  it("keeps the larger of a promotion code and the discount, and does not stack them", async () => {
    await placeOrder(input({ promoCode: "BIG25" }));

    expect(recorded().totals.discount).toBe(25_000);
    expect(recorded().promoCode).toBe("BIG25");
    // The code won, so the single-use discount was not spent.
    expect(mocks.claimFirstOrder).not.toHaveBeenCalled();
  });

  it("is not spent on a code worth less", async () => {
    await placeOrder(input({ promoCode: "SMALL5" }));

    expect(recorded().totals.discount).toBe(10_000);
    expect(recorded().promoCode).toBeUndefined();
    expect(mocks.claimFirstOrder).toHaveBeenCalledTimes(1);
  });
});

describe("a customer who cannot have it", () => {
  beforeEach(() => {
    mocks.firstOrderStatus.mockResolvedValue({ kind: "used" });
  });

  it("pays full price and nothing is claimed, when they did not expect a discount", async () => {
    const result = await placeOrder(input());

    expect(result.ok).toBe(true);
    expect(recorded().totals).toMatchObject({ discount: 0, total: 100_000 });
    expect(mocks.claimFirstOrder).not.toHaveBeenCalled();
  });

  it("is refused, not charged more, when they were shown a discounted total", async () => {
    const result = await placeOrder(input({ expectFirstOrder: true }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/already been used/i);
    expect(mocks.createOrder).not.toHaveBeenCalled();
    expect(mocks.createCashfreeOrder).not.toHaveBeenCalled();
    expect(mocks.claimFirstOrder).not.toHaveBeenCalled();
  });

  it("is told which unpaid order is holding the discount", async () => {
    mocks.firstOrderStatus.mockResolvedValue({ kind: "held", orderId: "PR-261016-AB23" });

    const result = await placeOrder(input({ expectFirstOrder: true }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("PR-261016-AB23");
  });

  it("gets nothing when the check could not be made, rather than a free discount", async () => {
    mocks.firstOrderStatus.mockResolvedValue({ kind: "unavailable" });

    const result = await placeOrder(input());

    expect(result.ok).toBe(true);
    expect(recorded().totals.discount).toBe(0);
    expect(mocks.claimFirstOrder).not.toHaveBeenCalled();
  });
});

describe("the race: eligible when checked, gone by the time it is claimed", () => {
  beforeEach(() => {
    mocks.claimFirstOrder.mockResolvedValue({ kind: "used" });
  });

  it("refuses the order, and nothing is charged or recorded", async () => {
    const result = await placeOrder(input({ expectFirstOrder: true }));

    expect(result.ok).toBe(false);
    expect(mocks.createCashfreeOrder).not.toHaveBeenCalled();
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });

  it("refuses even when the shopper did not expect it: it would be a different price", async () => {
    const result = await placeOrder(input());

    expect(result.ok).toBe(false);
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });
});

describe("when the order does not get recorded", () => {
  it("releases the claim if Cashfree cannot be reached", async () => {
    mocks.createCashfreeOrder.mockRejectedValue(new Error("down"));

    const result = await placeOrder(input());

    expect(result.ok).toBe(false);
    expect(mocks.releaseFirstOrder).toHaveBeenCalledWith(expect.stringMatching(/^PR-/));
  });

  it("releases the claim if the order cannot be saved", async () => {
    mocks.createOrder.mockRejectedValue(new Error("db down"));

    const result = await placeOrder(input());

    expect(result.ok).toBe(false);
    expect(mocks.releaseFirstOrder).toHaveBeenCalledTimes(1);
  });

  it("releases the claim if a cash-on-delivery order cannot be saved", async () => {
    mocks.createOrder.mockRejectedValue(new Error("db down"));

    const result = await placeOrder(input({ paymentMethod: "cod" }));

    expect(result.ok).toBe(false);
    expect(mocks.releaseFirstOrder).toHaveBeenCalledTimes(1);
  });

  it("does not release anything on a successful order", async () => {
    await placeOrder(input());

    expect(mocks.releaseFirstOrder).not.toHaveBeenCalled();
  });

  it("does not release a claim it never made", async () => {
    mocks.firstOrderStatus.mockResolvedValue({ kind: "used" });
    mocks.createOrder.mockRejectedValue(new Error("db down"));

    await placeOrder(input());

    expect(mocks.releaseFirstOrder).not.toHaveBeenCalled();
  });
});

describe("no account, or no offer", () => {
  it("gives a signed-out request nothing, and refuses one that expected it", async () => {
    mocks.currentCustomer.mockResolvedValue(null);

    const plain = await placeOrder(input());
    expect(plain.ok).toBe(true);
    expect(recorded().totals.discount).toBe(0);
    expect(mocks.firstOrderStatus).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mocks.currentCustomer.mockResolvedValue(null);
    mocks.consumeIpRateLimit.mockResolvedValue(null);
    mocks.getSettings.mockResolvedValue({ ...settings });
    mocks.listPromoCodes.mockResolvedValue([]);
    mocks.listActiveProducts.mockResolvedValue([product]);
    mocks.getOrder.mockResolvedValue(undefined);

    const expected = await placeOrder(input({ expectFirstOrder: true }));
    expect(expected.ok).toBe(false);
  });

  it("does not even ask when the offer is switched off", async () => {
    mocks.getSettings.mockResolvedValue({ ...settings, firstOrderDiscountPercent: 0 });

    const result = await placeOrder(input());

    expect(result.ok).toBe(true);
    expect(recorded().totals.discount).toBe(0);
    expect(mocks.firstOrderStatus).not.toHaveBeenCalled();
  });

  it("refuses a request that expected a discount when the offer has been switched off", async () => {
    mocks.getSettings.mockResolvedValue({ ...settings, firstOrderDiscountPercent: 0 });

    const result = await placeOrder(input({ expectFirstOrder: true }));

    expect(result.ok).toBe(false);
  });
});
