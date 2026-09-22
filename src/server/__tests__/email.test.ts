import assert from "node:assert/strict";
import { describe, expect, it } from "vitest";
import type { EmailTemplate, Order, StoreSettings } from "@/lib/types";
import { escapeHtml, renderCustomEmail, renderOrderEmail } from "@/server/email/templates";

/**
 * Email rendering.
 *
 * Two things here are worth a test and the rest is layout. The first is escaping: a
 * customer types their own name at checkout and it comes straight back out in their
 * confirmation, so this is a genuine injection path into a document we send on their
 * behalf. The second is token substitution, because a mistake there is silent — the email
 * still sends, just with a hole in the middle of a sentence or, worse, someone else's data.
 *
 * `renderOrderEmail` is pure, so all of this runs without a store or a network.
 */

const settings: StoreSettings = {
  name: "Prestine",
  legalName: "Prestine Ltd",
  tagline: "Made to outlast",
  description: "A description.",
  url: "https://shop.example.com",
  email: "hello@example.com",
  phone: "+44 20 0000 0000",
  address: "1 Road, London",
  currency: "GBP",
  locale: "en-GB",
  freeShippingThreshold: 20000,
  standardShippingRate: 900,
  taxRate: 0.2,
  returnWindowDays: 30,
  deliveryDaysMin: 3,
  deliveryDaysMax: 5,
  reviewRequestDelayDays: 5,
  social: { instagram: "", pinterest: "", youtube: "" },
  announcements: [],
  marqueeItems: [],
  homeNewArrivalsCount: 4,
  servicePromises: [],
  shippingReturnsCopy: [],
  maintenanceMode: false,
};

function orderWith(overrides: Partial<Order> = {}): Order {
  return {
    id: "PR-260830-ABCD",
    placedAt: "2026-08-30T10:00:00.000Z",
    status: "processing",
    email: "buyer@example.com",
    lines: [
      {
        slug: "merino-crew",
        name: "Merino Crew",
        colorName: "Oat",
        colorHex: "#ddd",
        size: "M",
        quantity: 2,
        unitPrice: 12000,
        category: "knitwear",
      },
    ],
    totals: { subtotal: 24000, discount: 0, shipping: 0, tax: 4800, total: 28800 },
    shippingAddress: {
      name: "Asha Kapoor",
      line1: "12 Mill Lane",
      city: "Bengaluru",
      region: "Karnataka",
      phone: "9876543210",
    },
    ...overrides,
  };
}

function templateWith(overrides: Partial<EmailTemplate> = {}): EmailTemplate {
  return {
    key: "order-confirmation",
    enabled: true,
    subject: "Your order {{orderId}}",
    heading: "Thank you, {{customerFirstName}}.",
    body: "Total: {{orderTotal}}\n\n{{itemLines}}",
    ...overrides,
  };
}

