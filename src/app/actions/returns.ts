"use server";

import { revalidatePath } from "next/cache";
import { validateReturnRequest } from "@/lib/return-flow";
import { returnEligibility } from "@/lib/returns";
import { maskUpiId } from "@/lib/upi";
import { clientIp } from "@/server/client-ip";
import { afterResponse } from "@/server/email/after-response";
import { announce } from "@/server/notifications";
import { LIMITS, consumeRateLimit, rateLimitMessage } from "@/server/rate-limit";
import { getOrder } from "@/server/repositories/orders";
import { getSettings } from "@/server/repositories/settings";
import { createReturn, getOrderReturns } from "@/server/repositories/shipping";

/**
 * Customer-initiated returns.
 *
 * The "Return" button on a delivered order lands here. It collects why, and records a
 * return for staff to review. For a cash-on-delivery order it also collects a UPI ID to send
 * the refund to, since there is no original payment to return it to. A prepaid order is
 * refunded through Cashfree, back to what the customer paid with, and is never asked for one.
 *
 * ## Authorisation
 *
 * The same claim ticket as cancelling and looking up an order: the reference AND the email
 * it was placed with, both required. A reference alone is short and enumerable, and a hit
 * here would write a refund destination onto someone else's order — which is how a refund
 * gets redirected, so this is one of the more valuable things to guess.
 *
 * ## The UPI ID (cash on delivery only)
 *
 * Handled as a payment address, not as ordinary form text:
 *
 * - validated strictly (`src/lib/upi.ts`) and required twice;
 * - stored only on the return, in a table the public key cannot read;
 * - never put in the staff alert, the audit log, an error message or a log line — all of
 *   which are read by more people and kept for longer than the order record;
 * - shown back to the customer masked (`as••••@okaxis`), never in full;
 * - erased when the return reaches a final state (see `updateReturnStatus`).
 */

export interface ReturnRequestState {
  error?: string;
  success?: string;
  fieldErrors?: Partial<Record<"reason" | "details" | "upiId" | "upiConfirm", string>>;
}

export async function requestReturnAction(
  _previous: ReturnRequestState,
  formData: FormData,
): Promise<ReturnRequestState> {
  const id = String(formData.get("id") ?? "")
    .trim()
    .toUpperCase();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!id || !email) return { error: "We could not identify that order." };

  /* ---- The form's own fields ------------------------------------------ */

  const fields = {
    reason: String(formData.get("reason") ?? ""),
    details: String(formData.get("details") ?? ""),
    upiId: String(formData.get("upiId") ?? ""),
    upiConfirm: String(formData.get("upiConfirm") ?? ""),
  };

  /*
   * Whether a UPI ID is needed depends on how the order was paid, which is only known once
   * the order is found, and finding it is what the rate limit guards. So the shape of the
   * reason is checked now, and the UPI ID after the order is proven to be theirs.
   */
  const shape = validateReturnRequest({ ...fields, requireUpi: false });

  if (!shape.ok) {
    return { error: "Please fix the highlighted fields.", fieldErrors: shape.fieldErrors };
  }

  /*
   * Counted after the shape checks, so a typo does not spend the allowance, and before
   * anything is looked up, so guessing references costs attempts either way.
   */
  const limited = await consumeRateLimit(
    [`return:ip:${await clientIp()}`, `return:ref:${id}`],
    LIMITS.returnRequest,
  );
  if (limited) return { error: rateLimitMessage(limited) };

  /* ---- Prove they hold the order -------------------------------------- */

  const order = await getOrder(id);

  // One message for "no such order" and "wrong email": distinguishing them would confirm
  // that a guessed reference exists.
  if (!order || !order.email || order.email.toLowerCase() !== email) {
    return { error: "We could not find that order." };
  }

  /* ---- Where the refund goes ------------------------------------------ */

  /*
   * Cash on delivery: the customer paid in cash, there is no original payment to send
   * money back to, so a UPI ID is required. Prepaid: the refund goes back through Cashfree
   * to whatever they paid with, so none is asked for, and one sent anyway is discarded
   * rather than kept for nothing.
   */
  const needsUpi = order.paymentMethod === "cod";

  const checked = needsUpi ? validateReturnRequest({ ...fields, requireUpi: true }) : shape;

  if (!checked.ok) {
    return { error: "Please fix the highlighted fields.", fieldErrors: checked.fieldErrors };
  }

  /* ---- The returns window --------------------------------------------- */

  const settings = await getSettings();
  const eligibility = returnEligibility(order, settings.returnWindowHours);
  if (!eligibility.eligible) return { error: eligibility.reason };

  /*
   * Checked before inserting so the customer gets a clear answer. The database enforces it
   * as well (a unique index on live returns), which is what actually stops two quick
   * clicks both passing this check.
   */
  const existing = await getOrderReturns(order.id);
  if (existing.some((entry) => entry.status !== "cancelled")) {
    return { error: "A return has already been requested for this order." };
  }

  /* ---- Record it ------------------------------------------------------ */

  const created = await createReturn({
    orderId: order.id,
    reason: checked.reasonLabel,
    notes: checked.details || undefined,
    ...(checked.upiId
      ? { refundUpiId: checked.upiId, refundUpiHint: maskUpiId(checked.upiId) }
      : {}),
  });

  if (!created.ok) {
    if (created.reason === "duplicate") {
      return { error: "A return has already been requested for this order." };
    }

    // `unavailable` means the refund column is missing — a setup problem, not something the
    // customer can fix, so it gets the same message as any other failure. It is logged.
    return {
      error: "We could not record your return just now. Please try again, or contact us.",
    };
  }

  /*
   * Tell staff. The alert carries the order, the customer's name and their reason — and
   * deliberately not the UPI ID, which stays on the return record, behind the admin login.
   */
  afterResponse(() =>
    announce.returnRequested(order, checked.reasonLabel, created.value.id),
  );

  revalidatePath(`/admin/orders/${order.id}`);
  revalidatePath("/admin/orders");

  return {
    success: checked.upiId
      ? `Return requested. We’ll refund to ${maskUpiId(checked.upiId)} once we have the items back.`
      : "Return requested. Once we have the items back, we’ll refund the payment method you paid with.",
  };
}
