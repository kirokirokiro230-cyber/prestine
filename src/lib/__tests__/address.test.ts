import { describe, expect, it } from "vitest";
import {
  addressFingerprint,
  formatAddressLine,
  isDeliverable,
  sameAddress,
  upsertAddress,
} from "../address";
import type { Address } from "../types";

function address(overrides: Partial<Address> = {}): Address {
  return {
    name: "Aliasgar Agharia",
    line1: "Mehdi Baugh, Kanodar",
    city: "Kanodar",
    region: "Gujarat",
    postalCode: "385520",
    phone: "9023823153",
    ...overrides,
  };
}

describe("sameAddress", () => {
  it("ignores case and surrounding whitespace", () => {
    expect(
      sameAddress(address(), address({ line1: "  MEHDI BAUGH, KANODAR  " })),
    ).toBe(true);
  });

  it("ignores repeated whitespace inside a field", () => {
    expect(sameAddress(address(), address({ line1: "Mehdi   Baugh,  Kanodar" }))).toBe(
      true,
    );
  });

  it("treats the same number written differently as one phone", () => {
    expect(sameAddress(address(), address({ phone: "+91 90238 23153" }))).toBe(true);
    expect(sameAddress(address(), address({ phone: "09023823153" }))).toBe(true);
  });

  /*
   * The bug this module exists to fix. The old check compared line 1 and city
   * only, so each of these counted as a duplicate of the first and was never
   * saved.
   */
  it("separates addresses that differ only by pincode", () => {
    expect(sameAddress(address(), address({ postalCode: "385001" }))).toBe(false);
  });

  it("separates addresses that differ only by recipient", () => {
    expect(sameAddress(address(), address({ name: "Someone Else" }))).toBe(false);
  });

  it("separates addresses that differ only by phone", () => {
    expect(sameAddress(address(), address({ phone: "9000000001" }))).toBe(false);
  });

  it("separates addresses that differ only by line 2", () => {
    expect(sameAddress(address(), address({ line2: "Flat 4" }))).toBe(false);
  });

  it("separates different states", () => {
    expect(sameAddress(address(), address({ region: "Maharashtra" }))).toBe(false);
  });

  it("is stable for the same input", () => {
    expect(addressFingerprint(address())).toBe(addressFingerprint(address()));
  });
});

describe("upsertAddress", () => {
  it("adds an address that is not there yet", () => {
    const list = upsertAddress([], address());
    expect(list).toHaveLength(1);
  });

  it("puts a new address first, so it becomes the default", () => {
    const existing = address({ name: "Old Entry" });
    const list = upsertAddress([existing], address());

    expect(list).toHaveLength(2);
    expect(list[0].name).toBe("Aliasgar Agharia");
  });

  /** The whole point: checking out twice to one address must not list it twice. */
  it("does not duplicate an address already saved", () => {
    const once = upsertAddress([], address());
    const twice = upsertAddress(once, address());
    const thrice = upsertAddress(twice, address({ line1: "  mehdi baugh, kanodar " }));

    expect(twice).toHaveLength(1);
    expect(thrice).toHaveLength(1);
  });

  it("returns the identical list when the address is already first", () => {
    const list = [address(), address({ name: "Other" })];
    // Reference equality: no write should be triggered for a no-op.
    expect(upsertAddress(list, address())).toBe(list);
  });

  it("moves a reused address to the front", () => {
    const list = [address({ name: "First" }), address({ name: "Second" })];
    const next = upsertAddress(list, address({ name: "Second" }));

    expect(next).toHaveLength(2);
    expect(next[0].name).toBe("Second");
    expect(next[1].name).toBe("First");
  });

  it("keeps the fresher copy of fields the fingerprint ignores", () => {
    const saved = address({ country: "India" });
    const next = upsertAddress([address({ name: "Other" }), saved], address());

    expect(next[0].country).toBe("India");
  });

  it("does not mutate the list it was given", () => {
    const list = [address({ name: "Other" })];
    upsertAddress(list, address());
    expect(list).toHaveLength(1);
  });
});

describe("isDeliverable", () => {
  it("accepts a six-digit pincode", () => {
    expect(isDeliverable(address())).toBe(true);
  });

  it("rejects an address saved before pincodes were collected", () => {
    expect(isDeliverable(address({ postalCode: undefined }))).toBe(false);
  });

  it("rejects a malformed pincode", () => {
    for (const bad of ["", "12345", "1234567", "abcdef", "012345"]) {
      expect(isDeliverable(address({ postalCode: bad }))).toBe(false);
    }
  });
});

describe("formatAddressLine", () => {
  it("joins the parts that exist", () => {
    expect(formatAddressLine(address())).toBe(
      "Mehdi Baugh, Kanodar, Kanodar, Gujarat, 385520",
    );
  });

  it("skips missing parts rather than leaving empty separators", () => {
    expect(formatAddressLine(address({ postalCode: undefined }))).toBe(
      "Mehdi Baugh, Kanodar, Kanodar, Gujarat",
    );
  });
});
