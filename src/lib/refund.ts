/**
 * Refunds on prepaid orders: the rules, with no database and no network.
 *
 * Kept pure so the parts that decide how much money may leave the business (how an amount
 * is parsed, how much is still refundable, which statuses count as already spent) can be
 * tested directly. The server code that talks to Cashfree and to the database sits on top.
 *
 * ## Money
 *
 * Everything here is integer minor units (paise), like the rest of the codebase. Cashfree
 * speaks decimal rupees; that conversion happens in `src/server/cashfree.ts` and nowhere
 * else, so no float is ever used to decide whether a refund is allowed.
 */

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

/**
 * Where a refund is.
 *
 * - `requested`: recorded here, not yet confirmed by Cashfree. Money is reserved against
 *   the order so a second click cannot spend it again. Normally lasts milliseconds; it
 *   stays only if the call to Cashfree had an unknown outcome (a timeout).
 * - `pending`: Cashfree accepted it and is processing it with the customer's bank.
 * - `onhold`: Cashfree is holding it, usually for lack of balance. Still owed.
 * - `success`: the money reached the customer's bank.
 * - `failed`: Cashfree refused it, or it could not be completed. The money is free again.
 * - `cancelled`: Cashfree gave up after retrying. The money is free again.
 */
export type RefundStatus =
  | "requested"
  | "pending"
  | "onhold"
  | "success"
  | "failed"
  | "cancelled";

/**
 * Statuses that count as money already refunded (or on its way). A refund in any of
 * these reduces what can still be refunded; `failed` and `cancelled` do not, because the
 * customer never received that money.
 *
 * This list is mirrored in `reserve_order_refund` in migration 20. They must agree: the
 * database enforces the limit, this one explains it.
 */
const LIVE: readonly RefundStatus[] = ["requested", "pending", "onhold", "success"];

export function isLiveRefund(status: RefundStatus): boolean {
  return LIVE.includes(status);
}

/** A refund that will not change again, so there is nothing to check on. */
export function isSettledRefund(status: RefundStatus): boolean {
  return status === "success" || status === "failed" || status === "cancelled";
}

/**
 * Map Cashfree's `refund_status` onto ours.
 *
 * Anything unrecognised becomes `pending`, not `success`: a status this code has never
 * seen must not be read as "the money arrived". Pending is the cautious reading, and a
 * later check will correct it.
 */
export function normaliseRefundStatus(
  raw: unknown,
): Exclude<RefundStatus, "requested"> {
  switch (typeof raw === "string" ? raw.trim().toUpperCase() : "") {
    case "SUCCESS":
      return "success";
    case "FAILED":
      return "failed";
    case "CANCELLED":
    case "CANCELED":
      return "cancelled";
    case "ONHOLD":
    case "ON_HOLD":
      return "onhold";
    default:
      return "pending";
  }
}

export function refundStatusLabel(status: RefundStatus): string {
  switch (status) {
    case "requested":
      return "Not confirmed";
    case "pending":
      return "Processing";
    case "onhold":
      return "On hold";
    case "success":
      return "Refunded";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
  }
}

/* ------------------------------------------------------------------ */
/* How much is left                                                    */
/* ------------------------------------------------------------------ */

export interface RefundAmountLike {
  /** Minor units. */
  amount: number;
  status: RefundStatus;
}

/** Minor units already refunded or on their way. */
export function refundedTotal(refunds: readonly RefundAmountLike[]): number {
  return refunds.reduce((sum, entry) => (isLiveRefund(entry.status) ? sum + entry.amount : sum), 0);
}

/** Minor units that can still be refunded on an order that was paid `orderTotal`. */
export function refundableRemaining(
  orderTotal: number,
  refunds: readonly RefundAmountLike[],
): number {
  return Math.max(0, orderTotal - refundedTotal(refunds));
}

/* ------------------------------------------------------------------ */
/* What staff type                                                     */
/* ------------------------------------------------------------------ */

export type RefundAmountCheck = { ok: true; minor: number } | { ok: false; error: string };

/**
 * Parse an amount a person typed, in rupees, into paise.
 *
 * Strict: digits, an optional decimal point and at most two decimals. A third decimal is
 * rejected rather than rounded, because "refund 99.999" is a typo to be questioned and
 * not a figure to be quietly changed. Done on the string, not through `Number`, so no
 * float arithmetic is involved: `Number("1.15") * 100` is `114.99999999999999`.
 *
 * Commas, spaces and a leading rupee sign are tolerated, since "1,250.00" and "₹1250" are
 * how amounts are written here.
 */
export function parseRefundAmount(input: string): RefundAmountCheck {
  const cleaned = input.replace(/[\s,₹]/g, "");

  if (!cleaned) return { ok: false, error: "Enter the amount to refund." };

  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) {
    return { ok: false, error: "Enter an amount in rupees, with at most two decimal places." };
  }

  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const minor = whole * 100 + fraction;

  if (minor <= 0) return { ok: false, error: "The refund must be more than zero." };

  return { ok: true, minor };
}

/** Why the refund is being made. Recorded on the order, so it has to say something. */
export const MIN_REFUND_NOTE = 3;
export const MAX_REFUND_NOTE = 200;

export function refundNoteError(note: string): string | null {
  const trimmed = note.trim();
  if (trimmed.length < MIN_REFUND_NOTE) {
    return "Say why you are refunding, for the order record.";
  }
  if (trimmed.length > MAX_REFUND_NOTE) {
    return `Keep the reason under ${MAX_REFUND_NOTE} characters.`;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* The refund id                                                       */
/* ------------------------------------------------------------------ */

/**
 * Turn the form's one-time key into the id sent to Cashfree.
 *
 * The page puts a fresh UUID in the form each time it renders. Submitting the same form
 * twice (a double click, a retry after a slow response) therefore sends the same key and
 * so the same refund id, which the database and Cashfree both refuse to create twice.
 * That is what makes "press Refund" safe to press again.
 *
 * `rf_` plus 32 hex characters: alphanumeric with an underscore, 35 characters, inside
 * Cashfree's limit. Returns null for anything that is not a UUID, so a crafted request
 * cannot choose its own id.
 */
export function refundIdFromKey(key: string): string | null {
  const match = /^([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})$/i.exec(
    key.trim(),
  );
  if (!match) return null;
  return `rf_${match.slice(1).join("").toLowerCase()}`;
}
