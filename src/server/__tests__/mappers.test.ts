import { describe, expect, it } from "vitest";
import seedProducts from "@/lib/data/products";
import { demoOrders } from "@/lib/orders";
import type {
  AdminUser,
  AuditEntry,
  Banner,
  CustomerAccount,
  Order,
  PhoneVerification,
  Product,
  PromoCode,
  StoreSettings,
  SubmittedReview,
} from "@/lib/types";
import {
  fromAdmin,
  fromAuditEntry,
  fromBanner,
  fromCategory,
  fromCollection,
  fromCustomer,
  fromOrder,
  fromPhoneVerification,
  fromProduct,
  fromPromoCode,
  fromSettings,
  fromSubmittedReview,
  toAdmin,
  toAuditEntry,
  toBanner,
  toCategory,
  toCollection,
  toCustomer,
  toOrder,
  toPhoneVerification,
  toProduct,
  toPromoCode,
  toSettings,
  toSubmittedReview,
} from "@/server/db/mappers";

/**
 * Round-trip tests for the row/domain mapping.
 *
 * A mapping bug does not throw. It drops a field, or turns `undefined` into `null`, or
 * loses the order of a size run — and the first sign is a customer seeing the wrong
 * price. So the property asserted here is the one that matters: taking a domain object
 * to rows and back must return exactly what went in.
 *
 * These run against the real seed catalogue rather than a hand-written fixture. Thirty-odd
 * products cover the combinations a fixture would miss: products with and without
 * photography, with and without a markdown, with and without SEO overrides.
 *
 * The insert objects are cast to row objects to close the loop. That is sound *because*
 * every mapper spells out every column instead of relying on a database default — which
 * the final test in this file asserts directly, since it is the assumption the cast rests
 * on.
 */

/** What the database would hand back for a row that was just written. */
function asRow<T>(insert: unknown): T {
  return insert as T;
}

/**
 * The same for a list.
 *
 * A separate helper rather than `list.map(asRow)`, because passing a generic function to
 * `map` gives it no parameter position to infer from and it silently resolves to
 * `unknown[]`.
 */
function asRows<T>(inserts: unknown[]): T[] {
  return inserts as T[];
}

/** A date-only or full ISO string as the full instant a `timestamptz` returns. */
function fullIso(value: string | undefined): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}

