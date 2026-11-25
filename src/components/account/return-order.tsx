"use client";

import { useActionState, useState } from "react";
import { ArrowUUpLeft, LockSimple } from "@phosphor-icons/react";
import { requestReturnAction, type ReturnRequestState } from "@/app/actions/returns";
import { Button } from "@/components/ui/button";
import { TextArea, TextField } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { MAX_RETURN_DETAILS, RETURN_REASONS } from "@/lib/return-flow";
import type { Order } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Customer-initiated return.
 *
 * Offered only on a delivered order that is inside the returns window and has no return
 * yet; the caller decides that (`returnEligibility`) and the server re-checks it, so a
 * crafted request cannot get past what the page chose not to show.
 *
 * ## Why the UPI ID is asked for twice (cash on delivery only)
 *
 * A cash-on-delivery customer has no original payment to be refunded to, so they say where.
 * A prepaid customer is not asked: that refund goes back through Cashfree. The ID is where
 * the refund is sent, and a typo in a payment address is not an error — it is a
 * payment to a stranger that cannot be recalled. So it is entered twice and compared. The
 * confirmation field is not `type="password"`: hiding what you typed makes a mistake harder
 * to spot, which is the opposite of the point.
 *
 * ## What the customer is told about it
 *
 * Plainly, next to the field: what it is for, and that it is deleted once the refund is
 * made. That is also true (see `updateReturnStatus`), which is what makes it fine to say.
 *
 * The order reference and email are hidden fields because together they are the claim
 * ticket the server checks. The email is not a secret — the browser already holds it.
 */
export function ReturnOrder({
  order,
  email,
  hoursRemaining,
  onRequested,
}: {
  order: Order;
  /** The address the order was placed with, from the local claim ticket. */
  email: string;
  /** Time left in the returns window, already formatted ("1 day left"). */
  hoursRemaining: string;
  /** Lets the parent refetch, so the button becomes a status without a reload. */
  onRequested: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const [state, action, pending] = useActionState<ReturnRequestState, FormData>(
    async (previous, formData) => {
      const result = await requestReturnAction(previous, formData);

      // Keep the dialog open on an error so the field messages stay in view. On success,
      // close and refetch; the order then carries its return and shows its status.
      if (result.success) {
        setOpen(false);
        onRequested();
      }
      return result;
    },
    {},
  );

  const errors = state.fieldErrors ?? {};

  // Cash on delivery has no payment to send money back to, so those customers say where.
  // A prepaid order is refunded to what it was paid with; asking for a UPI ID too would only
  // invite a second, worse destination. The server applies the same rule.
  const needsUpi = order.paymentMethod === "cod";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 py-1 text-2xs uppercase tracking-[0.1em] text-content transition-colors hover:text-accent"
      >
        <ArrowUUpLeft size={12} aria-hidden />
        Return items
        <span className="normal-case tracking-normal text-content-subtle">
          · {hoursRemaining}
        </span>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Return order ${order.id}`}
        description={
          needsUpi ? "Tell us why, and where to send your refund." : "Tell us why you are returning it."
        }
        size="md"
      >
        <form action={action} className="flex flex-col gap-5" noValidate>
          <input type="hidden" name="id" value={order.id} />
          <input type="hidden" name="email" value={email} />

          {state.error ? (
            <p
              role="alert"
              className="border border-danger-500/40 bg-danger-500/5 p-3 text-sm leading-relaxed text-danger-500 dark:text-danger-100"
            >
              {state.error}
            </p>
          ) : null}

          <fieldset className="flex flex-col gap-2" aria-describedby="return-reason-error">
            <legend className="mb-1 text-2xs font-medium uppercase tracking-[0.12em] text-content-muted">
              Why are you returning it?
            </legend>

            {RETURN_REASONS.map((entry) => (
              <label
                key={entry.value}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-3 text-sm transition-colors",
                  reason === entry.value
                    ? "border-accent bg-accent-soft/50 text-content"
                    : "border-line-strong text-content hover:bg-surface-sunken",
                )}
              >
                <input
                  type="radio"
                  name="reason"
                  value={entry.value}
                  checked={reason === entry.value}
                  onChange={() => setReason(entry.value)}
                  className="size-4 accent-[var(--color-accent)]"
                />
                {entry.label}
              </label>
            ))}

            {errors.reason ? (
              <p id="return-reason-error" role="alert" className="text-xs text-danger-500 dark:text-danger-100">
                {errors.reason}
              </p>
            ) : null}
          </fieldset>

          <TextArea
            label={reason === "other" ? "Tell us more" : "Anything else we should know? (optional)"}
            name="details"
            rows={3}
            maxLength={MAX_RETURN_DETAILS}
            required={reason === "other"}
            error={errors.details}
          />

          {!needsUpi ? (
            <p className="border-t border-line pt-5 text-xs leading-relaxed text-content-muted">
              Once we have the items back, your refund goes to the payment method you paid with.
              Your bank can take a few working days to show it.
            </p>
          ) : (
          <div className="flex flex-col gap-4 border-t border-line pt-5">
            <div>
              <h3 className="text-sm font-semibold text-content">Where should we send your refund?</h3>
              <p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-content-muted">
                <LockSimple size={13} aria-hidden className="mt-0.5 shrink-0" />
                We use your UPI ID only to send this refund, and delete it once the refund has
                been made.
              </p>
            </div>

            <TextField
              label="Your UPI ID"
              name="upiId"
              type="text"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="name@bank"
              maxLength={100}
              error={errors.upiId}
              hint="For example 9876543210@ybl or asha@okaxis."
            />

            <TextField
              label="Enter it again to confirm"
              name="upiConfirm"
              type="text"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="name@bank"
              maxLength={100}
              error={errors.upiConfirm}
              hint="A mistyped ID would send your money to someone else, so please check it."
            />
          </div>
          )}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" size="md" onClick={() => setOpen(false)}>
              Not now
            </Button>
            <Button type="submit" size="md" disabled={pending} aria-busy={pending}>
              {pending ? "Sending…" : "Request return"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
