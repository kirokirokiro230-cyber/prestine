import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  buildQueryString,
  countActiveFilters,
  parseSearchParams,
  toggleListValue,
} from "@/lib/search-params";

const params = (query: string) => new URLSearchParams(query);

describe("parseSearchParams", () => {
  it("defaults to featured, page one, no filters", () => {
    const parsed = parseSearchParams({});
    assert.equal(parsed.sort, "featured");
    assert.equal(parsed.page, 1);
    assert.equal(countActiveFilters(parsed.filters), 0);
  });

  it("reads comma-separated lists", () => {
    const parsed = parseSearchParams({ category: "denim,knitwear", size: "M,L" });
    assert.deepEqual(parsed.filters.categories, ["denim", "knitwear"]);
    assert.deepEqual(parsed.filters.sizes, ["M", "L"]);
  });

  it("accepts repeated parameters as arrays", () => {
    const parsed = parseSearchParams({ category: ["denim", "shirts"] });
    assert.deepEqual(parsed.filters.categories, ["denim", "shirts"]);
  });

  it("drops unknown categories instead of returning nothing", () => {
    const parsed = parseSearchParams({ category: "denim,not-a-category" });
    assert.deepEqual(parsed.filters.categories, ["denim"]);
  });

  it("drops an unknown sort rather than throwing", () => {
    assert.equal(parseSearchParams({ sort: "cheapest-ever" }).sort, "featured");
  });

  it("reads boolean flags only when set to 1", () => {
    assert.equal(parseSearchParams({ sale: "1" }).filters.onSale, true);
    assert.equal(parseSearchParams({ sale: "true" }).filters.onSale, false);
    assert.equal(parseSearchParams({}).filters.onSale, false);
  });

  it("coerces prices to numbers and ignores rubbish", () => {
    assert.equal(parseSearchParams({ minPrice: "10000" }).filters.minPrice, 10000);
    assert.equal(parseSearchParams({ minPrice: "cheap" }).filters.minPrice, undefined);
  });

  it("clamps the page to at least one", () => {
    assert.equal(parseSearchParams({ page: "0" }).page, 1);
    assert.equal(parseSearchParams({ page: "-4" }).page, 1);
    assert.equal(parseSearchParams({ page: "3" }).page, 3);
  });

  it("trims the search term and treats blank as absent", () => {
    assert.equal(parseSearchParams({ q: "  linen " }).filters.search, "linen");
    assert.equal(parseSearchParams({ q: "   " }).filters.search, undefined);
  });
});

describe("buildQueryString", () => {
  it("returns an empty string when nothing is set", () => {
    assert.equal(buildQueryString(params(""), {}), "");
  });

  it("serialises a list as one comma-separated parameter", () => {
    const result = buildQueryString(params(""), { category: ["denim", "shirts"] });
    assert.equal(result, "?category=denim%2Cshirts");
  });

  it("removes a parameter when its list becomes empty", () => {
    const result = buildQueryString(params("category=denim"), { category: [] });
    assert.equal(result, "");
  });

  it("omits the default sort to keep URLs clean", () => {
    assert.equal(buildQueryString(params("sort=newest"), { sort: "featured" }), "");
    assert.equal(buildQueryString(params(""), { sort: "newest" }), "?sort=newest");
  });

  it("drops page one rather than writing page=1", () => {
    assert.equal(buildQueryString(params("page=4"), { page: 1 }), "");
    assert.equal(buildQueryString(params(""), { page: 3 }), "?page=3");
  });

  it("resets pagination whenever a filter changes", () => {
    // Landing on page 4 of a freshly filtered set that has two pages is a bug.
    const result = buildQueryString(params("page=4"), { category: ["denim"] });
    assert.ok(!result.includes("page="));
    assert.ok(result.includes("category=denim"));
  });

  it("keeps pagination when only the page changes", () => {
    const result = buildQueryString(params("category=denim"), { page: 2 });
    assert.ok(result.includes("category=denim"));
    assert.ok(result.includes("page=2"));
  });

  it("preserves unrelated parameters", () => {
    const result = buildQueryString(params("q=linen&sort=newest"), { sale: true });
    assert.ok(result.includes("q=linen"));
    assert.ok(result.includes("sort=newest"));
    assert.ok(result.includes("sale=1"));
  });

  it("clears a flag when set false", () => {
    assert.equal(buildQueryString(params("sale=1"), { sale: false }), "");
  });

  it("clears a price bound when passed null", () => {
    const result = buildQueryString(params("minPrice=100&maxPrice=200"), {
      minPrice: null,
      maxPrice: null,
    });
    assert.equal(result, "");
  });

  it("round-trips through parseSearchParams", () => {
    const query = buildQueryString(params(""), {
      category: ["denim"],
      size: ["32"],
      sale: true,
      sort: "price-asc",
    });

    const raw = Object.fromEntries(new URLSearchParams(query.slice(1)).entries());
    const parsed = parseSearchParams(raw);

    assert.deepEqual(parsed.filters.categories, ["denim"]);
    assert.deepEqual(parsed.filters.sizes, ["32"]);
    assert.equal(parsed.filters.onSale, true);
    assert.equal(parsed.sort, "price-asc");
  });
});

describe("toggleListValue", () => {
  it("adds a missing value and removes a present one", () => {
    assert.deepEqual(toggleListValue(["a"], "b"), ["a", "b"]);
    assert.deepEqual(toggleListValue(["a", "b"], "a"), ["b"]);
  });

  it("does not mutate the input", () => {
    const original = ["a"];
    toggleListValue(original, "b");
    assert.deepEqual(original, ["a"]);
  });
});

describe("countActiveFilters", () => {
  it("counts each selected value and each flag once", () => {
    const { filters } = parseSearchParams({
      category: "denim,shirts",
      size: "M",
      sale: "1",
      sustainable: "1",
      minPrice: "10000",
    });
    // 2 categories + 1 size + 2 flags + 1 price band
    assert.equal(countActiveFilters(filters), 6);
  });
});