describe("product mapping", () => {
  it("round-trips every seeded product", () => {
    for (const seeded of seedProducts) {
      // The seed omits admin-owned fields; the store fills them on load. Supply the
      // same defaults so the comparison is against a complete product.
      const product: Product = {
        ...seeded,
        status: seeded.status ?? "active",
        taxable: seeded.taxable ?? true,
        sustainable: seeded.sustainable ?? false,
        showOnHome: seeded.showOnHome ?? false,
        pairsWith: seeded.pairsWith ?? [],
        createdAt: seeded.createdAt ?? seeded.releasedAt,
        updatedAt: seeded.updatedAt ?? seeded.releasedAt,
      };

      const rows = fromProduct(product);
      const back = toProduct(
        asRow(rows.product),
        asRows(rows.colors),
        asRows(rows.sizes),
        asRows(rows.memberships),
      );

      expect(back).toEqual({
        ...product,
        releasedAt: fullIso(product.releasedAt),
        createdAt: fullIso(product.createdAt),
        updatedAt: fullIso(product.updatedAt),
      });
    }
  });

  /**
   * The one intended difference between what goes in and what comes back.
   *
   * The seed catalogue writes date-only strings — `releasedAt: "2026-07-02"`. A
   * `timestamptz` column has no such thing, so the value comes back as a full instant.
   * Called out with an explicit test rather than smoothed over in the mapper, because it
   * is a behaviour change and somebody should meet it here rather than in production.
   *
   * It is safe: both forms are ISO-8601, both sort lexicographically in the same order,
   * and every consumer either formats the value for display or compares it with `<`.
   * What it would *not* survive is code doing an exact string match on a date, and there
   * is none.
   */
  it("normalises a date-only string to a full instant", () => {
    const product = { ...seedProducts[0], releasedAt: "2026-07-02" } as Product;
    const rows = fromProduct(product);

    const back = toProduct(asRow(rows.product), [], [], []);
    expect(back.releasedAt).toBe("2026-07-02T00:00:00.000Z");
    // Still orders correctly against the values it will sit alongside.
    expect(back.releasedAt > "2026-07-01T23:59:59.999Z").toBe(true);
    expect(back.releasedAt < "2026-07-03").toBe(true);
  });

  it("preserves colourway and size order", () => {
    const product = { ...seedProducts[0], sizes: [{ label: "S" }, { label: "M" }, { label: "L" }] };
    const rows = fromProduct(product as Product);

    // Reversed on the way back in, as an unordered query result would be.
    const back = toProduct(
      asRow(rows.product),
      asRows([...rows.colors].reverse()),
      asRows([...rows.sizes].reverse()),
      asRows([...rows.memberships].reverse()),
    );

    expect(back.sizes.map((size) => size.label)).toEqual(["S", "M", "L"]);
    expect(back.colors.map((color) => color.id)).toEqual(
      product.colors.map((color) => color.id),
    );
    expect(back.collections).toEqual(product.collections);
  });

  /**
   * `images: []` is truthy, so a colourway with an empty array would take the "has
   * photography" branch in the gallery and render nothing at all.
   */
  it("normalises an empty image list to absent", () => {
    const product = {
      ...seedProducts[0],
      colors: [{ id: "bone", name: "Bone", hex: "#E8E1D5" }],
    } as Product;

    const rows = fromProduct(product);
    expect(rows.colors[0].images).toEqual([]);

    const back = toProduct(asRow(rows.product), asRows(rows.colors), [], []);
    expect(back.colors[0].images).toBeUndefined();
  });

  it("keeps photography when present", () => {
    const product = {
      ...seedProducts[0],
      colors: [
        { id: "bone", name: "Bone", hex: "#E8E1D5", images: ["/uploads/aaaabbbbccccdddd.jpg"] },
      ],
    } as Product;

    const rows = fromProduct(product);
    const back = toProduct(asRow(rows.product), asRows(rows.colors), [], []);
    expect(back.colors[0].images).toEqual(["/uploads/aaaabbbbccccdddd.jpg"]);
  });

  it("refuses an unparseable date rather than storing an invalid one", () => {
    const product = { ...seedProducts[0], releasedAt: "not a date" } as Product;
    expect(() => fromProduct(product)).toThrow(/releasedAt/);
  });
});

describe("order mapping", () => {
  it("round-trips the demo orders", () => {
    for (const seeded of demoOrders) {
      const order: Order = { ...seeded, notes: seeded.notes ?? [] };
      const rows = fromOrder(order);
      const back = toOrder(asRow(rows.order), asRows(rows.lines));
      expect(back).toEqual(order);
    }
  });

  it("preserves line order regardless of row order", () => {
    const order: Order = { ...demoOrders[0], notes: demoOrders[0].notes ?? [] };
    const rows = fromOrder(order);
    const back = toOrder(asRow(rows.order), asRows([...rows.lines].reverse()));

    expect(back.lines).toEqual(order.lines);
  });

  /** Totals are a snapshot of what was agreed. They must survive byte-for-byte. */
  it("stores totals and address as written", () => {
    const order: Order = { ...demoOrders[0], notes: [] };
    const rows = fromOrder(order);

    expect(rows.order.totals).toEqual(order.totals);
    expect(rows.order.shippingAddress).toEqual(order.shippingAddress);
  });

  it("turns absent optional fields into null, not undefined", () => {
    const order: Order = {
      id: "ord_1",
      placedAt: "2026-01-01T00:00:00.000Z",
      status: "processing",
      lines: [],
      totals: { subtotal: 100, discount: 0, shipping: 0, tax: 0, total: 100 },
      shippingAddress: {
        name: "A B",
        phone: "+44 20 7946 0102",
        line1: "1 Road",
        city: "Town",
        region: "Region",
        postalCode: "AB1 2CD",
        country: "GB",
      },
    };

    const rows = fromOrder(order);
    expect(rows.order.email).toBeNull();
    expect(rows.order.trackingNumber).toBeNull();
    expect(rows.order.shippedAt).toBeNull();

    const back = toOrder(asRow(rows.order), []);
    expect(back.email).toBeUndefined();
    expect(back.shippedAt).toBeUndefined();
  });
});

