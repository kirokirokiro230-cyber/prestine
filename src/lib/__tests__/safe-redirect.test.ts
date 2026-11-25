import { describe, expect, it } from "vitest";
import { safeInternalPath } from "../safe-redirect";

const FALLBACK = "/account";

describe("safeInternalPath", () => {
  it("keeps an ordinary internal path, query and hash", () => {
    expect(safeInternalPath("/account/orders", FALLBACK)).toBe("/account/orders");
    expect(safeInternalPath("/shop?sort=price-asc&page=2", FALLBACK)).toBe(
      "/shop?sort=price-asc&page=2",
    );
    expect(safeInternalPath("/faq#returns", FALLBACK)).toBe("/faq#returns");
  });

  it("falls back for nothing at all", () => {
    expect(safeInternalPath(undefined, FALLBACK)).toBe(FALLBACK);
    expect(safeInternalPath(null, FALLBACK)).toBe(FALLBACK);
    expect(safeInternalPath("", FALLBACK)).toBe(FALLBACK);
  });

  it("refuses an absolute URL", () => {
    expect(safeInternalPath("https://evil.example/", FALLBACK)).toBe(FALLBACK);
    expect(safeInternalPath("javascript:alert(1)", FALLBACK)).toBe(FALLBACK);
  });

  it("refuses a protocol-relative URL", () => {
    expect(safeInternalPath("//evil.example", FALLBACK)).toBe(FALLBACK);
    expect(safeInternalPath("//evil.example/path", FALLBACK)).toBe(FALLBACK);
  });

  /*
   * The cases the old `startsWith("/") && !startsWith("//")` check let straight
   * through. Each reads as a same-site path to a prefix test and as an off-site
   * authority to a browser.
   */
  it("refuses the backslash and whitespace variants a prefix check misses", () => {
    expect(safeInternalPath("/\\evil.example", FALLBACK)).toBe(FALLBACK);
    expect(safeInternalPath("/\\/evil.example", FALLBACK)).toBe(FALLBACK);
    expect(safeInternalPath("/\t/evil.example", FALLBACK)).toBe(FALLBACK);
    expect(safeInternalPath("/\n/evil.example", FALLBACK)).toBe(FALLBACK);
    expect(safeInternalPath("/\r/evil.example", FALLBACK)).toBe(FALLBACK);
  });

  it("never returns something that resolves off-site, whatever the input", () => {
    const attempts = [
      "/\\evil.example",
      "//evil.example",
      "/%5Cevil.example",
      "/\u0000/evil.example",
      "///evil.example",
      "/.//evil.example",
      "https:evil.example",
      "\\\\evil.example",
    ];

    for (const attempt of attempts) {
      const out = safeInternalPath(attempt, FALLBACK);
      const resolved = new URL(out, "https://shop.example");
      expect(resolved.origin, `input ${JSON.stringify(attempt)} -> ${out}`).toBe(
        "https://shop.example",
      );
    }
  });
});
