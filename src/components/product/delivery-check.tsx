"use client";

import { useActionState } from "react";
import { CheckCircle, MapPin, Truck, WarningCircle } from "@phosphor-icons/react";
import {
  estimateDeliveryAction,
  type DeliveryEstimateState,
} from "@/app/actions/delivery";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";

/**
 * "Check delivery to your PIN code" on the product page.
 *
 * A form with a server action rather than a fetch-on-keystroke lookup: the courier call
 * is rate-limited and cached per pincode, and a shopper typing six digits would fire five
 * useless requests on the way. It also means the whole thing works before hydration.
 *
 * The copy adapts to how much was actually established, which is the point — the default
 * delivery promise is always shown, and a serviceability claim appears only when Delhivery
 * confirmed one. When no courier token is configured the estimate still renders, labelled
 * as an estimate, so the feature is useful before the account exists.
 */
export function DeliveryCheck({
  daysMin,
  daysMax,
}: {
  /** The standing promise, shown before anyone types anything. */
  daysMin: number;
  daysMax: number;
}) {
  const [state, action] = useActionState<DeliveryEstimateState, FormData>(
    estimateDeliveryAction,
    {},
  );

  const result = state.result;
  const unserviceable = result?.serviceable === false;

  return (
    <div className="mt-8 border border-line bg-surface-sunken p-4">
      <div className="flex items-center gap-2">
        <Truck size={16} aria-hidden className="shrink-0 text-content-muted" />
        <p className="text-2xs font-medium uppercase tracking-[0.12em] text-content">
          Delivery
        </p>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-content-muted">
        {daysMin}–{daysMax} business days, tracked. Check your PIN code for a date.
      </p>

      <form action={action} className="mt-3 flex items-start gap-2">
        <TextField
          label="PIN code"
          name="pincode"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          placeholder="400001"
          error={state.error}
          className="flex-1"
        />
        <Button type="submit" variant="outline" size="md" className="mt-6 shrink-0">
          Check
        </Button>
      </form>

      {result ? (
        <div
          // Announced, because the answer appears well below where the eye is.
          role="status"
          aria-live="polite"
          className="mt-3 border-t border-line pt-3"
        >
          {unserviceable ? (
            <p className="flex items-start gap-2 text-sm leading-relaxed text-danger-500 dark:text-danger-100">
              <WarningCircle size={15} aria-hidden className="mt-0.5 shrink-0" />
              <span>
                We cannot deliver to {result.pincode} yet. Contact us and we will look for
                a way.
              </span>
            </p>
          ) : (
            <div className="flex items-start gap-2">
              {result.serviceable ? (
                <CheckCircle
                  size={15}
                  weight="fill"
                  aria-hidden
                  className="mt-0.5 shrink-0 text-success-700 dark:text-success-500"
                />
              ) : (
                <MapPin size={15} aria-hidden className="mt-0.5 shrink-0 text-content-muted" />
              )}

              <div className="text-sm leading-relaxed">
                <p className="text-content">
                  Arrives {result.window}
                  {result.place ? (
                    <span className="text-content-muted"> to {result.place}</span>
                  ) : null}
                </p>

                {/*
                  Said plainly rather than hidden. A date presented as confirmed when the
                  courier was never asked is the kind of small dishonesty that turns into
                  a support ticket.
                */}
                <p className="mt-1 text-xs text-content-subtle">
                  {result.estimateOnly
                    ? `Estimated from our standard ${result.daysMin}–${result.daysMax} business day dispatch.`
                    : "Serviceable by our courier."}
                  {result.cashOnDelivery === true ? " Cash on delivery available." : ""}
                </p>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