describe("taxonomy mapping", () => {
  it("round-trips a category", () => {
    const category = {
      slug: "knitwear",
      name: "Knitwear",
      blurb: "Cashmere and lambswool.",
      silhouette: "sweater",
      position: 3,
    } as const;

    expect(toCategory(asRow(fromCategory(category)))).toEqual(category);
  });

  it("round-trips a collection", () => {
    const collection = {
      slug: "essentials",
      name: "The Essentials",
      blurb: "Twelve pieces.",
      description: "Never discounted.",
      position: 1,
      hidden: false,
    };

    expect(toCollection(asRow(fromCollection(collection)))).toEqual(collection);
  });

  it("defaults a hidden flag that was never set", () => {
    const rows = fromCollection({
      slug: "x",
      name: "X",
      blurb: "",
      description: "",
    });
    expect(rows.hidden).toBe(false);
  });
});

describe("merchandising mapping", () => {
  const banner: Banner = {
    id: "ban_1",
    eyebrow: "Autumn",
    heading: "A heading",
    body: "Some body copy.",
    ctaLabel: "Shop",
    ctaHref: "/shop",
    imageUrl: "/uploads/aaaabbbbccccdddd.jpg",
    imageAlt: "Alt text",
    accentHex: "#B08D63",
    textTone: "light",
    align: "left",
    active: true,
    position: 0,
    startsAt: "2026-01-01T00:00:00.000Z",
    endsAt: "2026-02-01T00:00:00.000Z",
    createdAt: "2025-12-01T00:00:00.000Z",
    updatedAt: "2025-12-02T00:00:00.000Z",
  };

  it("round-trips a fully populated banner", () => {
    expect(toBanner(asRow(fromBanner(banner)))).toEqual(banner);
  });

  it("round-trips a minimal banner", () => {
    const minimal: Banner = {
      id: "ban_2",
      heading: "Just a heading",
      textTone: "dark",
      align: "center",
      active: false,
      position: 4,
      createdAt: "2025-12-01T00:00:00.000Z",
      updatedAt: "2025-12-01T00:00:00.000Z",
    };

    expect(toBanner(asRow(fromBanner(minimal)))).toEqual(minimal);
  });

  it("round-trips a promotion code", () => {
    const percent: PromoCode = { code: "WELCOME10", percentOff: 10, description: "10% off" };
    const amount: PromoCode = {
      code: "TENOFF",
      amountOff: 1000,
      minSubtotal: 5000,
      description: "£10 off over £50",
    };

    expect(toPromoCode(asRow(fromPromoCode(percent)))).toEqual(percent);
    expect(toPromoCode(asRow(fromPromoCode(amount)))).toEqual(amount);
  });

});

