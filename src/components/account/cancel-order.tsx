"use client";

import { useActionState, useState } from "react";
import { Prohibit } from "@phosphor-icons/react";
import { cancelOrderAction, type CancelOrderState } from "@/app/actions/orders";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import type { Order } from "@/lib/types";

/**
 * Customer-initiated cancellation.
 *
 * Only offered while an order is `processing`. Once a parcel is with a courier there is
 * nothing a button can do about it, and offering one would leave the customer believing
 * a delivery had been stopped when it had not — so the caller renders this conditionally
 * and the server refuses the transition independently.
 *
 * Behind a confirmation dialog because it cannot be undone: the status table makes
 * `cancelled` terminal, so there is no path back to `processing`.
 *
 * The email travels in a hidden field because it is half of the claim ticket the server
 * checks. It is not a secret — the browser already holds it — but pairing it with the
 * reference is what stops a stranger cancelling orders by guessing references.
 */
export function CancelOrder({
  order,
  email,
  onCancelled,
}: {
  order: Order;
  /** The address the order was placed with, from the local claim ticket. */
  email: string;
  /** Lets the parent refetch, so the badge updates without a reload. */
  onCancelled: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<CancelOrderState, FormData>(
    async (previous, formData) => {
      const result = await cancelOrderAction(previous, formData);
      // Close and refresh only on success, so an error stays visible in the dialog.
      if (result.success) {
        setOpen(false);
        onCancelled();
      }
      return result;
    },
    {},
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 py-1 text-2xs uppercase tracking-[0.1em] text-content-muted transition-colors hover:text-danger-500"
      >
        <Prohibit size={12} aria-hidden />
        Cancel order
      </button>

      {state.error && !open ? (
        <p role="alert" className="mt-2 text-xs text-danger-500">
          {state.error}
        </p>
      ) : null}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Cancel order ${order.id}?`}
        size="sm"
      >
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={order.id} />
          <input type="hidden" name="email" value={email} />

          <p className="text-sm leading-relaxed text-content-muted">
            This cannot be undone. If you have already been charged, the refund is issued
            to your original payment method.
          </p>

          {state.error ? (
            <p
              role="alert"
              className="border border-danger-500/40 bg-danger-500/5 p-3 text-sm leading-relaxed text-danger-500 dark:text-danger-100"
            >
              {state.error}
            </p>
          ) : null}

          <TextArea
            label="Why are you cancelling?"
            name="reason"
            rows={3}
            required
            maxLength={300}
            hint="This helps us fix whatever went wrong."
          />

          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" size="md" onClick={() => setOpen(false)}>
              Keep my order
            </Button>
            <Button type="submit" variant="danger" size="md">
              Cancel order
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
