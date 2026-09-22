"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Handbag, LockSimple, Truck } from "@phosphor-icons/react";
import { useCart } from "@/components/providers/cart-provider";
import { CartLineItem } from "@/components/cart/cart-line-item";
import { OrderSummary } from "@/components/cart/order-summary";
import { Button, ButtonLink } from "@/components/ui/button";
import { ComboboxField } from "@/components/ui/combobox";
import { Checkbox, SelectField, TextField } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";
import { placeOrder as submitOrder } from "@/app/actions/checkout";
import { shippingCost } from "@/lib/cart-math";
import { deliveryWindow } from "@/lib/format";
import { STATE_OPTIONS, citySuggestions } from "@/lib/india";
import { rememberOrder } from "@/lib/orders";
import { addressStore } from "@/lib/stores";
import type { Address } from "@/lib/types";
import {
  email as validateEmail,
  phone as validatePhone,
  required,
  type Errors,
} from "@/lib/validation";

type DetailsField = "email" | "name" | "line1" | "city" | "region" | "phone";

/**
 * Single-step checkout.
 *
 * Contact and delivery are collected on one screen and the order is placed from it.
 * There was once a shipping step and a payment step; the first only re-displayed the
 * address this screen already collects, and there is one shipping arrangement so it
 * asked no real question, while the second was a mock card form for a build that takes
 * no money. Both are gone. When a payment provider is wired up, reintroduce a payment
 * step here and authorise the charge in `placeOrder` before the order is recorded.
 *
 * Fields are validated on submit rather than on every keystroke, so the shopper is not
 * scolded mid-typing; each error clears as soon as its field changes.
 */
/**
 * The signed-in shopper, passed from the server-gated checkout page. Checkout is only
 * reachable when authenticated, so this is always present — it prefills the contact
 * step with what the account already knows rather than making the shopper retype it.
 */
export interface CheckoutAccount {
  name: string;
  email: string;
  phone: string;
}

