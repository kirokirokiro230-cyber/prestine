import { refundIdFromKey, refundStatusLabel } from "@/lib/refund";
import {
  CashfreeApiError,
  cashfreeAmountMatches,
  cashfreeConfig,
  createCashfreeRefund,
  fetchCashfreeOrder,
  fetchCashfreeRefund,
  refundOutcomeIsKnown,
  type CashfreeConfig,
} from "./cashfree";
import { announce } from "./notifications";
import { addOrderNote, getOrder } from "./repositories/orders";
import {
  applyRefundOutcome,
  getRefund,
  listOrderRefunds,
  reserveRefund,
  type OrderRefund,
} from "./repositories/refunds";
import { updateReturnStatus } from "./repositories/shipping";
import type { Order } from "@/lib/types";

/**
 * Refunding a prepaid order through Cashfree.
 *
 * Not exported to the network: the server action in `src/app/admin/actions/refunds.ts`
 * decides WHO may refund, and the Cashfree webhook decides what Cashfree has done. This
 * file is the operation itself, so both can call it.
 *
 * ## How a refund goes, and why in this order
 *
 * 1. **Find the Cashfree order that was paid**, and confirm with Cashfree that it is PAID
 *    for the right amount. A refund is made against that order, not against ours.
 * 2. **Reserve the money in the database**, under a lock. This is the limit: it cannot be
 *    exceeded by two people at once, and it holds even if everything after it fails.
 * 3. **Ask Cashfree.** Only now, so a refund that is in flight already counts.
 * 4. **Record the answer.**
 *
 * ## When Cashfree's answer is lost
 *
 * A timeout does not mean the refund was not made. If this released the reservation on a
 * timeout, staff would try again and the customer could be refunded twice. So only an
 * answer that definitely means "not created" (a 4xx) releases the money; anything else
 * leaves it reserved, as `requested`, until "Check status" finds out from Cashfree.
 *
 * ## What is never sent to Cashfree
 *
 * Staff's reason. It is internal and can be blunt; Cashfree gets "Refund for order X".
 */

