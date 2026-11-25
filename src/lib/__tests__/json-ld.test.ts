import { describe, expect, it } from "vitest";
import { jsonLdScript } from "../json-ld";

/**
 * These assert the property that matters: whatever goes in, the output contains no
 * character an HTML parser can use to leave the script element. Testing for the
 * absence of `<` rather than for one particular escaped spelling, so the test still
 * means something if the implementation changes how it escapes.
 */
describe("jsonLdScript", () => {
  it("escapes a closing script tag hidden in shopper-written text", () => {
    const review = {
      reviewBody: "</script><script>alert(document.domain)</script>",
    };

    const out = jsonLdScript(review);

    expect(out).not.toContain("</script");
    expect(out).not.toContain("<");
    expect(out).toContain("\\u003c");
  });

  it("escapes every angle bracket and ampersand, wherever it appears", () => {
    const out = jsonLdScript({
      author: "<img src=x onerror=alert(1)>",
      title: "Jack & Jill",
      nested: { deep: ["<b>", "a > b"] },
    });

    expect(out).not.toMatch(/[<>&]/);
  });

  it("escapes an HTML comment opener, which also ends a script early", () => {
    expect(jsonLdScript({ note: "<!--" })).not.toContain("<!--");
  });

  it("escapes the JavaScript line terminators that are legal raw in JSON", () => {
    const out = jsonLdScript({ note: "a\u2028b\u2029c" });

    expect(out).toContain("\\u2028");
    expect(out).toContain("\\u2029");
    expect(out).not.toContain("\u2028");
    expect(out).not.toContain("\u2029");
  });

  /*
   * The escapes have to survive the round trip, or this would be protecting the page
   * by quietly corrupting the structured data that justifies emitting it at all.
   */
  it("still parses back to exactly the original data", () => {
    const data = {
      name: "Cashmere Crew <Grade A> & more",
      review: [{ reviewBody: "</script> 5/5", author: "A\u2028B" }],
      price: "86.00",
      nested: { n: null, t: true, arr: [1, 2, 3] },
    };

    expect(JSON.parse(jsonLdScript(data))).toEqual(data);
  });

  it("leaves ordinary data byte-identical to JSON.stringify", () => {
    const plain = { "@type": "Product", price: "86.00", count: 12 };

    expect(jsonLdScript(plain)).toBe(JSON.stringify(plain));
  });
});