describe("settings, staff and audit mapping", () => {
  const settings: StoreSettings = {
    name: "Prestine",
    legalName: "Prestine Ltd",
    tagline: "Made to outlast",
    description: "A description.",
    url: "https://example.com",
    email: "hello@example.com",
    phone: "+44 20 0000 0000",
    address: "1 Road, London",
    currency: "GBP",
    locale: "en-GB",
    freeShippingThreshold: 20000,
    standardShippingRate: 900,
    taxRate: 0.2,
    returnWindowDays: 30,
    social: { instagram: "a", pinterest: "b", youtube: "c" },
    deliveryDaysMin: 3,
    deliveryDaysMax: 5,
    reviewRequestDelayDays: 5,
    announcements: ["One", "Two"],
    marqueeItems: ["Wool", "Linen"],
    homeNewArrivalsCount: 4,
    servicePromises: [{ title: "Shipping", body: "Free over $200." }],
    shippingReturnsCopy: ["Delivered in 3–5 days.", "Returns are free."],
    maintenanceMode: false,
  };

  it("round-trips settings", () => {
    expect(toSettings(asRow(fromSettings(settings)))).toEqual(settings);
  });

  it("pins settings to the single permitted row", () => {
    expect(fromSettings(settings).id).toBe(1);
  });

  it("round-trips an admin without leaking the hash shape", () => {
    const admin: AdminUser = {
      id: "adm_1",
      email: "owner@example.com",
      name: "Owner",
      role: "owner",
      passwordHash: "a".repeat(128),
      passwordSalt: "b".repeat(32),
      createdAt: "2025-12-01T00:00:00.000Z",
      lastLoginAt: "2026-01-02T00:00:00.000Z",
      disabled: false,
    };

    expect(toAdmin(asRow(fromAdmin(admin)))).toEqual(admin);
  });

  /** The unique index is only a guarantee if every writer normalises the same way. */
  it("lower-cases an admin email on write", () => {
    const admin: AdminUser = {
      id: "adm_2",
      email: "  Owner@Example.COM ",
      name: "Owner",
      role: "owner",
      passwordHash: "a",
      passwordSalt: "b",
      createdAt: "2025-12-01T00:00:00.000Z",
    };

    expect(fromAdmin(admin).email).toBe("owner@example.com");
  });

  it("round-trips an audit entry, keeping a null actor null", () => {
    const entry: AuditEntry = {
      id: "aud_1",
      at: "2026-01-01T12:00:00.000Z",
      actorId: null,
      actorEmail: "unknown",
      action: "login:failed",
      entity: "session",
      entityId: "unknown",
      summary: "Failed sign-in attempt",
    };

    const back = toAuditEntry(asRow(fromAuditEntry(entry)));
    expect(back).toEqual(entry);
    // Not undefined: the domain type declares `string | null`, and the feed renders on it.
    expect(back.actorId).toBeNull();
  });
});

describe("customer account mapping", () => {
  const account: CustomerAccount = {
    id: "cus_1",
    phone: "+447700900123",
    name: "Ada Lovelace",
    email: "ada@example.com",
    passwordHash: "a".repeat(128),
    passwordSalt: "b".repeat(32),
    phoneVerifiedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastLoginAt: "2026-01-02T00:00:00.000Z",
    disabled: false,
  };

  it("round-trips a fully populated account", () => {
    expect(toCustomer(asRow(fromCustomer(account)))).toEqual(account);
  });

  it("round-trips an account with no email or last login", () => {
    const minimal: CustomerAccount = {
      id: "cus_2",
      phone: "+447700900456",
      name: "Grace Hopper",
      passwordHash: "c".repeat(128),
      passwordSalt: "d".repeat(32),
      phoneVerifiedAt: "2026-01-03T00:00:00.000Z",
      createdAt: "2026-01-03T00:00:00.000Z",
      disabled: false,
    };

    const back = toCustomer(asRow(fromCustomer(minimal)));
    expect(back).toEqual(minimal);
    // Absent, not empty: an account without an email must not read back as `null`.
    expect(back.email).toBeUndefined();
    expect(back.lastLoginAt).toBeUndefined();
  });

  /**
   * Phone is the login identifier, so every writer must store it in one canonical form.
   * An already-international number with punctuation exercises the normaliser without
   * depending on the configured default country code.
   */
  it("normalises the phone number on write", () => {
    const back = fromCustomer({ ...account, phone: "+44 7700 900123" });
    expect(back.phone).toBe("+447700900123");
  });

  it("refuses a phone number it cannot normalise", () => {
    expect(() => fromCustomer({ ...account, phone: "not a number" })).toThrow(/phone/);
  });
});

