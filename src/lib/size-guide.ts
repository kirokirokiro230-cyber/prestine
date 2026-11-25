import type { SizeSystem } from "./types";

/**
 * Size charts, and how a measurement is shown in inches or centimetres.
 *
 * ## Garment measurements
 *
 * The charts give measurements of the GARMENT, not of the body: how wide a size M tee is
 * across the chest, not what chest it is meant to fit. That is how a shopper can compare it
 * with something they already own, which is the most reliable way to choose, and it is what
 * the "How to measure" diagrams show.
 *
 * ## One source, two units
 *
 * Every figure is stored once, in inches. Centimetres are worked out from it when shown, so
 * the two columns cannot disagree and a correction is made in one place. Rounded to one
 * decimal place in centimetres, which is how tailors quote them.
 */

export type MeasurementUnit = "inch" | "cm";

export interface SizeGuideColumn {
  /** Stable key, for the diagram and for tests. */
  key: string;
  /** Heading as shown, e.g. "Chest". */
  label: string;
}

export interface SizeGuideRow {
  /** The size as labelled on the product, e.g. "M" or "32". */
  size: string;
  /** Inches, one per column, in the order of `columns`. */
  inches: readonly number[];
}

export interface SizeGuide {
  columns: readonly SizeGuideColumn[];
  rows: readonly SizeGuideRow[];
}

/**
 * T-shirts and other tops sold in alpha sizes.
 *
 * Chest is the full circumference of the garment under the sleeves; length is from the
 * shoulder at the collar to the hem; shoulder is seam to seam across the back; sleeve is
 * from the shoulder seam to the hem of the sleeve.
 */
const TOPS: SizeGuide = {
  columns: [
    { key: "chest", label: "Chest" },
    { key: "length", label: "Length" },
    { key: "shoulder", label: "Shoulder" },
    { key: "sleeve", label: "Sleeve" },
  ],
  rows: [
    { size: "S", inches: [38, 27, 16, 25] },
    { size: "M", inches: [40, 28, 16.5, 25.5] },
    { size: "L", inches: [42, 29, 17, 25.5] },
    { size: "XL", inches: [44, 30, 17.5, 26] },
    { size: "XXL", inches: [46, 31, 18, 26.5] },
  ],
};

/** Trousers and denim, sold by waist size. */
const BOTTOMS: SizeGuide = {
  columns: [
    { key: "waist", label: "Waist" },
    { key: "hip", label: "Hip" },
    { key: "inseam", label: "Inseam" },
    { key: "leg-opening", label: "Leg opening" },
  ],
  rows: [
    { size: "28", inches: [28, 35, 30, 6.5] },
    { size: "30", inches: [30, 37, 30, 6.75] },
    { size: "32", inches: [32, 39, 32, 7] },
    { size: "34", inches: [34, 41, 32, 7.25] },
    { size: "36", inches: [36, 43, 32, 7.5] },
    { size: "38", inches: [38, 45, 34, 7.75] },
  ],
};

export const sizeGuides = { tops: TOPS, bottoms: BOTTOMS } as const;

/**
 * Which chart a product's size system uses, or `null` when there is none to show.
 *
 * Shoes and one-size products have no chart here. Showing a shoe the chest measurements of
 * a T-shirt would be worse than showing nothing.
 */
export function guideForSystem(system: SizeSystem): SizeGuide | null {
  switch (system) {
    case "alpha":
      return TOPS;
    case "waist":
      return BOTTOMS;
    default:
      return null;
  }
}

const CM_PER_INCH = 2.54;

/** A measurement in inches as the number to show in the chosen unit. */
export function inUnit(inches: number, unit: MeasurementUnit): number {
  return unit === "cm" ? Math.round(inches * CM_PER_INCH * 10) / 10 : inches;
}

/**
 * A measurement as text.
 *
 * Inches drop a trailing ".0" (16, not 16.0) and keep real fractions (16.5, 6.75).
 * Centimetres always show one decimal (66.0), so a column of them lines up.
 */
export function formatMeasurement(inches: number, unit: MeasurementUnit): string {
  const value = inUnit(inches, unit);
  return unit === "cm" ? value.toFixed(1) : String(value);
}

export function unitLabel(unit: MeasurementUnit): string {
  return unit === "cm" ? "Centimeters" : "Inches";
}
