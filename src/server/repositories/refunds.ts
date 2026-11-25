import type { RefundStatus } from "@/lib/refund";
import type { OrderRefundRow } from "../database.types";
import { callRpc, db, unwrap, updateTable } from "../supabase";

/**
 * The refund ledger (migration 20).
 *
 * Reads and writes `order_refunds`. Nothing here talks to Cashfree and nothing here decides
 * whether a refund is allowed beyond what the database itself enforces: that is
 * `src/server/refunds.ts`, which calls these.
 */

export interface OrderRefund {
  id: string;
  /** The id sent to Cashfree. */
  refundId: string;
  orderId: string;
  returnId?: string;
  /** The Cashfree order that was paid, which this refund is made against. */
  cashfreeOrderId: string;
  cfRefundId?: string;
  /** Paise. */
  amount: number;
  status: RefundStatus;
  /** Staff's reason. Internal. */
  note: string;
  actorEmail: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
  processedAt?: string;
}

function fromRow(row: OrderRefundRow): OrderRefund {
  return {
    id: row.id,
    refundId: row.refund_id,
    orderId: row.order_id,
    returnId: row.return_id ?? undefined,
    cashfreeOrderId: row.cashfree_order_id,
    cfRefundId: row.cf_refund_id ?? undefined,
    amount: row.amount,
    status: row.status,
    note: row.note,
    actorEmail: row.actor_email,
    failureReason: row.failure_reason ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    processedAt: row.processed_at ?? undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Reserving                                                           */
/* ------------------------------------------------------------------ */

export type ReserveRefundResult =
  | { ok: true; refund: OrderRefund }
  | {
      ok: false;
      reason:
        | "no_order"
        | "not_prepaid"
        | "not_paid"
        | "bad_amount"
        | "duplicate"
        /** More than is left. `remaining` is how much is. */
        | "exceeds"
        /** Migration 20 has not been run. */
        | "unavailable"
        | "failed";
      remaining?: number;
    };

/**
 * Reserve money against an order for a refund, before Cashfree is asked.
 *
 * The database checks the limit under a lock (see `reserve_order_refund`), so two staff
 * pressing the button in the same moment cannot both spend the same balance.
 */
export async function reserveRefund(input: {
  orderId: string;
  refundId: string;
  /** Paise. */
  amount: number;
  note: string;
  actorEmail: string;
  cashfreeOrderId: string;
  returnId?: string;
}): Promise<ReserveRefundResult> {
  const { data, error } = await callRpc(db(), "reserve_order_refund", {
    p_order_id: input.orderId,
    p_refund_id: input.refundId,
    p_amount: input.amount,
    p_note: input.note,
    p_actor_email: input.actorEmail,
    p_cashfree_order_id: input.cashfreeOrderId,
    p_return_id: input.returnId ?? null,
  });

  if (error) {
    const message = error.message;

    if (message.includes("refund:duplicate")) return { ok: false, reason: "duplicate" };
    if (message.includes("refund:no_order")) return { ok: false, reason: "no_order" };
    if (message.includes("refund:not_prepaid")) return { ok: false, reason: "not_prepaid" };
    if (message.includes("refund:not_paid")) return { ok: false, reason: "not_paid" };
    if (message.includes("refund:bad_amount")) return { ok: false, reason: "bad_amount" };

    const exceeds = /refund:exceeds:(\d+)/.exec(message);
    if (exceeds) return { ok: false, reason: "exceeds", remaining: Number(exceeds[1]) };

    // PostgREST reports a function it cannot find, or a table that is missing, in words.
    if (/could not find the function|schema cache|does not exist/i.test(message)) {
      console.error("[refund] migration 20 has not been run:", message);
      return { ok: false, reason: "unavailable" };
    }

    console.error("[refund] could not reserve a refund:", message);
    return { ok: false, reason: "failed" };
  }

  if (!data) return { ok: false, reason: "failed" };
  return { ok: true, refund: fromRow(data as OrderRefundRow) };
}

/* ------------------------------------------------------------------ */
/* Updating                                                            */
/* ------------------------------------------------------------------ */

/** Statuses a refund never leaves, so a late or repeated message cannot rewrite them. */
const FINAL = "(success,failed,cancelled)";

/**
 * Record what Cashfree says about a refund. Forward only.
 *
 * A refund already `success`, `failed` or `cancelled` is not touched: webhooks arrive more
 * than once and out of order, and an old "pending" must not undo a "success". Returns the
 * row, and whether this call changed it, so callers act on a transition exactly once.
 */
export async function applyRefundOutcome(
  refundId: string,
  outcome: {
    status: Exclude<RefundStatus, "requested">;
    cfRefundId?: string;
    failureReason?: string;
    processedAt?: string;
  },
): Promise<{ refund: OrderRefund; changed: boolean } | null> {
  const before = await getRefundByRefundId(refundId);
  if (!before) return null;

  // Already final, or nothing new to say.
  if (
    before.status === "success" ||
    before.status === "failed" ||
    before.status === "cancelled" ||
    (before.status === outcome.status && before.cfRefundId === (outcome.cfRefundId ?? before.cfRefundId))
  ) {
    return { refund: before, changed: false };
  }

  const { data, error } = await updateTable(db(), "order_refunds", {
    status: outcome.status,
    cf_refund_id: outcome.cfRefundId ?? before.cfRefundId ?? null,
    failure_reason: outcome.failureReason ?? null,
    processed_at:
      outcome.status === "success" ? (outcome.processedAt ?? new Date().toISOString()) : null,
    updated_at: new Date().toISOString(),
  })
    .eq("refund_id", refundId)
    // The guard that makes "forward only" true under concurrency, not just in the read above.
    .not("status", "in", FINAL)
    .select()
    .maybeSingle();

  if (error) throw new Error(error.message);

  // Zero rows: another request finished it between the read and the write.
  if (!data) {
    const current = await getRefundByRefundId(refundId);
    return current ? { refund: current, changed: false } : null;
  }

  return { refund: fromRow(data as OrderRefundRow), changed: true };
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

export async function getRefundByRefundId(refundId: string): Promise<OrderRefund | undefined> {
  const row = unwrap(
    await db()
      .from("order_refunds")
      .select("*")
      .eq("refund_id", refundId)
      .maybeSingle()
      .overrideTypes<OrderRefundRow, { merge: false }>(),
  );

  return row ? fromRow(row) : undefined;
}

export async function getRefund(id: string): Promise<OrderRefund | undefined> {
  const row = unwrap(
    await db()
      .from("order_refunds")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .overrideTypes<OrderRefundRow, { merge: false }>(),
  );

  return row ? fromRow(row) : undefined;
}

/**
 * Every refund on an order, newest first.
 *
 * Returns an empty list rather than throwing when the table is missing (migration 20 not
 * run), so the order page still opens; the refund panel says it is not set up.
 */
export async function listOrderRefunds(
  orderId: string,
): Promise<{ refunds: OrderRefund[]; available: boolean }> {
  const { data, error } = await db()
    .from("order_refunds")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .overrideTypes<OrderRefundRow[], { merge: false }>();

  if (error) {
    if (/does not exist|schema cache|could not find/i.test(error.message)) {
      return { refunds: [], available: false };
    }
    throw new Error(error.message);
  }

  return { refunds: (data ?? []).map(fromRow), available: true };
}
