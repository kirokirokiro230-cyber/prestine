/**
 * Physical packaging constants for outbound shipments.
 *
 * These numbers directly determine shipping cost, since Delhivery bills on the
 * chargeable weight derived from them. Keep them accurate, and re-check them
 * if the packaging changes.
 */

import {
  calculateVolumetricWeight,
  getChargeableWeight,
} from './utils/validator';

/** Dead weight of a single packed piece, in grams. */
export const PIECE_WEIGHT_GRAMS = 500;

/** Outer dimensions of a single packed piece, in centimetres. */
export const PIECE_DIMENSIONS_CM = {
  length: 30,
  width: 30,
  height: 5,
} as const;

export interface PackedShipment {
  weightGrams: number;
  dimensions: { length: number; width: number; height: number };
}

/**
 * Work out the packed weight and dimensions for `quantity` pieces.
 *
 * Pieces are flat-packed and stacked, so length and width stay fixed while
 * height grows with the piece count.
 */
export function packShipment(quantity: number): PackedShipment {
  const pieces = Math.max(1, Math.floor(quantity));

  return {
    weightGrams: pieces * PIECE_WEIGHT_GRAMS,
    dimensions: {
      length: PIECE_DIMENSIONS_CM.length,
      width: PIECE_DIMENSIONS_CM.width,
      height: pieces * PIECE_DIMENSIONS_CM.height,
    },
  };
}

/** Volumetric weight in grams for the given dimensions. */
export function volumetricWeightGrams(dimensions: {
  length: number;
  width: number;
  height: number;
}): number {
  return calculateVolumetricWeight(
    dimensions.length,
    dimensions.width,
    dimensions.height
  );
}

/**
 * The weight Delhivery is expected to bill at manifestation.
 *
 * An estimate for display and margin checks — the authoritative figure is
 * whatever Delhivery captures after pickup.
 */
export function chargeableWeightGrams(packed: PackedShipment): number {
  return getChargeableWeight(
    packed.weightGrams,
    packed.dimensions.length,
    packed.dimensions.width,
    packed.dimensions.height
  );
}
