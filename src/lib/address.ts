import type { Address } from "./types";

/**
 * Comparing and de-duplicating saved addresses.
 *
 * ## Why a fingerprint rather than a field-by-field test
 *
 * Checkout used to decide "have I seen this address before?" by comparing line 1
 * and city, lower-cased. That is wrong in the direction that costs the shopper
 * something: two genuinely different addresses on the same street in the same
 * city — a different flat, a different pincode, a different recipient — hash to
 * the same pair, so the second one was silently never saved. Being too eager to
 * call something a duplicate loses data; being too shy merely clutters a list.
 *
 * So everything that makes a delivery distinct takes part, normalised once in
 * one place, and both the address book and checkout use the same function. Two
 * implementations of "is this the same address" would eventually disagree.
 */

/** Collapse whitespace, drop case, so formatting differences do not count. */
function normaliseText(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Last ten digits.
 *
 * `+91 90238 23153`, `09023823153` and `9023823153` are one phone number, and a
 * shopper who typed it differently the second time has not moved house.
 */
function normalisePhone(value: string | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * A stable key for an address.
 *
 * Deliberately includes `name` and `phone`: the same flat with a different
 * recipient is a different delivery, and the courier calls the number on the
 * parcel. Excludes `country`, which this shop does not vary, and the legacy
 * `firstName`/`lastName` split, which nothing writes any more.
 */
export function addressFingerprint(address: Address): string {
  return [
    normaliseText(address.name),
    normaliseText(address.line1),
    normaliseText(address.line2),
    normaliseText(address.city),
    normaliseText(address.region),
    normaliseText(address.postalCode),
    normalisePhone(address.phone),
  ].join("|");
}

export function sameAddress(a: Address, b: Address): boolean {
  return addressFingerprint(a) === addressFingerprint(b);
}

/**
 * Add an address to a list, or move the existing match to the front.
 *
 * Returns the list unchanged when the address is already first, so a shopper who
 * reuses their default at checkout does not cause a pointless write on every
 * order.
 *
 * Moving a reused address to the front rather than leaving it in place is what
 * makes the first entry mean "the one you actually use" — which is how the
 * address book already treats position zero, and how checkout picks a default.
 */
export function upsertAddress(list: Address[], address: Address): Address[] {
  const key = addressFingerprint(address);
  const index = list.findIndex((entry) => addressFingerprint(entry) === key);

  if (index === 0) return list;

  if (index > 0) {
    const next = [...list];
    const [existing] = next.splice(index, 1);
    /*
     * The incoming copy wins. It is the one just confirmed at checkout, so where
     * the two differ only in fields the fingerprint ignores, the fresher value is
     * the better one to keep.
     */
    return [{ ...existing, ...address }, ...next];
  }

  return [address, ...list];
}

/** One-line summary, for a picker where a full block of text would be noise. */
export function formatAddressLine(address: Address): string {
  return [
    address.line1,
    address.line2,
    address.city,
    address.region,
    address.postalCode,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
}

/**
 * Whether a saved address carries everything checkout now requires.
 *
 * The address book predates the pincode being mandatory, so entries saved
 * before then are missing one. Those can still be offered — they just cannot be
 * used without filling the gap, and saying so is better than prefilling a form
 * that then fails validation for a reason the shopper cannot see.
 */
export function isDeliverable(address: Address): boolean {
  return /^[1-9][0-9]{5}$/.test((address.postalCode ?? "").trim());
}
