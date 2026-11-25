/**
 * Input validation utilities for Delhivery API
 */

/**
 * Validate Indian pincode format
 */
export function isValidPincode(pincode: string): boolean {
  return /^\d{6}$/.test(pincode);
}

/**
 * Validate phone number (10 digits, Indian format)
 * Accepts formats: 9876543210, +919876543210, 919876543210
 */
export function isValidPhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '');
  // Remove country code if present
  const withoutCountryCode = cleaned.replace(/^91/, '');
  return /^[6-9]\d{9}$/.test(withoutCountryCode);
}

/**
 * Validate HSN code format
 */
export function isValidHsnCode(hsn: string): boolean {
  return /^\d{4,8}$/.test(hsn);
}

/**
 * Validate GST number format
 */
export function isValidGstNumber(gst: string): boolean {
  return /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/.test(gst);
}

/**
 * Sanitize string for Delhivery API (remove special characters they don't accept)
 * Special characters not allowed: &, #, %, ;, \
 */
export function sanitizeForDelhivery(text: string): string {
  return text
    .replace(/[&#%;\\]/g, ' ')
    .replace(/'/g, "\\\\'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Volumetric weight in grams.
 *
 * Delhivery's formula is (Length × Width × Height) / 5000 with centimetre
 * inputs, which yields *kilograms* — so the result is scaled to grams to match
 * every other weight in this module.
 */
export function calculateVolumetricWeight(
  lengthCm: number,
  widthCm: number,
  heightCm: number
): number {
  return Math.ceil(((lengthCm * widthCm * heightCm) / 5000) * 1000);
}

/**
 * Chargeable weight in grams — what Delhivery actually bills.
 *
 * Below 1 kg the dead weight is used as-is; only above that does volumetric
 * weight come into play.
 * https://help.delhivery.com/docs/calculating-volumetric-weight
 */
export function getChargeableWeight(
  deadWeightGrams: number,
  lengthCm?: number,
  widthCm?: number,
  heightCm?: number
): number {
  if (deadWeightGrams <= 1000) {
    return deadWeightGrams;
  }

  if (!lengthCm || !widthCm || !heightCm) {
    return deadWeightGrams;
  }

  const volumetricWeight = calculateVolumetricWeight(lengthCm, widthCm, heightCm);
  return Math.max(deadWeightGrams, volumetricWeight);
}

/**
 * Validate waybill format (alphanumeric, typically 10-15 characters)
 */
export function isValidWaybill(waybill: string): boolean {
  return /^[A-Z0-9]{10,20}$/.test(waybill);
}

/**
 * Format phone number for Delhivery (10 digits without prefix)
 */
export function formatPhoneForDelhivery(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  // If starts with country code +91, remove it
  if (cleaned.startsWith('91') && cleaned.length === 12) {
    return cleaned.substring(2);
  }
  return cleaned.substring(0, 10);
}

/**
 * Validate order ID format (no special characters that could cause API issues)
 */
export function isValidOrderId(orderId: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(orderId) && orderId.length <= 50;
}

/**
 * Truncate string to max length (for fields with character limits)
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}
