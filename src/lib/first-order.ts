/**
 * The first-order discount: who counts as the same person, and what the database said.
 *
 * Pure, so the rules that decide whether two orders are "the same customer" can be tested
 * without a database. The enforcement itself is in the database
 * (`supabase/migrations/00000000000021_first_order_discount.sql`), under a lock; this file
 * builds what it matches on and reads what it answers.
 */

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

/**
 * An email reduced to the address it really is.
 *
 * `+tag` is dropped everywhere, because it is a way of making many addresses that all
 * arrive in one inbox. Dots are dropped for Gmail only, where `a.b@gmail.com` and
 * `ab@gmail.com` are the same mailbox; elsewhere a dot can be significant.
 *
 * Must agree with `canonical_email()` in migration 21. The SQL one matches the emails on
 * ORDERS ALREADY PLACED against the keys built here, so the two have to produce the same
 * string for the same input; the tests exercise both on the same cases.
 */
export function canonicalEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  const at = email.indexOf("@");
  if (at < 1) return email;

  const local = email.slice(0, at).split("+")[0];
  const domain = email.slice(at + 1);

  if (domain === "gmail.com" || domain === "googlemail.com") {
    return `${local.replace(/\./g, "")}@gmail.com`;
  }

  return `${local}@${domain}`;
}

/**
 * The last ten digits of a phone number, which is what identifies a mobile in India
 * whether it was typed as `98765 43210`, `09876543210` or `+91 98765 43210`.
 *
 * `null` when there are fewer than ten digits: a short number identifies nobody, and using
 * it as a key could make two strangers "the same person".
 */
export function phoneKey(raw: string | undefined | null): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

export interface IdentityInput {
  customerId: string;
  /** The verified number the account signed up with. */
  accountPhone?: string | null;
  /** What was typed at checkout. Not verified. */
  email?: string | null;
  /** The delivery contact number. Not verified. */
  shippingPhone?: string | null;
}

/**
 * Everything that says "this is the same customer", as the strings the database matches.
 *
 * Any one of them matching an earlier claim or order is enough: a second account on the
 * same email or number is the same person for this purpose. De-duplicated and sorted, so
 * the result is stable (the database locks them in order).
 */
export function identityKeys(input: IdentityInput): string[] {
  const keys = new Set<string>();

  if (input.customerId) keys.add(`c:${input.customerId}`);

  const accountPhone = phoneKey(input.accountPhone);
  if (accountPhone) keys.add(`p:${accountPhone}`);

  const shippingPhone = phoneKey(input.shippingPhone);
  if (shippingPhone) keys.add(`p:${shippingPhone}`);

  const email = input.email ? canonicalEmail(input.email) : "";
  if (email.includes("@")) keys.add(`e:${email}`);

  return [...keys].sort();
}

/* ------------------------------------------------------------------ */
/* The amount                                                          */
/* ------------------------------------------------------------------ */

/**
 * What the discount takes off, in minor units. Rounded once, here, like every other
 * discount, so the lines on the order always add up to its total.
 */
export function firstOrderAmount(subtotal: number, percent: number): number {
  if (!Number.isFinite(percent) || percent <= 0 || subtotal <= 0) return 0;
  return Math.round((subtotal * Math.min(percent, 100)) / 100);
}

/* ------------------------------------------------------------------ */
/* What the database said                                              */
/* ------------------------------------------------------------------ */

export type FirstOrderStatus =
  /** Eligible. */
  | { kind: "available" }
  /** Already claimed, by this customer or someone sharing an identity with them. */
  | { kind: "used" }
  /** Has ordered before, so this is not a first order. */
  | { kind: "returning" }
  /** Claimed on an order that has not been paid yet; that order is `orderId`. */
  | { kind: "held"; orderId: string }
  /**
   * The check could not be made (the database call failed, or migration 21 has not been
   * run). Treated as "no discount", never as "free discount": a failure must not become
   * a way to get it twice.
   */
  | { kind: "unavailable" };

export function parseFirstOrderStatus(raw: unknown): FirstOrderStatus {
  if (typeof raw !== "string") return { kind: "unavailable" };

  if (raw === "available" || raw === "claimed") return { kind: "available" };
  if (raw === "used" || raw === "duplicate") return { kind: "used" };
  if (raw === "returning") return { kind: "returning" };

  if (raw.startsWith("held:") && raw.length > 5) {
    return { kind: "held", orderId: raw.slice(5) };
  }

  return { kind: "unavailable" };
}

/**
 * Why a customer is not getting the discount, in words for the customer.
 * `null` for the states that need no explanation (not offered, or simply not eligible).
 */
export function firstOrderUnavailableMessage(status: FirstOrderStatus): string | null {
  switch (status.kind) {
    case "held":
      return `Your first-order discount is on order ${status.orderId}, which has not been paid yet. Finish paying for it, or cancel it from your account to use the discount on a new order.`;
    case "used":
      return "The first-order discount has already been used.";
    case "returning":
      return "The first-order discount is for a customer’s first order.";
    default:
      return null;
  }
}
