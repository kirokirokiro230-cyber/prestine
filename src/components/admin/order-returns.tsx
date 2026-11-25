"use client";

import { useActionState, useState } from "react";
import { Check, Copy, LockSimple } from "@phosphor-icons/react";
import { updateReturnAction, type ReturnActionState } from "@/app/admin/actions/returns";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import type { Return, ReturnStatus } from "@/lib/delhivery/types";
import { nextReturnStatuses, staffReturnLabel } from "@/lib/return-flow";
import { RefundForm } from "./order-refunds";
import { FormFeedback, Panel, SubmitButton } from "./primitives";

/**
 * Return requests for one order, with the refund destination.
 *
 * This is the only place the customer's full UPI ID is shown. It appears while the return
 * is open, with a copy button, and is gone once the return is refunded, rejected or
 * cancelled (the server erases it), after which only the masked hint remains.
 *
 * ## What staff can do
 *
 * Approve or reject a new request; mark it received when the parcel is back; mark it
 * refunded once the money has been sent. Courier states (picked up, in transit) are not
 * offered: they follow from the pickup, not from a decision.
 *
 * ## Two ways to refund
 *
 * - **Prepaid:** the money goes back through Cashfree to whatever the customer paid with, in
 *   an amount staff choose, and no UPI ID exists to show. The "refunded" step is the refund
 *   form (`RefundForm`), and the return moves to refunded by itself once Cashfree confirms.
 * - **Cash on delivery:** there is no original payment, so the customer gave a UPI ID. Marking
 *   a return refunded here does NOT move money. Staff send it from their own UPI app, to the
 *   ID shown, then record it. The panel says so, because a button labelled "Refunded" invites
 *   the assumption that it did something.
 */

/** Courier-driven states have no button; they happen to a return rather than being chosen. */
const COURIER_STATES: readonly ReturnStatus[] = ["picked_up", "in_transit"];

const PILL: Record<ReturnStatus, string> = {
  requested: "bg-warning-100 text-warning-700 dark:bg-warning-700/25 dark:text-warning-100",
  approved: "bg-clay-100 text-clay-700 dark:bg-clay-900/60 dark:text-clay-200",
  picked_up: "bg-clay-100 text-clay-700 dark:bg-clay-900/60 dark:text-clay-200",
  in_transit: "bg-clay-100 text-clay-700 dark:bg-clay-900/60 dark:text-clay-200",
  received: "bg-clay-100 text-clay-700 dark:bg-clay-900/60 dark:text-clay-200",
  refunded: "bg-success-100 text-success-700 dark:bg-success-700/25 dark:text-success-100",
  rejected: "bg-danger-100 text-danger-700 dark:bg-danger-700/25 dark:text-danger-100",
  cancelled: "bg-surface-sunken text-content-muted",
};

