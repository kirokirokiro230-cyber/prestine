import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  cardBrand,
  cardCvc,
  cardExpiry,
  cardNumber,
  email,
  formatCardNumber,
  formatCvc,
  formatExpiry,
  phone,
  postalCode,
  required,
} from "@/lib/validation";

describe("required", () => {
  it("rejects empty and whitespace-only values", () => {
    assert.ok(required("", "Name"));
    assert.ok(required("   ", "Name"));
  });

  it("accepts any real content", () => {
    assert.equal(required("Alex", "Name"), null);
  });

  it("names the field in the message", () => {
    assert.match(required("", "First name") ?? "", /First name/);
  });
});

describe("email", () => {
  it("accepts ordinary addresses", () => {
    for (const value of ["a@b.co", "alex.morgan@example.com", "x+tag@sub.domain.org"]) {
      assert.equal(email(value), null, `${value} should be valid`);
    }
  });

  it("rejects malformed addresses", () => {
    for (const value of ["", "alex", "alex@", "@example.com", "alex@example", "a b@c.com"]) {
      assert.ok(email(value), `${value} should be invalid`);
    }
  });

  it("tolerates surrounding whitespace", () => {
    assert.equal(email("  alex@example.com  "), null);
  });
});

describe("phone", () => {
  it("is optional by default", () => {
    assert.equal(phone(""), null);
  });

  it("can be made mandatory", () => {
    assert.ok(phone("", false));
  });

  it("accepts international formats", () => {
    for (const value of ["+44 20 7946 0102", "(555) 010-9999", "07700 900123"]) {
      assert.equal(phone(value), null, `${value} should be valid`);
    }
  });

  it("rejects obvious nonsense", () => {
    assert.ok(phone("abcdefg"));
    assert.ok(phone("123"));
  });
});

describe("postal code", () => {
  it("requires a value of at least three characters", () => {
    assert.ok(postalCode(""));
    assert.ok(postalCode("E2"));
    assert.equal(postalCode("E2 7DP"), null);
    assert.equal(postalCode("94103"), null);
  });
});

describe("card number", () => {
  it("accepts numbers that pass the Luhn check", () => {
    for (const value of ["4242 4242 4242 4242", "5555555555554444", "378282246310005"]) {
      assert.equal(cardNumber(value), null, `${value} should be valid`);
    }
  });

  it("rejects numbers that fail the Luhn check", () => {
    assert.ok(cardNumber("4242 4242 4242 4241"));
  });

  it("rejects lengths outside 13–19 digits", () => {
    assert.ok(cardNumber("4242"));
    assert.ok(cardNumber("42424242424242424242424"));
  });

  it("requires a value", () => {
    assert.ok(cardNumber(""));
  });
});

describe("card expiry", () => {
  it("accepts MM/YY, and MMYY without the slash", () => {
    // The field is masked, so a bare four digits only arrives via paste. Being
    // forgiving there is deliberate.
    assert.equal(cardExpiry("12/28"), null);
    assert.equal(cardExpiry("1228"), null);
  });

  it("rejects anything that is not four digits", () => {
    assert.ok(cardExpiry("12"));
    assert.ok(cardExpiry("2026-12"));
    assert.ok(cardExpiry("December"));
  });

  it("rejects an impossible month", () => {
    assert.ok(cardExpiry("13/30"));
    assert.ok(cardExpiry("00/30"));
  });

  it("rejects a date in the past", () => {
    assert.ok(cardExpiry("01/20"));
  });

  it("accepts a future date", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 2);
    const mm = String(future.getMonth() + 1).padStart(2, "0");
    const yy = String(future.getFullYear()).slice(-2);
    assert.equal(cardExpiry(`${mm}/${yy}`), null);
  });
});

describe("card security code", () => {
  it("accepts three or four digits", () => {
    assert.equal(cardCvc("123"), null);
    assert.equal(cardCvc("1234"), null);
  });

  it("rejects anything else", () => {
    assert.ok(cardCvc(""));
    assert.ok(cardCvc("12"));
    assert.ok(cardCvc("12345"));
  });
});

describe("input masks", () => {
  it("groups the card number in fours without a trailing space", () => {
    assert.equal(formatCardNumber("4242424242424242"), "4242 4242 4242 4242");
    assert.equal(formatCardNumber("4242"), "4242");
    assert.equal(formatCardNumber("42424"), "4242 4");
  });

  it("strips non-digits and caps the card length", () => {
    assert.equal(formatCardNumber("4a2b4c2"), "4242");
    assert.ok(formatCardNumber("1".repeat(30)).replace(/\s/g, "").length <= 19);
  });

  it("inserts the expiry slash and caps at four digits", () => {
    assert.equal(formatExpiry("12"), "12");
    assert.equal(formatExpiry("1228"), "12/28");
    assert.equal(formatExpiry("122888"), "12/28");
  });

  it("keeps the security code numeric and short", () => {
    assert.equal(formatCvc("12a3"), "123");
    assert.equal(formatCvc("123456"), "1234");
  });
});

describe("card brand detection", () => {
  it("identifies the major networks", () => {
    assert.equal(cardBrand("4242424242424242"), "visa");
    assert.equal(cardBrand("5555555555554444"), "mastercard");
    assert.equal(cardBrand("378282246310005"), "amex");
    assert.equal(cardBrand("6011111111111117"), "discover");
  });

  it("returns null when it cannot tell", () => {
    assert.equal(cardBrand(""), null);
    assert.equal(cardBrand("9999"), null);
  });
});