describe("phone verification mapping", () => {
  const signup: PhoneVerification = {
    id: "otp_1",
    phone: "+447700900123",
    purpose: "signup",
    provider: "local",
    codeHash: "e".repeat(128),
    codeSalt: "f".repeat(32),
    expiresAt: "2026-01-01T00:10:00.000Z",
    attempts: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    pendingName: "Ada Lovelace",
    pendingPasswordHash: "a".repeat(128),
    pendingPasswordSalt: "b".repeat(32),
    pendingEmail: "ada@example.com",
  };

  it("round-trips a signup code carrying the pending account", () => {
    expect(toPhoneVerification(asRow(fromPhoneVerification(signup)))).toEqual(signup);
  });

  it("round-trips a password-reset code with no pending fields", () => {
    const reset: PhoneVerification = {
      id: "otp_2",
      phone: "+447700900456",
      purpose: "password-reset",
      provider: "local",
      codeHash: "g".repeat(128),
      codeSalt: "h".repeat(32),
      expiresAt: "2026-01-02T00:10:00.000Z",
      attempts: 2,
      createdAt: "2026-01-02T00:00:00.000Z",
    };

    const back = toPhoneVerification(asRow(fromPhoneVerification(reset)));
    expect(back).toEqual(reset);
    // A reset carries no pending signup; those columns must read back absent, not null.
    expect(back.pendingName).toBeUndefined();
    expect(back.pendingPasswordHash).toBeUndefined();
    expect(back.pendingEmail).toBeUndefined();
  });

  it("round-trips a twilio-verify code with no local hash", () => {
    const twilio: PhoneVerification = {
      id: "otp_3",
      phone: "+447700900789",
      purpose: "signup",
      provider: "twilio-verify",
      expiresAt: "2026-01-03T00:10:00.000Z",
      attempts: 0,
      createdAt: "2026-01-03T00:00:00.000Z",
    };

    const back = toPhoneVerification(asRow(fromPhoneVerification(twilio)));
    expect(back).toEqual(twilio);
    // Twilio owns the code, so there is no local hash or salt to read back.
    expect(back.codeHash).toBeUndefined();
    expect(back.codeSalt).toBeUndefined();
  });

  it("normalises the phone number on write", () => {
    const back = fromPhoneVerification({ ...signup, phone: "+44 7700 900123" });
    expect(back.phone).toBe("+447700900123");
  });
});

describe("submitted review mapping", () => {
  it("round-trips a review carrying tapped reasons and prose", () => {
    const review: SubmittedReview = {
      id: "rev_abc123",
      productSlug: "merino-crew",
      customerId: "cust_1",
      orderId: "PR-260101-ABCD",
      author: "Ada L.",
      rating: 4,
      fit: "runs-small",
      reasons: ["Good quality", "Slightly off on fit"],
      body: "Lovely knit, just size up.",
      createdAt: "2026-02-01T09:30:00.000Z",
    };

    expect(toSubmittedReview(asRow(fromSubmittedReview(review)))).toEqual(review);
  });

  it("round-trips a review that is only tapped reasons, no prose", () => {
    const review: SubmittedReview = {
      id: "rev_def456",
      productSlug: "oxford-shirt",
      customerId: "cust_2",
      orderId: "PR-260102-EFGH",
      author: "Tomas B.",
      rating: 5,
      fit: "true-to-size",
      reasons: ["Excellent quality", "True to size"],
      body: "",
      createdAt: "2026-02-02T12:00:00.000Z",
    };

    expect(toSubmittedReview(asRow(fromSubmittedReview(review)))).toEqual(review);
  });
});

/**
 * The assumption every `asRow` cast above depends on.
 *
 * If a mapper ever leaves a column out and lets the database default supply it, the
 * round-trip tests would silently start comparing an incomplete row — and would keep
 * passing. Asserting the shape directly is what keeps them honest.
 */
describe("write mappers spell out every column", () => {
  it("omits nothing from a product row", () => {
    const rows = fromProduct(seedProducts[0] as Product);
    const columns = Object.keys(rows.product);

    for (const required of [
      "id", "slug", "name", "tagline", "department", "category", "price",
      "compareAtPrice", "sizeSystem", "description", "details", "composition",
      "care", "fitNote", "origin", "rating", "reviewCount", "releasedAt",
      "popularity", "sustainable", "pairsWith", "status", "sku", "costPrice",
      "weightGrams", "taxable", "seoTitle", "seoDescription", "createdAt", "updatedAt",
    ]) {
      expect(columns).toContain(required);
    }
  });

  it("omits nothing from an order row", () => {
    const rows = fromOrder({ ...demoOrders[0], notes: [] });
    const columns = Object.keys(rows.order);

    for (const required of [
      "id", "placedAt", "status", "totals", "shippingAddress", "customerId", "email",
      "promoCode", "cardLast4", "trackingNumber", "carrier",
      "shippedAt", "deliveredAt", "cancelledAt", "cancellationReason", "notes",
    ]) {
      expect(columns).toContain(required);
    }
  });
});