export function CheckoutFlow({ account }: { account: CheckoutAccount }) {
  const router = useRouter();
  const {
    lines,
    count,
    summary,
    hydrated,
    promoCode,
    clearCart,
    rules,
    money,
  } = useCart();

  // One shipping option, so the cost is derived rather than chosen.
  const shipping = shippingCost(summary.subtotal - summary.discount, rules);
  const deliveryDays = { min: rules.deliveryDaysMin, max: rules.deliveryDaysMax };

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [details, setDetails] = useState({
    email: account.email,
    name: account.name,
    line1: "",
    city: "",
    region: "",
    phone: account.phone,
  });
  const [detailErrors, setDetailErrors] = useState<Errors<DetailsField>>({});
  const [saveAddress, setSaveAddress] = useState(true);
  const [marketingOptIn, setMarketingOptIn] = useState(false);

  const setDetail = (field: keyof typeof details, value: string) => {
    setDetails((current) => ({ ...current, [field]: value }));
    setDetailErrors((current) => ({ ...current, [field]: undefined }));
  };

  const validateDetails = (): boolean => {
    const next: Errors<DetailsField> = {
      email: validateEmail(details.email) ?? undefined,
      name: required(details.name, "Full name") ?? undefined,
      line1: required(details.line1, "Address") ?? undefined,
      city: required(details.city, "City") ?? undefined,
      region: required(details.region, "State or county") ?? undefined,
      // Not optional: it is the only contact route left on the parcel.
      phone: validatePhone(details.phone, false) ?? undefined,
    };

    const cleaned = Object.fromEntries(
      Object.entries(next).filter(([, value]) => Boolean(value)),
    ) as Errors<DetailsField>;

    setDetailErrors(cleaned);
    return Object.keys(cleaned).length === 0;
  };

  /**
   * Submit the order.
   *
   * Only the shopper's intent is sent — variant ids and quantities. The server
   * looks up the prices, recomputes the totals and writes the
   * order, so the figures shown here are a quote rather than an instruction.
   */
  const handlePlaceOrder = async () => {
    if (!validateDetails()) return;

    setSubmitting(true);
    setSubmitError(null);

    const address: Address = {
      name: details.name,
      line1: details.line1,
      city: details.city,
      region: details.region,
      phone: details.phone,
    };

    try {
      const result = await submitOrder({
        email: details.email,
        address,
        promoCode,
        items: lines.map((line) => ({
          productId: line.productId,
          colorId: line.colorId,
          size: line.size,
          quantity: line.quantity,
        })),
      });

      if (!result.ok) {
        setSubmitError(result.error);
        setSubmitting(false);
        return;
      }

      // The claim ticket. Without this the confirmation page cannot read the order
      // back, because a guest has no account to authenticate against.
      rememberOrder({
        id: result.orderId,
        email: details.email.trim().toLowerCase(),
        placedAt: new Date().toISOString(),
      });

      if (saveAddress) {
        const saved = addressStore.read();
        /*
          Matched on line 1 plus city now that there is no postcode. Slightly looser,
          which is the right way to be wrong here: a duplicate in the address book is a
          minor annoyance, whereas failing to save the address means retyping it.
        */
        const duplicate = saved.some(
          (entry) =>
            entry.line1.trim().toLowerCase() === address.line1.trim().toLowerCase() &&
            entry.city.trim().toLowerCase() === address.city.trim().toLowerCase(),
        );
        if (!duplicate) addressStore.write([...saved, address]);
      }

      // Clear only once the order is safely recorded, so a failure never loses a bag.
      clearCart();
      router.push(`/checkout/confirmation?order=${result.orderId}`);
    } catch {
      setSubmitError(
        "We could not reach the server. Nothing has been charged — please try again.",
      );
      setSubmitting(false);
    }
  };

  if (!hydrated) {
    return (
      <div className="page-gutter mx-auto max-w-page py-16">
        <div className="h-8 w-40 animate-shimmer bg-surface-sunken" />
        <div className="mt-10 h-96 animate-shimmer bg-surface-sunken" />
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="page-gutter mx-auto max-w-page py-10">
        <EmptyState
          icon={<Handbag size={24} aria-hidden />}
          title="There is nothing to check out"
          description="Your bag is empty. Add a piece and it will appear here."
        >
          <ButtonLink href="/shop" size="md">
            Browse all clothing
          </ButtonLink>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="page-gutter mx-auto max-w-page py-8 lg:py-12">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl leading-tight sm:text-4xl">Checkout</h1>
        <Link
          href="/cart"
          className="link-underline text-2xs uppercase tracking-[0.12em] text-content-muted hover:text-content"
        >
          Back to bag
        </Link>
      </header>

      <div className="mt-10 grid items-start gap-10 lg:grid-cols-[1fr_22rem] lg:gap-16">
        <div className="min-w-0">
            <section aria-labelledby="step-details">
              <h2 id="step-details" className="text-2xl leading-tight">
                Contact & delivery
              </h2>

              <div className="mt-6 flex flex-col gap-5">
                <TextField
                  label="Email address"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={details.email}
                  onChange={(event) => setDetail("email", event.target.value)}
                  error={detailErrors.email}
                  hint="For your order confirmation and delivery updates."
                  required
                />

                <TextField
                  label="Full name"
                  autoComplete="name"
                  value={details.name}
                  onChange={(event) => setDetail("name", event.target.value)}
                  error={detailErrors.name}
                  required
                />

                <TextField
                  label="Address"
                  autoComplete="street-address"
                  value={details.line1}
                  onChange={(event) => setDetail("line1", event.target.value)}
                  error={detailErrors.line1}
                  required
                />

                {/*
                  State before city, and state is a closed dropdown — 28 states plus 8
                  union territories, which is the whole of India and never changes.
                  Picking it first narrows the city suggestions to that state.

                  City stays free text with suggestions. A strict list short enough to
                  ship on a checkout page will always be missing somebody's town, and a
                  field that cannot express where a shopper lives is an order they cannot
                  place.
                */}
                <div className="grid gap-5 sm:grid-cols-2">
                  <SelectField
                    label="State"
                    options={STATE_OPTIONS}
                    value={details.region}
                    onValueChange={(next) => setDetail("region", next)}
                    error={detailErrors.region}
                    placeholder="Select a state"
                    required
                  />
                  <ComboboxField
                    label="City"
                    suggestions={citySuggestions(details.region)}
                    value={details.city}
                    onValueChange={(next) => setDetail("city", next)}
                    error={detailErrors.city}
                    placeholder="Start typing"
                    hint={
                      details.region
                        ? undefined
                        : "Pick a state first to narrow the suggestions."
                    }
                    required
                  />
                </div>

                <TextField
                  label="Phone number"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={details.phone}
                  onChange={(event) => setDetail("phone", event.target.value)}
                  error={detailErrors.phone}
                  hint="Required — how the courier reaches you if there is a problem."
                  required
                />

                <div className="flex flex-col gap-3 border-t border-line pt-5">
                  <Checkbox
                    label="Save this address to my account"
                    checked={saveAddress}
                    onChange={(event) => setSaveAddress(event.target.checked)}
                  />
                  <Checkbox
                    label="Email me about new pieces and restocks"
                    hint="Twice a month at most. One click to leave."
                    checked={marketingOptIn}
                    onChange={(event) => setMarketingOptIn(event.target.checked)}
                  />
                </div>

                {/*
                  Delivery is stated, not chosen. There is one shipping arrangement, so
                  presenting a radio group of one would be asking a question with a single
                  answer — and asking it implies a faster option is being withheld. The
                  cost is priced through the same function the server uses.
                */}
                <div className="flex items-start justify-between gap-4 border border-line bg-surface-sunken p-5">
                  <div className="flex items-start gap-3">
                    <Truck size={18} aria-hidden className="mt-0.5 shrink-0 text-content-muted" />
                    <div>
                      <p className="text-sm font-medium text-content">
                        Arrives {deliveryWindow(deliveryDays.min, deliveryDays.max)}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-content-muted">
                        {deliveryDays.min}–{deliveryDays.max} business days, tracked. You
                        will get the tracking number by email when it ships.
                      </p>
                    </div>
                  </div>

                  <p className="shrink-0 text-sm">
                    {shipping === 0 ? (
                      <span className="text-success-700 dark:text-success-500">
                        Complimentary
                      </span>
                    ) : (
                      money(shipping)
                    )}
                  </p>
                </div>

                {submitError ? (
                  <p
                    role="alert"
                    className="border border-danger-500/40 bg-danger-500/5 p-4 text-sm leading-relaxed text-danger-500 dark:text-danger-100"
                  >
                    {submitError}
                  </p>
                ) : null}

                {/*
                  One screen, so this is where the order is placed. The bag is listed in
                  the sticky summary beside this column and in the panel below it, so the
                  shopper can still check what they are buying before committing.
                */}
                <Button size="lg" onClick={handlePlaceOrder} disabled={submitting}>
                  <LockSimple size={14} weight="fill" aria-hidden />
                  {submitting ? "Placing order…" : `Place order — ${money(summary.total)}`}
                </Button>

                <p className="text-xs leading-relaxed text-content-subtle">
                  By placing this order you agree to our{" "}
                  <Link href="/terms" className="link-underline">
                    terms of sale
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" className="link-underline">
                    privacy policy
                  </Link>
                  .
                </p>
              </div>
            </section>

        </div>

        {/* Sticky summary */}
        <aside className="lg:sticky lg:top-28">
          <OrderSummary showShipping className="border border-line" />

          <details className="mt-4 border border-line bg-surface">
            <summary className="cursor-pointer px-5 py-4 text-2xs font-medium uppercase tracking-[0.12em]">
              {count} {count === 1 ? "item" : "items"} in this order
            </summary>
            <ul className="divide-y divide-line px-5 pb-2">
              {lines.map((line) => (
                <CartLineItem key={line.id} line={line} readOnly />
              ))}
            </ul>
          </details>
        </aside>
      </div>
    </div>
  );
}
