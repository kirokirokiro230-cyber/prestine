import { describe, expect, it } from "vitest";
import {
  canonicalEmail,
  firstOrderAmount,
  firstOrderUnavailableMessage,
  identityKeys,
  parseFirstOrderStatus,
  phoneKey,
} from "../first-order";

/** Shared with the SQL check, which runs the same inputs through `canonical_email()`. */
export const EMAIL_CASES: Array<[string, string]> = [
  ["Asha@Example.com", "asha@example.com"],
  ["  asha@example.com  ", "asha@example.com"],
  ["asha+shop@example.com", "asha@example.com"],
  ["asha+a+b@example.com", "asha@example.com"],
  ["a.s.h.a@example.com", "a.s.h.a@example.com"],
  ["a.s.h.a@gmail.com", "asha@gmail.com"],
  ["A.S.H.A+Sale@GMAIL.com", "asha@gmail.com"],
  ["asha@googlemail.com", "asha@gmail.com"],
  ["a.sha+x@googlemail.com", "asha@gmail.com"],
  ["asha@Sub.Example.com", "asha@sub.example.com"],
];

describe("canonicalEmail", () => {
  it.each(EMAIL_CASES)("reduces %j to %j", (input, expected) => {
    expect(canonicalEmail(input)).toBe(expected);
  });

  it("does not treat dots as ignorable outside Gmail", () => {
    expect(canonicalEmail("a.sha@example.com")).not.toBe(canonicalEmail("asha@example.com"));
  });

  it("makes the common ways of getting a second address the same address", () => {
    const base = canonicalEmail("priya.k@gmail.com");
    expect(canonicalEmail("priyak@gmail.com")).toBe(base);
    expect(canonicalEmail("priya.k+one@gmail.com")).toBe(base);
    expect(canonicalEmail("PRIYA.K+two@GoogleMail.com")).toBe(base);
  });

  it("leaves something that is not an email alone", () => {
    expect(canonicalEmail("not an email")).toBe("not an email");
    expect(canonicalEmail("")).toBe("");
  });
});

describe("phoneKey", () => {
  it.each([
    ["9876543210", "9876543210"],
    ["98765 43210", "9876543210"],
    ["+91 98765 43210", "9876543210"],
    ["+919876543210", "9876543210"],
    ["09876543210", "9876543210"],
    ["(987) 654-3210", "9876543210"],
  ])("reads %j as %j", (input, expected) => {
    expect(phoneKey(input)).toBe(expected);
  });

  it("gives nothing for a number too short to identify anyone", () => {
    expect(phoneKey("12345")).toBeNull();
    expect(phoneKey("")).toBeNull();
    expect(phoneKey(undefined)).toBeNull();
    expect(phoneKey(null)).toBeNull();
  });
});

describe("identityKeys", () => {
  it("covers the account, the email and both phone numbers", () => {
    expect(
      identityKeys({
        customerId: "cus_1",
        accountPhone: "+919876543210",
        email: "Asha.K+shop@gmail.com",
        shippingPhone: "98111 22233",
      }),
    ).toEqual(["c:cus_1", "e:ashak@gmail.com", "p:9811122233", "p:9876543210"]);
  });

  it("does not repeat a key when the two phone numbers are the same number", () => {
    const keys = identityKeys({
      customerId: "cus_1",
      accountPhone: "+919876543210",
      shippingPhone: "9876543210",
      email: "a@example.com",
    });

    expect(keys.filter((key) => key.startsWith("p:"))).toEqual(["p:9876543210"]);
  });

  it("leaves out what is missing or unusable rather than adding an empty key", () => {
    const keys = identityKeys({
      customerId: "cus_1",
      accountPhone: null,
      email: "not-an-email",
      shippingPhone: "123",
    });

    expect(keys).toEqual(["c:cus_1"]);
  });

  it("gives two accounts a key in common when they share an email or a number", () => {
    const first = identityKeys({
      customerId: "cus_1",
      accountPhone: "+919876543210",
      email: "asha@gmail.com",
    });
    const second = identityKeys({
      customerId: "cus_2",
      accountPhone: "+919000000000",
      email: "a.sha+again@gmail.com",
    });

    expect(first.filter((key) => second.includes(key))).toEqual(["e:asha@gmail.com"]);
  });

  it("gives two strangers nothing in common", () => {
    const first = identityKeys({ customerId: "cus_1", accountPhone: "+919876543210", email: "a@x.com" });
    const second = identityKeys({ customerId: "cus_2", accountPhone: "+919000000000", email: "b@x.com" });

    expect(first.filter((key) => second.includes(key))).toEqual([]);
  });
});

describe("firstOrderAmount", () => {
  it("takes the percentage off, rounded once to a whole paisa", () => {
    expect(firstOrderAmount(249_900, 10)).toBe(24_990);
    expect(firstOrderAmount(99_999, 10)).toBe(10_000);
    expect(firstOrderAmount(1_005, 10)).toBe(101);
  });

  it("is nothing for no percentage, an empty basket, or nonsense", () => {
    expect(firstOrderAmount(100_000, 0)).toBe(0);
    expect(firstOrderAmount(0, 10)).toBe(0);
    expect(firstOrderAmount(100_000, -5)).toBe(0);
    expect(firstOrderAmount(100_000, Number.NaN)).toBe(0);
  });

  it("never takes more than the whole subtotal", () => {
    expect(firstOrderAmount(50_000, 500)).toBe(50_000);
  });
});

describe("parseFirstOrderStatus", () => {
  it("reads what the database says", () => {
    expect(parseFirstOrderStatus("available")).toEqual({ kind: "available" });
    expect(parseFirstOrderStatus("claimed")).toEqual({ kind: "available" });
    expect(parseFirstOrderStatus("used")).toEqual({ kind: "used" });
    expect(parseFirstOrderStatus("returning")).toEqual({ kind: "returning" });
    expect(parseFirstOrderStatus("held:PR-261016-AB23")).toEqual({
      kind: "held",
      orderId: "PR-261016-AB23",
    });
  });

  it("treats a repeated claim as used", () => {
    expect(parseFirstOrderStatus("duplicate")).toEqual({ kind: "used" });
  });

  /*
   * The important property: anything that is not clearly "yes" is "no". A failure to ask,
   * an unexpected answer, a missing migration, must never become a discount.
   */
  it.each([null, undefined, 1, {}, "", "held:", "maybe", "AVAILABLE", "invalid"])(
    "reads %j as unavailable, never as eligible",
    (raw) => {
      expect(parseFirstOrderStatus(raw)).toEqual({ kind: "unavailable" });
    },
  );
});

describe("firstOrderUnavailableMessage", () => {
  it("names the unpaid order that is holding the discount", () => {
    const message = firstOrderUnavailableMessage({ kind: "held", orderId: "PR-1" });
    expect(message).toContain("PR-1");
    expect(message).toMatch(/cancel/i);
  });

  it("says when it has been used", () => {
    expect(firstOrderUnavailableMessage({ kind: "used" })).toMatch(/already been used/i);
  });

  it("has nothing to say when it is available or the check failed", () => {
    expect(firstOrderUnavailableMessage({ kind: "available" })).toBeNull();
    expect(firstOrderUnavailableMessage({ kind: "unavailable" })).toBeNull();
  });
});
