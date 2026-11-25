"use client";

import { useActionState, useState } from "react";
import {
  issueRefundAction,
  refreshRefundAction,
  type RefundActionState,
} from "@/app/admin/actions/refunds";
import { formatDate } from "@/lib/format";
import {
  parseRefundAmount,
  refundStatusLabel,
  refundableRemaining,
  refundedTotal,
  type RefundStatus,
} from "@/lib/refund";
import { ConfirmSubmit, FormFeedback, Panel, SubmitButton } from "./primitives";

/**
 * Refunds on a prepaid order, sent back through Cashfree to whatever the customer paid with.
 *
 * ## The amount is yours to set
 *
 * The box starts at everything still refundable and can be lowered, which is how a
 * cancellation fee or the courier's charge is kept. What is kept is shown as it is typed, so
 * "refund ₹2,000 of ₹2,499" reads as "you keep ₹499" before anyone presses anything.
 *
 * ## Why it asks twice
 *
 * Refunds cannot be recalled. The button is the two-step `ConfirmSubmit` used for deletes:
 * the first click arms it, the second sends it.
 *
 * ## What the page shows
 *
 * Money in three numbers (paid, refunded or on its way, still refundable) and then every
 * refund, including failed ones, because "it failed, then I did it again" is a history worth
 * keeping. A refund that is not settled has a "Check status" button: Cashfree reports the
 * outcome by webhook, and this asks directly if the webhook has not arrived.
 */

/** A refund, as the page receives it. Plain data, safe to send to the browser. */
export interface RefundView {
  id: string;
  amount: number;
  status: RefundStatus;
  note: string;
  actorEmail: string;
  failureReason?: string;
  createdAt: string;
  returnId?: string;
}

const PILL: Record<RefundStatus, string> = {
  requested: "bg-warning-100 text-warning-700 dark:bg-warning-700/25 dark:text-warning-100",
  pending: "bg-clay-100 text-clay-700 dark:bg-clay-900/60 dark:text-clay-200",
  onhold: "bg-warning-100 text-warning-700 dark:bg-warning-700/25 dark:text-warning-100",
  success: "bg-success-100 text-success-700 dark:bg-success-700/25 dark:text-success-100",
  failed: "bg-danger-100 text-danger-700 dark:bg-danger-700/25 dark:text-danger-100",
  cancelled: "bg-surface-sunken text-content-muted",
};

