import { describe, expect, it } from "vitest";
import {
  formatMeasurement,
  guideForSystem,
  inUnit,
  sizeGuides,
  unitLabel,
} from "../size-guide";

/*
 * The centimetre figures below are the reference chart this guide was built from, typed in
 * by hand rather than computed, so a mistake in either the inch data or the conversion shows
 * up as a disagreement instead of agreeing with itself.
 */
const REFERENCE_CM: Record<string, string[]> = {
  S: ["96.5", "68.6", "40.6", "63.5"],
  M: ["101.6", "71.1", "41.9", "64.8"],
  L: ["106.7", "73.7", "43.2", "64.8"],
  XL: ["111.8", "76.2", "44.5", "66.0"],
  XXL: ["116.8", "78.7", "45.7", "67.3"],
};

const REFERENCE_INCHES: Record<string, string[]> = {
  S: ["38", "27", "16", "25"],
  M: ["40", "28", "16.5", "25.5"],
  L: ["42", "29", "17", "25.5"],
  XL: ["44", "30", "17.5", "26"],
  XXL: ["46", "31", "18", "26.5"],
};

describe("the tops chart", () => {
  it("has the columns, in order", () => {
    expect(sizeGuides.tops.columns.map((column) => column.label)).toEqual([
      "Chest",
      "Length",
      "Shoulder",
      "Sleeve",
    ]);
  });

  it("has S to XXL", () => {
    expect(sizeGuides.tops.rows.map((row) => row.size)).toEqual(["S", "M", "L", "XL", "XXL"]);
  });

  it.each(Object.entries(REFERENCE_INCHES))("shows size %s in inches as in the reference", (size, expected) => {
    const row = sizeGuides.tops.rows.find((entry) => entry.size === size)!;
    expect(row.inches.map((value) => formatMeasurement(value, "inch"))).toEqual(expected);
  });

  it.each(Object.entries(REFERENCE_CM))("shows size %s in centimetres as in the reference", (size, expected) => {
    const row = sizeGuides.tops.rows.find((entry) => entry.size === size)!;
    expect(row.inches.map((value) => formatMeasurement(value, "cm"))).toEqual(expected);
  });

  it("gets bigger with the size, in every measurement", () => {
    const { rows, columns } = sizeGuides.tops;

    for (let column = 0; column < columns.length; column += 1) {
      for (let row = 1; row < rows.length; row += 1) {
        expect(rows[row].inches[column]).toBeGreaterThanOrEqual(rows[row - 1].inches[column]);
      }
    }
  });
});

describe.each(Object.entries(sizeGuides))("the %s chart is well formed", (_name, guide) => {
  it("gives every row a value for every column", () => {
    for (const row of guide.rows) {
      expect(row.inches).toHaveLength(guide.columns.length);
    }
  });

  it("lists each size once", () => {
    const sizes = guide.rows.map((row) => row.size);
    expect(new Set(sizes).size).toBe(sizes.length);
  });

  it("has only positive, finite measurements", () => {
    for (const row of guide.rows) {
      for (const value of row.inches) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }
    }
  });
});

describe("formatMeasurement", () => {
  it("drops a trailing .0 in inches but keeps real fractions", () => {
    expect(formatMeasurement(16, "inch")).toBe("16");
    expect(formatMeasurement(16.5, "inch")).toBe("16.5");
    expect(formatMeasurement(6.75, "inch")).toBe("6.75");
  });

  it("always shows one decimal in centimetres, so a column lines up", () => {
    expect(formatMeasurement(26, "cm")).toBe("66.0");
    expect(formatMeasurement(1, "cm")).toBe("2.5");
  });

  it("converts at 2.54 and rounds to a tenth", () => {
    expect(inUnit(10, "cm")).toBe(25.4);
    expect(inUnit(10, "inch")).toBe(10);
  });
});

describe("which chart a product gets", () => {
  it("gives tops to alpha sizes and trousers to waist sizes", () => {
    expect(guideForSystem("alpha")).toBe(sizeGuides.tops);
    expect(guideForSystem("waist")).toBe(sizeGuides.bottoms);
  });

  it("gives nothing to shoes or one-size products, rather than a chart that does not apply", () => {
    expect(guideForSystem("shoe")).toBeNull();
    expect(guideForSystem("one-size")).toBeNull();
  });
});

describe("unitLabel", () => {
  it("names the unit as the guide says it", () => {
    expect(unitLabel("inch")).toBe("Inches");
    expect(unitLabel("cm")).toBe("Centimeters");
  });
});