describe("html escaping", () => {
  it("neutralises the characters that close a tag or an attribute", () => {
    assert.equal(
      escapeHtml(`<script>alert("x")</script>`),
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });

  it("escapes ampersands first, so an entity is not double-decoded", () => {
    // `&lt;` must not come back as `<`. Getting the order wrong here is the classic bug.
    assert.equal(escapeHtml("&lt;"), "&amp;lt;");
  });
});

describe("order email rendering", () => {
  it("substitutes tokens in the subject, heading and body", () => {
    const rendered = renderOrderEmail(templateWith(), orderWith(), settings);

    assert.equal(rendered.subject, "Your order PR-260830-ABCD");
    assert.match(rendered.html, /Thank you, Asha\./);
    // £288.00 — formatted from minor units through the store's locale and currency.
    assert.match(rendered.text, /288\.00/);
  });

  it("uses the whole name when it is a single word", () => {
    const order = orderWith({
      shippingAddress: { ...orderWith().shippingAddress, name: "Prince" },
    });
    const rendered = renderOrderEmail(
      templateWith({ heading: "Hello {{customerFirstName}}" }),
      order,
      settings,
    );

    assert.match(rendered.html, /Hello Prince/);
  });

  it("escapes customer-supplied values in the html part", () => {
    const order = orderWith({
      shippingAddress: {
        ...orderWith().shippingAddress,
        name: `<img src=x onerror="steal()">`,
      },
    });

    const rendered = renderOrderEmail(
      templateWith({ heading: "Hello {{customerName}}" }),
      order,
      settings,
    );

    // The literal tag must not survive into the markup.
    assert.ok(!rendered.html.includes("<img src=x"));
    assert.match(rendered.html, /&lt;img src=x/);
  });

  it("escapes product names in the item table", () => {
    const order = orderWith({
      lines: [{ ...orderWith().lines[0], name: "<b>Bold</b> Coat" }],
    });

    const rendered = renderOrderEmail(templateWith(), order, settings);

    assert.ok(!rendered.html.includes("<b>Bold</b>"));
    assert.match(rendered.html, /&lt;b&gt;Bold/);
  });

  it("leaves the plain-text part unescaped, since it is not markup", () => {
    const order = orderWith({
      shippingAddress: { ...orderWith().shippingAddress, name: "Ben & Jo" },
    });

    const rendered = renderOrderEmail(
      templateWith({ heading: "Hello {{customerName}}" }),
      order,
      settings,
    );

    // Escaping here would show a reader the literal characters `&amp;`.
    assert.match(rendered.text, /Ben & Jo/);
  });

  it("keeps an unrecognised token verbatim rather than blanking it", () => {
    const rendered = renderOrderEmail(
      templateWith({ subject: "Order {{ordrId}}" }),
      orderWith(),
      settings,
    );

    /*
     * A visible typo is recoverable; a silently empty substitution ships an email reading
     * "Order " and nobody finds out until a customer asks which order.
     */
    assert.equal(rendered.subject, "Order {{ordrId}}");
  });

  it("drops a paragraph whose only content was an empty token", () => {
    const rendered = renderOrderEmail(
      templateWith({ body: "First.\n\n{{trackingBlock}}\n\nLast." }),
      // No tracking number, so the token resolves to nothing.
      orderWith(),
      settings,
    );

    assert.match(rendered.text, /^First\.\n\nLast\.$/m);
  });

  it("renders tracking when there is a number", () => {
    const rendered = renderOrderEmail(
      templateWith({ body: "{{trackingBlock}}" }),
      orderWith({ carrier: "Delhivery", trackingNumber: "AWB123" }),
      settings,
    );

    assert.match(rendered.text, /Delhivery tracking: AWB123/);
  });

  it("does not wrap the item table in a paragraph", () => {
    const rendered = renderOrderEmail(templateWith(), orderWith(), settings);

    // `<p><table>` is invalid, and Outlook drops the content rather than tolerating it.
    assert.ok(!/<p[^>]*>\s*<table/.test(rendered.html));
  });

  it("separates the heading from the body by exactly one blank line", () => {
    const rendered = renderOrderEmail(
      templateWith({ heading: "Heading.", body: "First.\n\nSecond." }),
      orderWith(),
      settings,
    );

    // Joining a `["Heading.", "", ...blocks]` array with `\n\n` produced three blank
    // lines, which reads as a broken template rather than a paragraph break.
    assert.equal(rendered.text, "Heading.\n\nFirst.\n\nSecond.");
  });

  it("does not lead with blank lines when a template has no heading", () => {
    const rendered = renderOrderEmail(
      templateWith({ heading: "", body: "Only this." }),
      orderWith(),
      settings,
    );

    assert.equal(rendered.text, "Only this.");
  });

  it("always produces both parts", () => {
    const rendered = renderOrderEmail(templateWith(), orderWith(), settings);

    // A multipart message with no text alternative is a strong spam signal.
    assert.ok(rendered.html.length > 0);
    assert.ok(rendered.text.length > 0);
    assert.match(rendered.html, /^<!DOCTYPE html>/);
  });

  it("builds an absolute order link from the configured public url", () => {
    const rendered = renderOrderEmail(
      templateWith({ body: "{{orderUrl}}" }),
      orderWith(),
      settings,
    );

    assert.match(rendered.text, /https:\/\/shop\.example\.com\/account\/orders\?order=PR-260830-ABCD/);
  });

  it("writes the address over several lines, skipping the parts it does not have", () => {
    const rendered = renderOrderEmail(
      templateWith({ body: "{{shippingAddress}}" }),
      orderWith(),
      settings,
    );

    // No country and no postcode on this order; neither should leave a blank line.
    assert.match(rendered.text, /Asha Kapoor\n12 Mill Lane\nBengaluru\nKarnataka/);
  });
});

describe("custom email rendering", () => {
  it("does not substitute tokens, since there is no order to resolve them against", () => {
    const rendered = renderCustomEmail({
      subject: "A question",
      heading: "Hello",
      body: "About {{orderId}}.",
      settings,
    });

    assert.match(rendered.text, /About \{\{orderId\}\}\./);
  });

  it("escapes the body and falls back to the subject for the heading", () => {
    const rendered = renderCustomEmail({
      subject: "Heads up",
      heading: "",
      body: "<script>x</script>",
      settings,
    });

    assert.ok(!rendered.html.includes("<script>x</script>"));
    expect(rendered.html).toContain("Heads up");
  });
});