/** Rupees, for notes and messages. Refunds are INR-only, as is everything Cashfree takes. */
function rupees(minor: number): string {
  return `₹${(minor / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export type RefundResult =
  | {
      ok: true;
      refund: OrderRefund;
      /** What to tell the person who pressed the button. */
      message: string;
    }
  | {
      ok: false;
      error: string;
      /** Present when a row exists, so the page can show it. */
      refund?: OrderRefund;
    };

/* ------------------------------------------------------------------ */
/* Which Cashfree order was paid                                       */
/* ------------------------------------------------------------------ */

/**
 * The Cashfree order id to refund against, confirmed with Cashfree.
 *
 * Normally `order.cashfreeOrderId`. A payment retried through a new session leaves the
 * order pointing at the newest attempt even if an earlier one took the money (settlement
 * corrects this now, but older orders may not be), so the order's own id is tried too.
 * Each candidate is only accepted if Cashfree reports it PAID at the amount the order
 * cost: refunding against the wrong Cashfree order would fail at best.
 */
async function findPaidCashfreeOrder(
  config: CashfreeConfig,
  order: Order,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const candidates = [...new Set([order.cashfreeOrderId, order.id].filter(Boolean) as string[])];

  for (const id of candidates) {
    try {
      const remote = await fetchCashfreeOrder(config, id);

      if (remote.orderStatus === "PAID" && cashfreeAmountMatches(remote, order.totals.total)) {
        return { ok: true, id };
      }
    } catch (error) {
      // Cashfree has never heard of this id: try the next one.
      if (error instanceof CashfreeApiError && error.status === 404) continue;

      console.error(`[refund] could not check ${id} with Cashfree:`, (error as Error).message);
      return {
        ok: false,
        error: "Could not reach Cashfree to check the payment. Nothing was refunded; try again.",
      };
    }
  }

  return {
    ok: false,
    error:
      "Cashfree does not show this order as paid for the right amount, so nothing was refunded. " +
      "Check the payment in the Cashfree dashboard.",
  };
}

/* ------------------------------------------------------------------ */
/* Issuing                                                             */
/* ------------------------------------------------------------------ */

export interface IssueRefundInput {
  orderId: string;
  /** Paise. */
  amount: number;
  /** Staff's reason. Internal. */
  note: string;
  /** The form's one-time key; becomes the refund id. */
  key: string;
  /** The return this settles, if it was started from one. */
  returnId?: string;
  actorEmail: string;
}

export async function issueRefund(input: IssueRefundInput): Promise<RefundResult> {
  const refundId = refundIdFromKey(input.key);
  if (!refundId) return { ok: false, error: "This form is out of date. Reload the page and try again." };

  const config = cashfreeConfig();
  if (!config) return { ok: false, error: "Cashfree is not configured, so nothing can be refunded." };

  const order = await getOrder(input.orderId);
  if (!order) return { ok: false, error: "That order no longer exists." };

  if (order.paymentMethod === "cod") {
    return {
      ok: false,
      error:
        "This is a cash-on-delivery order, so there is no online payment to refund. " +
        "Send the money to the customer’s UPI ID and mark the return refunded.",
    };
  }
  if (order.paymentStatus !== "paid") {
    return { ok: false, error: "This order was never paid, so there is nothing to refund." };
  }

  const paid = await findPaidCashfreeOrder(config, order);
  if (!paid.ok) return { ok: false, error: paid.error };

  /* ---- Reserve ------------------------------------------------------- */

  const reserved = await reserveRefund({
    orderId: order.id,
    refundId,
    amount: input.amount,
    note: input.note,
    actorEmail: input.actorEmail,
    cashfreeOrderId: paid.id,
    returnId: input.returnId,
  });

  if (!reserved.ok) {
    switch (reserved.reason) {
      case "exceeds":
        return {
          ok: false,
          error:
            reserved.remaining && reserved.remaining > 0
              ? `Only ${rupees(reserved.remaining)} is left to refund on this order.`
              : "This order has already been refunded in full.",
        };
      case "duplicate":
        return {
          ok: false,
          error: "That refund was already submitted. Reload the page to see where it is.",
        };
      case "unavailable":
        return {
          ok: false,
          error:
            "Refunds are not set up yet: run supabase/migrations/00000000000020_order_refunds.sql in the Supabase SQL editor.",
        };
      case "not_paid":
        return { ok: false, error: "This order was never paid, so there is nothing to refund." };
      case "not_prepaid":
        return { ok: false, error: "This is a cash-on-delivery order; there is no online payment to refund." };
      case "bad_amount":
        return { ok: false, error: "The refund must be more than zero." };
      case "no_order":
        return { ok: false, error: "That order no longer exists." };
      default:
        return { ok: false, error: "Could not record the refund. Nothing was sent; try again." };
    }
  }

  const reservation = reserved.refund;

  /* ---- Ask Cashfree -------------------------------------------------- */

  let accepted;
  try {
    accepted = await createCashfreeRefund(config, {
      orderId: paid.id,
      refundId,
      amountMinorUnits: input.amount,
    });
  } catch (error) {
    const detail = error instanceof CashfreeApiError ? error.message : "Unexpected error";

    if (refundOutcomeIsKnown(error)) {
      // Cashfree read it and said no. Nothing exists, so the money is released.
      console.error(`[refund] Cashfree refused ${refundId}: ${detail}`);

      const failed = await applyRefundOutcome(refundId, {
        status: "failed",
        failureReason: detail.slice(0, 300),
      }).catch((dbError) => {
        console.error("[refund] could not record the failure:", (dbError as Error).message);
        return null;
      });

      return {
        ok: false,
        error: `Cashfree did not accept the refund: ${detail}`,
        refund: failed?.refund ?? reservation,
      };
    }

    // The outcome is unknown. The money stays reserved.
    console.error(`[refund] no confirmed answer from Cashfree for ${refundId}: ${detail}`);

    return {
      ok: false,
      error:
        "Cashfree did not confirm the refund, and it may still have been made. The amount is " +
        "held against this order. Use “Check status” on the refund below before trying again.",
      refund: reservation,
    };
  }

  /* ---- Record the answer --------------------------------------------- */

  if (Number.isFinite(accepted.amountMinorUnits) && accepted.amountMinorUnits !== input.amount) {
    // Not expected. Recorded loudly, because it means ledger and Cashfree disagree.
    console.error(
      `[refund] ${refundId}: asked for ${input.amount} paise, Cashfree reports ${accepted.amountMinorUnits}.`,
    );
  }

  let recorded: { refund: OrderRefund; changed: boolean } | null = null;
  try {
    recorded = await applyRefundOutcome(refundId, {
      status: accepted.status,
      cfRefundId: accepted.cfRefundId,
      failureReason:
        accepted.status === "failed" || accepted.status === "cancelled"
          ? (accepted.statusDescription ?? "Cashfree could not complete the refund.")
          : undefined,
      processedAt: accepted.processedAt,
    });
  } catch (error) {
    // Cashfree has the refund; we could not write that down. The reservation is still in
    // place, so nothing can be refunded twice, and "Check status" will catch it up.
    console.error("[refund] could not record Cashfree's answer:", (error as Error).message);
  }

  if (!recorded) {
    return {
      ok: true,
      refund: reservation,
      message: `Cashfree accepted the refund of ${rupees(input.amount)}, but it could not be recorded here. Use “Check status” to update it.`,
    };
  }

  await afterRefundChange(recorded.refund, recorded.changed);

  const refund = recorded.refund;

  if (refund.status === "failed" || refund.status === "cancelled") {
    return {
      ok: false,
      error: `Cashfree could not complete the refund: ${refund.failureReason ?? "no reason given"}.`,
      refund,
    };
  }

  return {
    ok: true,
    refund,
    message:
      refund.status === "success"
        ? `Refunded ${rupees(refund.amount)} to the customer’s original payment method.`
        : `Refund of ${rupees(refund.amount)} sent to Cashfree. The customer’s bank can take several working days to credit it.`,
  };
}

/* ------------------------------------------------------------------ */
/* Catching up with Cashfree                                           */
/* ------------------------------------------------------------------ */

/** A refund younger than this that Cashfree has no record of may simply not have landed yet. */
const UNKNOWN_GRACE_MS = 2 * 60 * 1000;

export type RefreshResult =
  | { ok: true; refund: OrderRefund; message: string }
  /** `retryable`: Cashfree could not be reached, so asking again later may work. */
  | { ok: false; error: string; retryable?: boolean };

/**
 * Ask Cashfree where a refund is and bring the ledger up to date.
 *
 * Used by the "Check status" button and by the webhook. For a refund still `requested`
 * (Cashfree never confirmed it), "Cashfree has no record" means the request never arrived,
 * and only then, and only after a short grace period, is the money released.
 */
export async function refreshRefund(ledgerId: string): Promise<RefreshResult> {
  const config = cashfreeConfig();
  if (!config) return { ok: false, error: "Cashfree is not configured." };

  const row = await getRefund(ledgerId);
  if (!row) return { ok: false, error: "That refund no longer exists." };

  return refreshFromCashfree(config, row);
}

/** Same as `refreshRefund`, for a refund already loaded. The webhook uses this. */
export async function refreshFromCashfree(
  config: CashfreeConfig,
  row: OrderRefund,
): Promise<RefreshResult> {
  if (row.status === "success" || row.status === "failed" || row.status === "cancelled") {
    return { ok: true, refund: row, message: `Already ${refundStatusLabel(row.status).toLowerCase()}.` };
  }

  let remote;
  try {
    remote = await fetchCashfreeRefund(config, row.cashfreeOrderId, row.refundId);
  } catch (error) {
    console.error(`[refund] could not read ${row.refundId} from Cashfree:`, (error as Error).message);
    return { ok: false, error: "Could not reach Cashfree. Try again in a moment.", retryable: true };
  }

  if (!remote) {
    if (row.status !== "requested") {
      return { ok: false, error: "Cashfree has no record of this refund. Check the Cashfree dashboard." };
    }

    if (Date.now() - new Date(row.createdAt).getTime() < UNKNOWN_GRACE_MS) {
      return {
        ok: false,
        error: "Cashfree has no record of it yet. Wait a minute and check again.",
      };
    }

    const failed = await applyRefundOutcome(row.refundId, {
      status: "failed",
      failureReason: "The request never reached Cashfree, so no money was sent.",
    });

    if (failed) {
      await afterRefundChange(failed.refund, failed.changed);
      return {
        ok: true,
        refund: failed.refund,
        message: "Cashfree never received this refund, so no money was sent. You can issue it again.",
      };
    }
    return { ok: false, error: "That refund no longer exists." };
  }

  const applied = await applyRefundOutcome(row.refundId, {
    status: remote.status,
    cfRefundId: remote.cfRefundId,
    failureReason:
      remote.status === "failed" || remote.status === "cancelled"
        ? (remote.statusDescription ?? "Cashfree could not complete the refund.")
        : undefined,
    processedAt: remote.processedAt,
  });

  if (!applied) return { ok: false, error: "That refund no longer exists." };

  await afterRefundChange(applied.refund, applied.changed);

  return {
    ok: true,
    refund: applied.refund,
    message: `${refundStatusLabel(applied.refund.status)}.`,
  };
}

/* ------------------------------------------------------------------ */
/* What follows a change                                               */
/* ------------------------------------------------------------------ */

/**
 * The consequences of a refund reaching a final state. Runs once per change, never throws.
 *
 * - **success:** if the refund settles a return, the return is marked refunded. It is not
 *   marked when the refund is merely accepted, because accepted is not delivered: a return
 *   that says "refunded" while the money bounces is worse than one that says "received".
 * - **failed or cancelled:** the customer is still owed this, so staff are alerted and the
 *   order is annotated. The reservation has already been released by the status change.
 */
export async function afterRefundChange(refund: OrderRefund, changed: boolean): Promise<void> {
  if (!changed) return;

  try {
    if (refund.status === "success") {
      await addOrderNote(
        refund.orderId,
        `Refund of ${rupees(refund.amount)} reached the customer's original payment method (${refund.refundId}).`,
      );

      if (refund.returnId) {
        const { refunds } = await listOrderRefunds(refund.orderId);
        const settled = refunds
          .filter((entry) => entry.returnId === refund.returnId && entry.status === "success")
          .reduce((sum, entry) => sum + entry.amount, 0);

        await updateReturnStatus(refund.returnId, "refunded", {
          refundAmount: settled,
          // A no-op if staff already moved it, rather than a second transition.
          expectedFrom: "received",
        });
      }
      return;
    }

    if (refund.status === "failed" || refund.status === "cancelled") {
      const reason = refund.failureReason ?? "Cashfree could not complete it.";

      await addOrderNote(
        refund.orderId,
        `Refund of ${rupees(refund.amount)} ${refund.status === "failed" ? "failed" : "was cancelled"}: ${reason} (${refund.refundId}). The money was not sent.`,
      );

      const order = await getOrder(refund.orderId);
      if (order) await announce.refundFailed(order, refund.amount, reason, refund.refundId);
    }
  } catch (error) {
    console.error("[refund] follow-up after a refund change failed:", (error as Error).message);
  }
}
