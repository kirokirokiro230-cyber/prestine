import type { ReturnStatus } from "./delhivery/types";
import { normaliseUpiId, upiError } from "./upi";

/**
 * The customer-facing return request, and the states a return moves through.
 *
 * Pure, so the rules the form, the server action and the admin buttons all rely on are in
 * one place and can be tested without a database.
 */

/* ------------------------------------------------------------------ */
/* The request                                                         */
/* ------------------------------------------------------------------ */

/**
 * Why a customer is returning something.
 *
 * A fixed list rather than free text, because a fixed list can be counted: "forty returns
 * for size" is something to act on, forty differently worded sentences are not. The
 * server accepts only these values, so a crafted request cannot invent one. "Something
 * else" asks for words.
 */
export const RETURN_REASONS = [
  { value: "size", label: "Doesn’t fit, or wrong size" },
  { value: "not-as-described", label: "Not as described" },
  { value: "faulty", label: "Faulty or damaged" },
  { value: "wrong-item", label: "I received the wrong item" },
  { value: "changed-mind", label: "Changed my mind" },
  { value: "other", label: "Something else" },
] as const;

export type ReturnReasonValue = (typeof RETURN_REASONS)[number]["value"];

/** Longest free-text note accepted. */
export const MAX_RETURN_DETAILS = 500;

export interface ReturnRequestInput {
  reason: string;
  details: string;
  /**
   * Whether this return needs somewhere to send the refund. True for cash on delivery,
   * where the customer paid in cash and there is no original payment to refund to. False for
   * a prepaid order, which is refunded through Cashfree to whatever it was paid with, so a
   * UPI ID would only be a second, worse place to send the money.
   */
  requireUpi: boolean;
  upiId: string;
  upiConfirm: string;
}

export type ReturnRequestCheck =
  | {
      ok: true;
      /** The human label, which is what is stored and what staff read. */
      reasonLabel: string;
      details: string;
      /** Normalised: trimmed and lower-cased. `null` when none was asked for. */
      upiId: string | null;
    }
  | { ok: false; fieldErrors: Partial<Record<"reason" | "details" | "upiId" | "upiConfirm", string>> };

/**
 * Check a return request, returning every problem at once.
 *
 * All errors rather than the first, so the form can mark each field in one go instead of
 * making the customer fix and resubmit three times.
 *
 * The UPI ID is entered twice and compared AFTER normalising, so `Asha@OKAXIS` and
 * `asha@okaxis` count as the same entry. The second entry is the real safeguard: a typo in
 * a refund destination is not an error, it is money sent to someone else.
 */
export function validateReturnRequest(input: ReturnRequestInput): ReturnRequestCheck {
  const fieldErrors: Partial<
    Record<"reason" | "details" | "upiId" | "upiConfirm", string>
  > = {};

  const reason = RETURN_REASONS.find((entry) => entry.value === input.reason);
  if (!reason) fieldErrors.reason = "Choose why you are returning it.";

  const details = input.details.trim();
  if (details.length > MAX_RETURN_DETAILS) {
    fieldErrors.details = `Keep this under ${MAX_RETURN_DETAILS} characters.`;
  } else if (reason?.value === "other" && !details) {
    fieldErrors.details = "Tell us a little about why.";
  }

  // Only checked, and only kept, when the return needs one. A prepaid customer who has a
  // UPI ID typed into a stale form gets it ignored, not stored: it would sit in the
  // database for nothing.
  if (input.requireUpi) {
    const upiProblem = upiError(input.upiId);
    if (upiProblem) {
      fieldErrors.upiId = upiProblem;
    } else if (normaliseUpiId(input.upiId) !== normaliseUpiId(input.upiConfirm)) {
      fieldErrors.upiConfirm = "The two UPI IDs do not match.";
    }
  }

  if (Object.keys(fieldErrors).length > 0 || !reason) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    reasonLabel: reason.label,
    details,
    upiId: input.requireUpi ? normaliseUpiId(input.upiId) : null,
  };
}

/* ------------------------------------------------------------------ */
/* The lifecycle                                                       */
/* ------------------------------------------------------------------ */

/**
 * Where a return may move next.
 *
 * Forward-only, like order status. `received` can still be `rejected`: a parcel that comes
 * back worn or damaged is turned down at that point, not before.
 */
const NEXT: Record<ReturnStatus, readonly ReturnStatus[]> = {
  requested: ["approved", "rejected", "cancelled"],
  approved: ["picked_up", "received", "cancelled"],
  picked_up: ["in_transit", "received", "cancelled"],
  in_transit: ["received", "cancelled"],
  received: ["refunded", "rejected"],
  refunded: [],
  rejected: [],
  cancelled: [],
};

export function canMoveReturn(from: ReturnStatus, to: ReturnStatus): boolean {
  return NEXT[from].includes(to);
}

export function nextReturnStatuses(from: ReturnStatus): readonly ReturnStatus[] {
  return NEXT[from];
}

/**
 * States a return never leaves.
 *
 * Reaching one of these means the job the UPI ID was collected for is over — the money was
 * sent, or there will be none — so the full ID is erased there.
 */
export function isFinalReturnStatus(status: ReturnStatus): boolean {
  return NEXT[status].length === 0;
}

/** Plain-language status for the customer. */
export function customerReturnLabel(status: ReturnStatus): string {
  switch (status) {
    case "requested":
      return "Return requested. We’ll review it shortly.";
    case "approved":
      return "Return approved. We’ll arrange the pickup.";
    case "picked_up":
    case "in_transit":
      return "Return on its way back to us.";
    case "received":
      return "Return received. Your refund is being processed.";
    case "refunded":
      return "Refunded.";
    case "rejected":
      return "Return declined.";
    case "cancelled":
      return "Return cancelled.";
  }
}

/** Short label for staff. */
export function staffReturnLabel(status: ReturnStatus): string {
  switch (status) {
    case "requested":
      return "Requested";
    case "approved":
      return "Approved";
    case "picked_up":
      return "Picked up";
    case "in_transit":
      return "In transit";
    case "received":
      return "Received";
    case "refunded":
      return "Refunded";
    case "rejected":
      return "Rejected";
    case "cancelled":
      return "Cancelled";
  }
}