const format = (minor: number, symbol: string) =>
  `${symbol}${(minor / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function OrderRefunds({
  orderId,
  orderTotal,
  currencySymbol,
  refunds,
  available,
  canWrite,
  canRefund,
  cancelled,
  refundKey,
}: {
  orderId: string;
  /** Paise: what the customer paid. */
  orderTotal: number;
  currencySymbol: string;
  refunds: RefundView[];
  /** False when migration 20 has not been run. */
  available: boolean;
  canWrite: boolean;
  /** A prepaid order Cashfree has been paid for. Otherwise there is nothing to refund. */
  canRefund: boolean;
  cancelled: boolean;
  /** A fresh UUID for this page load; see `issueRefundAction`. */
  refundKey: string;
}) {
  const [checkState, checkAction] = useActionState<RefundActionState, FormData>(
    refreshRefundAction,
    {},
  );

  if (!canRefund && refunds.length === 0) return null;

  const spent = refundedTotal(refunds);
  const remaining = refundableRemaining(orderTotal, refunds);

  return (
    <Panel
      title="Refunds"
      description={
        cancelled && remaining > 0 && canRefund
          ? "This order was cancelled after it was paid. The customer is owed a refund."
          : "Sent back through Cashfree to the card, UPI or bank account the customer paid with."
      }
    >
      {!available ? (
        <p role="alert" className="rounded-xl border border-line bg-surface-sunken p-4 text-sm leading-relaxed">
          Refunds are not available. If you have not run{" "}
          <code className="font-mono">supabase/migrations/00000000000020_order_refunds.sql</code> in
          the Supabase SQL editor yet, run it and reload. Otherwise check the server log.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <Figure label="Paid" value={format(orderTotal, currencySymbol)} />
            <Figure label="Refunded or on its way" value={format(spent, currencySymbol)} />
            <Figure
              label="Still refundable"
              value={format(remaining, currencySymbol)}
              strong
            />
          </dl>

          <FormFeedback error={checkState.error} success={checkState.success} />

          {refunds.length > 0 ? (
            <ul className="flex flex-col divide-y divide-line border-y border-line">
              {refunds.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-2 py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span data-numeric className="text-sm font-medium">
                      {format(entry.amount, currencySymbol)}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1.5 text-[0.625rem] font-bold uppercase tracking-[0.08em] leading-none ${PILL[entry.status]}`}
                    >
                      {refundStatusLabel(entry.status)}
                    </span>
                    <span className="text-xs text-content-muted">
                      {formatDate(entry.createdAt, "short")} · {entry.actorEmail}
                    </span>
                  </div>

                  <p className="break-words text-sm text-content-muted">{entry.note}</p>

                  {entry.failureReason ? (
                    <p className="text-xs leading-relaxed text-danger-500 dark:text-danger-100">
                      {entry.failureReason}
                    </p>
                  ) : null}

                  {entry.status === "requested" ? (
                    <p className="text-xs leading-relaxed text-content-muted">
                      Cashfree has not confirmed this refund. The amount is held against the order
                      until it is checked.
                    </p>
                  ) : null}

                  {canWrite &&
                  (entry.status === "requested" ||
                    entry.status === "pending" ||
                    entry.status === "onhold") ? (
                    <form action={checkAction}>
                      <input type="hidden" name="refundRowId" value={entry.id} />
                      <SubmitButton variant="outline" size="sm" pendingLabel="Checking…">
                        Check status
                      </SubmitButton>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {canWrite && canRefund && remaining > 0 ? (
            <RefundForm
              orderId={orderId}
              remaining={remaining}
              currencySymbol={currencySymbol}
              refundKey={refundKey}
              defaultNote={cancelled ? "Order cancelled by customer" : ""}
              heading="Refund the customer"
            />
          ) : null}
        </div>
      )}
    </Panel>
  );
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-2xs font-medium uppercase tracking-[0.12em] text-content-muted">
        {label}
      </dt>
      <dd data-numeric className={`mt-1 ${strong ? "text-base font-semibold" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

/**
 * The refund form. Also used inside a return, where `returnId` ties the refund to it so the
 * return is marked refunded when the money lands.
 */
export function RefundForm({
  orderId,
  remaining,
  currencySymbol,
  refundKey,
  returnId,
  defaultNote = "",
  heading,
}: {
  orderId: string;
  /** Paise still refundable: the ceiling, and the starting amount. */
  remaining: number;
  currencySymbol: string;
  refundKey: string;
  returnId?: string;
  defaultNote?: string;
  heading?: string;
}) {
  /*
   * `null` means "untouched": the box follows `remaining`, which changes after a refund.
   * Typing makes it a value of its own.
   */
  const [amount, setAmount] = useState<string | null>(null);
  const [note, setNote] = useState(defaultNote);

  // The key sent with the form. The server's value is taken once; a new one is made only
  // when the old one has been used up (see `reset` below), so a second press of the same
  // form is the same refund, and is refused.
  const [key, setKey] = useState(refundKey);

  const shown = amount ?? (remaining / 100).toFixed(2);
  const parsed = parseRefundAmount(shown);
  const kept = parsed.ok ? remaining - parsed.minor : 0;

  const [state, action] = useActionState<RefundActionState, FormData>(
    async (previous, formData) => {
      const result = await issueRefundAction(previous, formData);

      if (result.reset) {
        setKey(crypto.randomUUID());
      }
      if (result.success) {
        setAmount(null);
        setNote(defaultNote);
      }
      return result;
    },
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      {heading ? <h3 className="text-sm font-semibold">{heading}</h3> : null}

      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="key" value={key} />
      {returnId ? <input type="hidden" name="returnId" value={returnId} /> : null}

      <FormFeedback error={state.error} success={state.success} />

      <div className="flex flex-wrap items-start gap-4">
        <label className="flex flex-col gap-1 text-2xs font-medium uppercase tracking-[0.12em] text-content-muted">
          Amount to refund ({currencySymbol})
          <input
            name="amount"
            inputMode="decimal"
            required
            autoComplete="off"
            value={shown}
            onChange={(event) => setAmount(event.target.value)}
            className="h-10 w-40 rounded-lg border border-line-strong bg-surface px-3 text-sm normal-case tracking-normal text-content focus:border-accent focus:outline-none"
          />
        </label>

        <label className="flex min-w-56 flex-1 flex-col gap-1 text-2xs font-medium uppercase tracking-[0.12em] text-content-muted">
          Reason (for the order record)
          <input
            name="note"
            required
            maxLength={200}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm normal-case tracking-normal text-content focus:border-accent focus:outline-none"
          />
        </label>
      </div>

      {!parsed.ok ? (
        <p className="text-xs text-danger-500 dark:text-danger-100">{parsed.error}</p>
      ) : parsed.minor > remaining ? (
        <p className="text-xs text-danger-500 dark:text-danger-100">
          That is more than the {format(remaining, currencySymbol)} still refundable.
        </p>
      ) : kept > 0 ? (
        <p className="text-xs leading-relaxed text-content-muted">
          You keep <span data-numeric className="font-medium text-content">{format(kept, currencySymbol)}</span>{" "}
          of what is still refundable.
        </p>
      ) : (
        <p className="text-xs leading-relaxed text-content-muted">This refunds everything that is left.</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <ConfirmSubmit confirmLabel="Click again to send the refund">
          {parsed.ok && parsed.minor <= remaining
            ? `Refund ${format(parsed.minor, currencySymbol)}`
            : "Refund"}
        </ConfirmSubmit>
        <span className="text-xs text-content-muted">
          This sends money from your Cashfree account and cannot be undone.
        </span>
      </div>
    </form>
  );
}
