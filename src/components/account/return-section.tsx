"use client";

import { ArrowUUpLeft } from "@phosphor-icons/react";
import { customerReturnLabel } from "@/lib/return-flow";
import { formatHoursRemaining, returnEligibility } from "@/lib/returns";
import type { Order } from "@/lib/types";
import { ReturnOrder } from "./return-order";

/**
 * What to show about returns on one delivered order.
 *
 * Exactly one of three things:
 *
 * 1. **A return already raised:** its status in plain words, and where the refund is going
 *    (the masked UPI ID), so the customer can see it was recorded and recognise the
 *    destination. A *cancelled* return does not count — it is treated as no return, so the
 *    customer is free to ask again.
 * 2. **The button**, while the returns window is open, with how long is left.
 * 3. **A short note** that the window has closed.
 *
 * The window is checked here only to decide what to show. The server checks it again when
 * the form is submitted (`requestReturnAction`), so a stale page or a crafted request
 * cannot get a return the policy does not allow.
 */
export function ReturnSection({
  order,
  email,
  windowHours,
  onRequested,
}: {
  order: Order;
  email: string;
  windowHours: number;
  onRequested: () => void;
}) {
  const existing =
    order.returnRequest && order.returnRequest.status !== "cancelled"
      ? order.returnRequest
      : undefined;

  if (existing) {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-content-muted">
        <ArrowUUpLeft size={12} aria-hidden />
        <span className="uppercase tracking-[0.1em] text-content">
          {customerReturnLabel(existing.status)}
        </span>
        {existing.refundHint && existing.status !== "rejected" ? (
          <span className="normal-case tracking-normal">
            Refund to {existing.refundHint}
          </span>
        ) : null}
      </span>
    );
  }

  // `now` is read once per render. It decides a label, not a security question.
  const eligibility = returnEligibility(order, windowHours);

  if (eligibility.eligible) {
    return (
      <ReturnOrder
        order={order}
        email={email}
        hoursRemaining={formatHoursRemaining(eligibility.hoursRemaining)}
        onRequested={onRequested}
      />
    );
  }

  // Only say so when it was the window that closed. Anything else (returns switched off,
  // an order with no delivery date) is not worth a line on the customer's page.
  if (/closed/i.test(eligibility.reason)) {
    return <span className="text-2xs text-content-subtle">Return window closed</span>;
  }

  return null;
}
