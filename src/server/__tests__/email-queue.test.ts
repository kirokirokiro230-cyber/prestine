import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { beforeAll, describe, it } from "vitest";
import type { Order } from "@/lib/types";
import {
  dueReviewRequests,
  listEmailTemplates,
  markReviewRequested,
  recordEmail,
  resetEmailTemplate,
  updateEmailTemplate,
} from "@/server/repositories/email";
import { createOrder } from "@/server/repositories/orders";
import { updateSettings } from "@/server/repositories/settings";

/**
 * The review-request queue and the template store.
 *
 * The queue is the only part of the email feature with state and time in it, which makes
 * it the only part that can go wrong quietly. The failure that matters is emailing the
 * same customer twice — so the guards against that are what is tested here, alongside the
 * exclusions that stop a legacy order from being asked to review a purchase from before
 * the feature existed.
 */

beforeAll(async () => {
  const path = ".test-store/email-queue.json";
  process.env.PRESTINE_STORE_PATH = path;
  rmSync(path, { force: true });

  // A known delay, so the fixtures below can be positioned either side of it.
  await updateSettings({ reviewRequestDelayDays: 5 });
});

const DAY = 86_400_000;

/** `days` ago, as an ISO string. */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY).toISOString();
}

function orderFixture(overrides: Partial<Order>): Order {
  return {
    id: `PR-TEST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    placedAt: daysAgo(20),
    status: "delivered",
    email: "buyer@example.com",
    lines: [
      {
        slug: "merino-crew",
        name: "Merino Crew",
        colorName: "Oat",
        colorHex: "#ddd",
        size: "M",
        quantity: 1,
        unitPrice: 12000,
        category: "knitwear",
      },
    ],
    totals: { subtotal: 12000, discount: 0, shipping: 0, tax: 0, total: 12000 },
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

describe("review request queue", () => {
  it("includes a delivered order once the delay has passed", async () => {
    const order = await createOrder(orderFixture({ deliveredAt: daysAgo(6) }));

    const due = await dueReviewRequests();
    assert.ok(due.some((entry) => entry.id === order.id));
  });

  it("excludes one that was delivered too recently", async () => {
    const order = await createOrder(orderFixture({ deliveredAt: daysAgo(2) }));

    const due = await dueReviewRequests();
    assert.ok(!due.some((entry) => entry.id === order.id));
  });

  it("excludes an order that has already been asked", async () => {
    const order = await createOrder(orderFixture({ deliveredAt: daysAgo(9) }));

    assert.ok((await dueReviewRequests()).some((entry) => entry.id === order.id));

    await markReviewRequested(order.id);

    /*
     * The guard that matters most. Without it every sweep would ask the same customer
     * again, which reads as a shop that is not paying attention.
     */
    assert.ok(!(await dueReviewRequests()).some((entry) => entry.id === order.id));
  });

  it("excludes orders that have not been delivered", async () => {
    for (const status of ["processing", "shipped", "cancelled"] as const) {
      const order = await createOrder(
        orderFixture({ status, deliveredAt: daysAgo(9) }),
      );
      const due = await dueReviewRequests();
      assert.ok(
        !due.some((entry) => entry.id === order.id),
        `${status} should not be due a review request`,
      );
    }
  });

  it("excludes a delivered order with no delivery timestamp", async () => {
    // A legacy record. Treating a missing timestamp as "due now" would email everyone
    // who ever bought anything, the first time the sweep ran.
    const order = await createOrder(
      orderFixture({ deliveredAt: undefined }),
    );

    assert.ok(!(await dueReviewRequests()).some((entry) => entry.id === order.id));
  });

  it("excludes an order with no email address", async () => {
    const order = await createOrder(
      orderFixture({ email: undefined, deliveredAt: daysAgo(9) }),
    );

    assert.ok(!(await dueReviewRequests()).some((entry) => entry.id === order.id));
  });

  it("respects a changed delay", async () => {
    const order = await createOrder(orderFixture({ deliveredAt: daysAgo(4) }));

    // Not due at five days.
    assert.ok(!(await dueReviewRequests()).some((entry) => entry.id === order.id));

    await updateSettings({ reviewRequestDelayDays: 3 });
    assert.ok((await dueReviewRequests()).some((entry) => entry.id === order.id));

    await updateSettings({ reviewRequestDelayDays: 5 });
  });

  it("treats a zero delay as due on delivery", async () => {
    await updateSettings({ reviewRequestDelayDays: 0 });

    const order = await createOrder(orderFixture({ deliveredAt: daysAgo(0) }));
    assert.ok((await dueReviewRequests()).some((entry) => entry.id === order.id));

    await updateSettings({ reviewRequestDelayDays: 5 });
  });
});

describe("email templates", () => {
  it("seeds one template per lifecycle event", async () => {
    const templates = await listEmailTemplates();

    assert.deepEqual(
      templates.map((template) => template.key),
      [
        "order-confirmation",
        "out-for-delivery",
        "delivered",
        "review-request",
        "order-cancelled",
      ],
    );
  });

  it("saves an edit and can restore the shipped wording", async () => {
    const before = await listEmailTemplates();
    const original = before.find((entry) => entry.key === "delivered");
    assert.ok(original);

    await updateEmailTemplate("delivered", {
      enabled: true,
      subject: "  Custom subject  ",
      heading: "Custom heading",
      body: "Custom body",
    });

    const edited = (await listEmailTemplates()).find((entry) => entry.key === "delivered");
    // Trimmed on write, so a stray space cannot end up in a subject line.
    assert.equal(edited?.subject, "Custom subject");

    await resetEmailTemplate("delivered");
    const restored = (await listEmailTemplates()).find((entry) => entry.key === "delivered");
    assert.equal(restored?.subject, original.subject);
  });

  it("keeps the on/off switch when restoring wording", async () => {
    await updateEmailTemplate("review-request", {
      enabled: false,
      subject: "Anything",
      heading: "",
      body: "",
    });

    await resetEmailTemplate("review-request");

    const template = (await listEmailTemplates()).find(
      (entry) => entry.key === "review-request",
    );
    /*
     * Restoring copy is a content operation. Silently switching an email back on that a
     * merchant deliberately disabled would start sending without anyone deciding to.
     */
    assert.equal(template?.enabled, false);

    await updateEmailTemplate("review-request", {
      enabled: true,
      subject: template!.subject,
      heading: template!.heading,
      body: template!.body,
    });
  });

  it("refuses a template with no subject", async () => {
    await assert.rejects(
      () =>
        updateEmailTemplate("delivered", {
          enabled: true,
          subject: "   ",
          heading: "",
          body: "",
        }),
      /subject line is required/i,
    );
  });
});

describe("email log", () => {
  it("records a send against its order", async () => {
    const record = await recordEmail({
      to: "buyer@example.com",
      subject: "Test",
      templateKey: "delivered",
      orderId: "PR-TEST-LOG",
      status: "logged",
    });

    assert.match(record.id, /^eml_/);
    assert.equal(record.status, "logged");
    assert.ok(record.at);
  });

  it("keeps a failure reason", async () => {
    const record = await recordEmail({
      to: "bad@example.com",
      subject: "Test",
      templateKey: null,
      status: "failed",
      error: "Provider returned 422",
    });

    assert.equal(record.error, "Provider returned 422");
    // Null, not undefined — an ad-hoc message genuinely has no template.
    assert.equal(record.templateKey, null);
  });
});