export function OrderReturns({
  returns,
  orderTotal,
  currencySymbol,
  canWrite,
  prepaid,
  refundable,
  refundKey,
}: {
  returns: Return[];
  /** The order total in minor units, as the default and ceiling for a refund. */
  orderTotal: number;
  currencySymbol: string;
  canWrite: boolean;
  /**
   * A prepaid order is refunded through Cashfree to what the customer paid with, so there
   * is no UPI ID to show and the "refunded" step is a Cashfree refund. A COD order has
   * nothing to refund to, which is why those, and only those, collect a UPI ID.
   */
  prepaid: boolean;
  /** Minor units still refundable through Cashfree. Meaningful only when `prepaid`. */
  refundable: number;
  /** One-time key for the refund form; see `issueRefundAction`. */
  refundKey: string;
}) {
  const [state, action] = useActionState<ReturnActionState, FormData>(updateReturnAction, {});

  if (returns.length === 0) return null;

  return (
    <Panel
      title="Return"
      description={
        prepaid
          ? "Raised by the customer from their account. The refund goes back to what they paid with."
          : "Raised by the customer from their account. They paid cash, so they are expecting a refund to the UPI ID below."
      }
    >
      <FormFeedback error={state.error} success={state.success} className="mb-4" />

      <ul className="flex flex-col gap-6">
        {returns.map((entry) => (
          <li key={entry.id} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span
                className={`inline-flex rounded-full px-2.5 py-1.5 text-[0.625rem] font-bold uppercase tracking-[0.08em] leading-none ${PILL[entry.status]}`}
              >
                {staffReturnLabel(entry.status)}
              </span>
              <span className="text-xs text-content-muted">
                Requested {formatDate(entry.requested_at, "short")}
              </span>
            </div>

            <dl className="flex flex-col gap-3 text-sm">
              <div>
                <dt className="text-2xs font-medium uppercase tracking-[0.12em] text-content-muted">
                  Reason
                </dt>
                <dd className="mt-1">{entry.reason ?? "Not given"}</dd>
              </div>

              {entry.notes ? (
                <div>
                  <dt className="text-2xs font-medium uppercase tracking-[0.12em] text-content-muted">
                    Customer’s note
                  </dt>
                  {/* Rendered as text, never as markup: it is typed by the customer. */}
                  <dd className="mt-1 whitespace-pre-wrap break-words">{entry.notes}</dd>
                </div>
              ) : null}

              {entry.refund_amount ? (
                <div>
                  <dt className="text-2xs font-medium uppercase tracking-[0.12em] text-content-muted">
                    Refunded
                  </dt>
                  <dd data-numeric className="mt-1">
                    {currencySymbol}
                    {(entry.refund_amount / 100).toFixed(2)}
                    {entry.refunded_at ? ` on ${formatDate(entry.refunded_at, "short")}` : ""}
                  </dd>
                </div>
              ) : null}
            </dl>

            {prepaid ? <OriginalPaymentDestination /> : <RefundDestination entry={entry} />}

            {canWrite ? (
              <ReturnActions
                entry={entry}
                action={action}
                orderTotal={orderTotal}
                currencySymbol={currencySymbol}
                prepaid={prepaid}
                refundable={refundable}
                refundKey={refundKey}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

/** Prepaid: no address to show, because the money goes back the way it came. */
function OriginalPaymentDestination() {
  return (
    <div className="rounded-xl border border-line bg-surface-sunken p-4">
      <p className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-[0.12em] text-content-muted">
        <LockSimple size={12} aria-hidden />
        Refund goes to
      </p>
      <p className="mt-2 text-sm leading-relaxed">
        The card, UPI or bank account the customer paid with. Once the items are back, issue the
        refund from here. You can send less than the full amount to keep a deduction.
      </p>
    </div>
  );
}

function RefundDestination({ entry }: { entry: Return }) {
  const [copied, setCopied] = useState(false);

  const upi = entry.refund_upi_id;

  const copy = async () => {
    if (!upi) return;
    try {
      await navigator.clipboard.writeText(upi);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (an insecure origin, or a permissions policy). The ID is on
      // screen to be selected by hand, so this is a convenience lost, not a feature.
    }
  };

  return (
    <div className="rounded-xl border border-line bg-surface-sunken p-4">
      <p className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-[0.12em] text-content-muted">
        <LockSimple size={12} aria-hidden />
        Send the refund to
      </p>

      {upi ? (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {/* `select-all` so one click selects the whole ID if copying is blocked. */}
            <code className="select-all break-all font-mono text-base font-semibold text-content">
              {upi}
            </code>
            <Button type="button" variant="outline" size="sm" onClick={copy}>
              {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-content-muted">
            Pay it from your own UPI app, then mark the return refunded below. This panel does
            not move any money. The ID is erased from the system when you do.
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-content-muted">
          {entry.refund_upi_hint ? (
            <>
              The full UPI ID has been erased. It was{" "}
              <code className="font-mono">{entry.refund_upi_hint}</code>.
            </>
          ) : (
            "No UPI ID was given for this return."
          )}
        </p>
      )}
    </div>
  );
}

function ReturnActions({
  entry,
  action,
  orderTotal,
  currencySymbol,
  prepaid,
  refundable,
  refundKey,
}: {
  entry: Return;
  action: (formData: FormData) => void;
  orderTotal: number;
  currencySymbol: string;
  prepaid: boolean;
  refundable: number;
  refundKey: string;
}) {
  const options = nextReturnStatuses(entry.status).filter(
    (status) => !COURIER_STATES.includes(status),
  );

  if (options.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-4">
      {options.map((status) => {
        /*
         * A prepaid return is refunded by sending money through Cashfree, not by pressing a
         * status button, so the "refunded" step is the refund form. The return moves to
         * refunded by itself when Cashfree confirms the money has gone.
         *
         * If the order has already been refunded in full from the Refunds panel, there is
         * nothing left to send and the form would be pointless: the plain button remains, so
         * the return can still be closed.
         */
        if (status === "refunded" && prepaid && refundable > 0) {
          return (
            <RefundForm
              key={status}
              orderId={entry.order_id}
              remaining={refundable}
              currencySymbol={currencySymbol}
              refundKey={refundKey}
              returnId={entry.id}
              defaultNote="Returned items received"
              heading="Refund the customer"
            />
          );
        }

        return (
          <ReturnStatusForm
            key={status}
            status={status}
            entry={entry}
            action={action}
            orderTotal={orderTotal}
            currencySymbol={currencySymbol}
            alreadyRefunded={prepaid ? orderTotal - refundable : undefined}
          />
        );
      })}
    </div>
  );
}

function ReturnStatusForm({
  status,
  entry,
  action,
  orderTotal,
  currencySymbol,
  alreadyRefunded,
}: {
  status: ReturnStatus;
  entry: Return;
  action: (formData: FormData) => void;
  orderTotal: number;
  currencySymbol: string;
  /** Minor units already sent through Cashfree, offered as the amount to record. */
  alreadyRefunded?: number;
}) {
  // For COD, the order total. For a prepaid order already refunded in the Refunds panel,
  // what was actually sent, so the return records the true figure.
  const recorded = alreadyRefunded && alreadyRefunded > 0 ? alreadyRefunded : orderTotal;

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="returnId" value={entry.id} />
      <input type="hidden" name="to" value={status} />

      {status === "refunded" ? (
        <label className="flex flex-col gap-1 text-2xs font-medium uppercase tracking-[0.12em] text-content-muted">
          Amount refunded ({currencySymbol})
          <input
            name="refundAmount"
            inputMode="decimal"
            required
            defaultValue={(recorded / 100).toFixed(2)}
            className="h-10 w-36 rounded-lg border border-line-strong bg-surface px-3 text-sm normal-case tracking-normal text-content focus:border-accent focus:outline-none"
          />
        </label>
      ) : null}

      {status === "rejected" ? (
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-2xs font-medium uppercase tracking-[0.12em] text-content-muted">
          Reason for declining
          <input
            name="note"
            required
            maxLength={300}
            className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm normal-case tracking-normal text-content focus:border-accent focus:outline-none"
          />
        </label>
      ) : null}

      <SubmitButton
        variant={status === "rejected" || status === "cancelled" ? "outline" : "primary"}
        size="md"
      >
        {BUTTON_LABEL[status] ?? staffReturnLabel(status)}
      </SubmitButton>
    </form>
  );
}

const BUTTON_LABEL: Partial<Record<ReturnStatus, string>> = {
  approved: "Approve return",
  rejected: "Decline return",
  received: "Mark items received",
  refunded: "Mark refunded",
  cancelled: "Cancel return",
};
