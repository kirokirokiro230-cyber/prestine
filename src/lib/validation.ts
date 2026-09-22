/**
 * Form validation.
 *
 * Deliberately small and dependency-free. Each validator returns an error string
 * or `null`, which composes into a `Record<field, string>` the forms render
 * inline. Client-side validation here is a UX affordance only — a real
 * implementation must re-validate on the server before taking payment.
 */

export type Errors<T extends string> = Partial<Record<T, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Loose on purpose: international formats vary far more than most forms allow. */
const PHONE = /^[+()\d][\d\s\-().]{6,20}$/;

export function required(value: string, label: string): string | null {
  return value.trim() ? null : `${label} is required.`;
}

export function email(value: string): string | null {
  if (!value.trim()) return "Email address is required.";
  return EMAIL.test(value.trim()) ? null : "Enter a valid email address.";
}

export function phone(value: string, optional = true): string | null {
  if (!value.trim()) return optional ? null : "Phone number is required.";
  return PHONE.test(value.trim()) ? null : "Enter a valid phone number.";
}

export function postalCode(value: string): string | null {
  if (!value.trim()) return "Postal code is required.";
  return value.trim().length >= 3 ? null : "Enter a valid postal code.";
}

/** Digits only, 13–19 long, passing the Luhn checksum. */
export function cardNumber(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "Card number is required.";
  if (digits.length < 13 || digits.length > 19) return "Card number looks too short.";

  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }

  return sum % 10 === 0 ? null : "That card number is not valid.";
}

/** MM/YY that is not in the past. */
export function cardExpiry(value: string): string | null {
  const match = value.match(/^(\d{2})\s*\/?\s*(\d{2})$/);
  if (!match) return "Use MM/YY.";

  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return "Month must be between 01 and 12.";

  const now = new Date();
  const expiry = new Date(year, month, 0, 23, 59, 59);
  return expiry >= now ? null : "That card has expired.";
}

export function cardCvc(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "Security code is required.";
  return digits.length >= 3 && digits.length <= 4 ? null : "Enter the 3 or 4 digit code.";
}

/* ------------------------------------------------------------------ */
/* Input masks                                                         */
/* ------------------------------------------------------------------ */

/** 4242424242424242 → 4242 4242 4242 4242 */
export function formatCardNumber(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 19);
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

/** 1226 → 12/26, and stops the user typing a 3-digit month. */
export function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export function formatCvc(value: string): string {
  return value.replace(/\D/g, "").slice(0, 4);
}

/** Detect the network from the leading digits, for the card icon. */
export function cardBrand(value: string): "visa" | "mastercard" | "amex" | "discover" | null {
  const digits = value.replace(/\D/g, "");
  if (/^4/.test(digits)) return "visa";
  if (/^(5[1-5]|2[2-7])/.test(digits)) return "mastercard";
  if (/^3[47]/.test(digits)) return "amex";
  if (/^6(?:011|5)/.test(digits)) return "discover";
  return null;
}

/**
 * Validate a whole delivery address in one call.
 *
 * The checkout form validates field by field so it can show errors inline; the
 * server needs a single yes/no before it writes an order, and it must not trust
 * that the form ran at all. Returns the first problem found, or `null`.
 */
export function address(value: unknown): string | null {
  if (!value || typeof value !== "object") return "A delivery address is required.";

  const candidate = value as Record<string, unknown>;
  const text = (field: string): string =>
    typeof candidate[field] === "string" ? (candidate[field] as string) : "";

  const checks: Array<[string, string]> = [
    ["name", "Full name"],
    ["line1", "Address"],
    ["city", "City"],
    ["region", "State or county"],
  ];

  for (const [field, label] of checks) {
    const error = required(text(field), label);
    if (error) return error;
    // Guard against a request padding a field to abuse storage or the order view.
    if (text(field).length > 120) return `${label} is too long.`;
  }

  /*
   * Required, not optional. Since the form dropped the postcode and country, the phone
   * number is the only way a courier can resolve a delivery problem — so an order
   * cannot be written without one.
   */
  const tel = phone(text("phone"), false);
  if (tel) return tel;

  return null;
}
