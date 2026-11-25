import { describe, expect, it } from "vitest";
import {
  MAX_LOOK_PRODUCTS,
  MAX_LOOK_TITLE,
  normaliseProductIds,
  normaliseShownOn,
  validateLook,
  type StyleLookInput,
} from "../style-looks";

const valid = (overrides: Partial<StyleLookInput> = {}): StyleLookInput => ({
  title: "Weekend layers",
  imageUrl: "https://cdn.example.com/looks/weekend.jpg",
  active: true,
  productIds: ["p-1", "p-2"],
  shownOn: ["p-1"],
  ...overrides,
});

describe("normaliseProductIds", () => {
  it("keeps the order they were ticked in", () => {
    expect(normaliseProductIds(["c", "a", "b"])).toEqual(["c", "a", "b"]);
  });

  it("drops duplicates, keeping the first occurrence", () => {
    expect(normaliseProductIds(["a", "b", "a", "c", "b"])).toEqual(["a", "b", "c"]);
  });

  it("drops blanks and trims", () => {
    expect(normaliseProductIds(["", "  ", " a ", "a"])).toEqual(["a"]);
  });

  /*
   * Capped AFTER de-duplication, so repeating one id cannot burn slots that other pieces
   * need. Otherwise a request padded with duplicates would silently truncate the look.
   */
  it("applies the cap after removing duplicates", () => {
    const many = Array.from({ length: MAX_LOOK_PRODUCTS + 5 }, (_, i) => `p-${i}`);
    const padded = ["p-0", "p-0", "p-0", ...many];

    const out = normaliseProductIds(padded);

    expect(out).toHaveLength(MAX_LOOK_PRODUCTS);
    expect(out[0]).toBe("p-0");
    expect(new Set(out).size).toBe(out.length);
  });

  it("returns nothing for nothing", () => {
    expect(normaliseProductIds([])).toEqual([]);
  });
});

describe("validateLook", () => {
  it("accepts a complete look", () => {
    expect(validateLook(valid())).toBeNull();
  });

  it("requires a title, and treats whitespace as empty", () => {
    expect(validateLook(valid({ title: "" }))).toMatch(/title/i);
    expect(validateLook(valid({ title: "   " }))).toMatch(/title/i);
  });

  it("limits the title length", () => {
    expect(validateLook(valid({ title: "x".repeat(MAX_LOOK_TITLE) }))).toBeNull();
    expect(validateLook(valid({ title: "x".repeat(MAX_LOOK_TITLE + 1) }))).toMatch(/title/i);
  });

  it("requires a photograph", () => {
    expect(validateLook(valid({ imageUrl: "" }))).toMatch(/photograph/i);
    expect(validateLook(valid({ imageUrl: "   " }))).toMatch(/photograph/i);
  });

  /*
   * The image ends up in an `<img src>` on a public page, so the scheme is vetted here and
   * not only in the form. A server action can be called without the form.
   */
  it.each([
    "javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "http://cdn.example.com/insecure.jpg",
    "/admin/staff",
    "//evil.example/x.jpg",
    "ftp://example.com/x.jpg",
  ])("refuses the image %s", (imageUrl) => {
    expect(validateLook(valid({ imageUrl }))).toMatch(/https/i);
  });

  it("requires at least one product", () => {
    expect(validateLook(valid({ productIds: [] }))).toMatch(/at least one product/i);
  });

  it("allows exactly the maximum and refuses one more", () => {
    const max = Array.from({ length: MAX_LOOK_PRODUCTS }, (_, i) => `p-${i}`);

    expect(validateLook(valid({ productIds: max, shownOn: [max[0]] }))).toBeNull();
    expect(
      validateLook(valid({ productIds: [...max, "p-extra"], shownOn: [max[0]] })),
    ).toMatch(/at most/i);
  });

  /*
   * A photograph shown on no product page is invisible. Saving it would look like success
   * and then never appear, so it is refused with a reason.
   */
  it("requires the photograph to appear on at least one product page", () => {
    expect(validateLook(valid({ shownOn: [] }))).toMatch(/at least one product page/i);
  });

  it("refuses to show a photograph on the page of a product that is not in it", () => {
    expect(validateLook(valid({ productIds: ["p-1"], shownOn: ["p-9"] }))).toMatch(
      /that is in it/i,
    );
  });

  it("lets one photograph list several products while appearing on only one", () => {
    expect(
      validateLook(valid({ productIds: ["p-1", "p-2", "p-3"], shownOn: ["p-2"] })),
    ).toBeNull();
  });

  it("lets a photograph appear on every product it lists, when asked to", () => {
    expect(
      validateLook(valid({ productIds: ["p-1", "p-2", "p-3"], shownOn: ["p-1", "p-2", "p-3"] })),
    ).toBeNull();
  });
});

describe("normaliseShownOn", () => {
  it("keeps only products that are in the photograph, in the photograph's order", () => {
    expect(normaliseShownOn(["a", "b", "c"], ["c", "a"])).toEqual(["a", "c"]);
  });

  /*
   * The tick box and the product list are separate form fields, so unticking a product can
   * leave its "show on page" value behind. The leftover must not survive.
   */
  it("drops a page for a product that has since been removed from the photograph", () => {
    expect(normaliseShownOn(["a", "b"], ["a", "removed"])).toEqual(["a"]);
  });

  it("removes duplicates, blanks and padding", () => {
    expect(normaliseShownOn(["a", "b"], ["b", "b", "", "  ", "b"])).toEqual(["b"]);
  });

  it("returns nothing when nothing is shown", () => {
    expect(normaliseShownOn(["a", "b"], [])).toEqual([]);
  });
});
