"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { load as loadCashfree } from "@cashfreepayments/cashfree-js";
import { Check, CircleNotch, Handbag, LockSimple, Truck } from "@phosphor-icons/react";
import { useCart } from "@/components/providers/cart-provider";
import { CartLineItem } from "@/components/cart/cart-line-item";
import { OrderSummary } from "@/components/cart/order-summary";
import { Button, ButtonLink } from "@/components/ui/button";
import { CheckoutSkeleton } from "@/components/ui/skeleton";
import { ComboboxField } from "@/components/ui/combobox";
import { Checkbox, SelectField, TextField } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";
import {
  codEligibility,
  placeOrder as submitOrder,
  type CodEligibility,
} from "@/app/actions/checkout";
import { useBrowserStore } from "@/hooks/use-store";
import { codAvailability, shippingCost } from "@/lib/cart-math";
import { deliveryWindow } from "@/lib/format";
import {
  formatAddressLine,
  isDeliverable,
  sameAddress,
  upsertAddress,
} from "@/lib/address";
import { STATE_OPTIONS, citySuggestions } from "@/lib/india";
import { rememberOrder } from "@/lib/orders";
import { addressStore } from "@/lib/stores";
import type { Address, PaymentMethod } from "@/lib/types";
import {
  email as validateEmail,
  phone as validatePhone,
  required,
  type Errors,
} from "@/lib/validation";

type DetailsField = "email" | "name" | "line1" | "city" | "region" | "phone" | "postalCode";

/**
 * Two-step checkout: contact and delivery, then payment.
 *
 * There was once a shipping step and a mock card-entry step. The first only
 * re-displayed the address this screen already collects and asked no real
 * question, since there is one shipping arrangement; the second was a card form
 * for a build that took no money. Both are gone, and card details are still
 * never entered here — a prepaid order hands off to Cashfree's own hosted page.
 *
 * ## Why payment is its own step
 *
 * Once there is more than one way to pay, the choice deserves the shopper's full
 * attention rather than a radio group below the phone field. Separating it also
 * puts the delivery address back in front of them for review at the moment they
 * commit, and gives the one thing COD needs that a single screen could not do
 * honestly: a place to check, before the button is pressed, whether the courier
 * will collect cash at their PIN code.
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
    rules,
    money,
    refreshFirstOrderOffer,
  } = useCart();

  // One shipping option, so the cost is derived rather than chosen.
  const shipping = shippingCost(summary.subtotal - summary.discount, rules);
  const deliveryDays = { min: rules.deliveryDaysMin, max: rules.deliveryDaysMax };

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /*
   * Warm the confirmation route before it is ever needed. Without this, the first
   * navigation to it — right after "Place order" — pays for compiling that route
   * (dev) or fetching its chunk (prod) on top of the order-lookup request, which is
   * what shows as a blank beat between the button's spinner and "Thank you." By the
   * time a shopper has finished filling in the form, this has long since resolved.
   */
  useEffect(() => {
    router.prefetch("/checkout/confirmation");
  }, [router]);

  const [details, setDetails] = useState({
    email: account.email,
    name: account.name,
    line1: "",
    city: "",
    region: "",
    phone: account.phone,
    postalCode: "",
  });
  const [detailErrors, setDetailErrors] = useState<Errors<DetailsField>>({});
  const [saveAddress, setSaveAddress] = useState(true);

  /**
   * Saved addresses, through the same hook the address book uses.
   *
   * Only deliverable entries are offered — one saved before the pincode field
   * existed cannot be shipped to, and prefilling the form from it would fail
   * validation for a reason the shopper cannot see. The address book flags those
   * so they can be fixed in one click.
   */
  const [allSaved] = useBrowserStore(addressStore);
  const savedAddresses = allSaved.filter(isDeliverable);

  /**
   * Which saved address the current form contents match, if any.
   *
   * Derived by comparing the form to each saved entry rather than tracking a
   * selected index, so editing a field after picking an address correctly
   * deselects it — the shopper is now entering something new, and highlighting a
   * saved address that no longer matches what is on screen would be a lie.
   */
  const currentAddress: Address = {
    name: details.name,
    line1: details.line1,
    city: details.city,
    region: details.region,
    phone: details.phone,
    postalCode: details.postalCode.trim(),
  };

  const selectedSaved = savedAddresses.findIndex((entry) =>
    sameAddress(entry, currentAddress),
  );

  // Not named `use…`: that prefix marks a hook, and this is an event handler.
  const applySavedAddress = (entry: Address) => {
    setDetails((current) => ({
      ...current,
      name: entry.name,
      line1: entry.line1,
      city: entry.city,
      region: entry.region,
      phone: entry.phone,
      postalCode: entry.postalCode ?? "",
    }));
    // Everything just changed, so any errors on those fields are stale.
    setDetailErrors({});
  };
  const [marketingOptIn, setMarketingOptIn] = useState(false);

  /** Which screen the shopper is on. */
  const [step, setStep] = useState<"details" | "payment">("details");

  /*
   * Prepaid unless the shopper says otherwise. `codAvailability` answers only
   * the merchant's own rules — the pincode question is Delhivery's, asked by
   * `codEligibility` below and re-checked authoritatively in `placeOrder`.
   */
  const [requestedPayment, setRequestedPayment] = useState<PaymentMethod>("prepaid");
  const codByBasket = codAvailability(summary.subtotal - summary.discount, rules);

  /**
   * Delhivery's answer for the entered PIN code.
   *
   * `null` while it has not been asked yet. COD stays selectable during the
   * lookup — blocking the option behind a network call would make the common
   * case feel slow, and `placeOrder` is the real gate anyway.
   */
  const [codByPincode, setCodByPincode] = useState<CodEligibility | null>(null);
  const [checkingCod, setCheckingCod] = useState(false);

  /*
   * Both gates, combined. The basket rules are local and instant; the pincode
   * answer arrives a moment later and can only ever narrow the result.
   */
  const cod: { available: boolean; reason?: string } = !codByBasket.available
    ? codByBasket
    : codByPincode && !codByPincode.available
      ? { available: false, reason: codByPincode.reason }
      : { available: true };

  /*
   * Derived rather than synchronised. If the basket moves out of the COD window
   * — a line removed, a promo code applied — the effective method falls back on
   * the next render instead of through an effect that writes state and cascades
   * a second one. The shopper's stated preference is kept, so putting the basket
   * back restores their choice.
   */
  const paymentMethod: PaymentMethod =
    requestedPayment === "cod" && cod.available ? "cod" : "prepaid";

  // Shown on the button, so it has to include the COD fee.
  const payableTotal = summary.total + (paymentMethod === "cod" ? rules.codFee : 0);

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
      postalCode: !/^\d{6}$/.test(details.postalCode.trim())
        ? "Enter a valid 6-digit pincode"
        : undefined,
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
   * Submit the order, then hand off to Cashfree.
   *
   * Only the shopper's intent is sent — variant ids and quantities. The server looks
   * up the prices, recomputes the totals, opens a Cashfree payment session against
   * that server-computed total, and writes the order as `pending`. What comes back
   * is a `paymentSessionId` this screen uses to launch Cashfree's own hosted checkout
   * — card, UPI and netbanking details are entered there, never on this page, and
   * never reach this app's servers.
   *
   * The cart is not cleared and the claim ticket is written before the redirect, not
   * after payment succeeds — the same reasoning `ConfirmationView` already documents
   * for clearing the cart: the order record exists and can be looked up regardless of
   * what happens next on Cashfree's page, so the shopper must be able to find their
   * way back to it (retry payment, or just check status) even if they abandon the
   * hosted checkout or close the tab.
   */
  /**
   * Leave the details screen for the payment screen.
   *
   * Validation happens here rather than on the final button, so the shopper
   * cannot reach a payment choice with an address that will be rejected after
   * they have committed to paying.
   */
  const handleContinueToPayment = () => {
    if (!validateDetails()) return;

    setSubmitError(null);
    setStep("payment");

    /*
     * The form is taller than a phone screen, so without this the shopper is
     * left looking at whatever was under their thumb and the new step appears
     * not to have happened. `html` already carries `scroll-behavior: smooth`.
     */
    window.scrollTo({ top: 0 });

    // Only worth asking when COD could actually be offered.
    if (!rules.codEnabled || !codByBasket.available) return;

    setCheckingCod(true);
    setCodByPincode(null);

    /*
     * Fire and forget. A failure leaves `codByPincode` null, which keeps COD
     * selectable — `placeOrder` re-checks it, so the worst case is a clear
     * refusal at submit rather than a silently withheld option.
     */
    codEligibility(details.postalCode.trim())
      .then(setCodByPincode)
      .catch((error) => {
        console.error("[checkout] COD eligibility lookup failed:", error);
      })
      .finally(() => setCheckingCod(false));
  };

  const handlePlaceOrder = async () => {
    if (!validateDetails()) {
      // Shouldn't happen from the payment screen, but an invalid address must
      // never reach the server — send them back to the fields that are wrong.
      setStep("details");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const address: Address = {
      name: details.name,
      line1: details.line1,
      city: details.city,
      region: details.region,
      phone: details.phone,
      postalCode: details.postalCode.trim(),
    };

    try {
      const result = await submitOrder({
        email: details.email,
        address,
        promoCode,
        paymentMethod,
        // Tells the server the total on screen had the discount in it, so it refuses
        // rather than charge more if it cannot be given.
        expectFirstOrder: Boolean(summary.firstOrder),
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
        // The discount may have just been used or held, which changes the total. Ask again
        // so the figure on screen is the one that will be charged, not the one that failed.
        if (summary.firstOrder) void refreshFirstOrderOffer();
        return;
      }

      // Past this point the order exists, so nothing below may fail the submit.

      // The claim ticket. Without this the confirmation page cannot read the order
      // back, because a guest has no account to authenticate against.
      rememberOrder({
        id: result.orderId,
        email: details.email.trim().toLowerCase(),
        placedAt: new Date().toISOString(),
      });

      if (saveAddress) {
        /*
         * `upsertAddress` compares every field that makes a delivery distinct,
         * so checking out twice to one address keeps one entry, and a genuinely
         * new address on the same street is no longer silently discarded — which
         * is what the old line-1-plus-city match did.
         *
         * It returns the same array reference when nothing changed, so a repeat
         * order to the default address writes nothing.
         */
        const saved = addressStore.read();
        const next = upsertAddress(saved, address);
        if (next !== saved) addressStore.write(next);
      }

      /*
       * Cash on delivery is already final — there is no payment to collect, so
       * there is nothing to hand to Cashfree. Straight to the confirmation,
       * which reads the order back through the claim ticket written above.
       */
      if (result.paymentMethod === "cod") {
        router.push(`/checkout/confirmation?order=${result.orderId}`);
        return;
      }

      const cashfree = await loadCashfree({ mode: result.environment });
      if (!cashfree) {
        // `load` resolves null outside a browser, which cannot happen in a click
        // handler — but a script blocked by an extension or a CSP is a real failure
        // mode, and the order already exists, so send the shopper to a page that can
        // still find it and offer a retry rather than stranding them here.
        console.error("[checkout] Cashfree.js failed to load — redirecting without payment.");
        router.push(`/checkout/confirmation?order=${result.orderId}`);
        return;
      }

      // Launches Cashfree's hosted checkout. With `redirectTarget: "_self"` this
      // navigates the current tab away on success and the code below never runs —
      // if it *does* return, something did not redirect, which is worth knowing
      // rather than silently swallowing.
      const checkoutResult = await cashfree.checkout({
        paymentSessionId: result.paymentSessionId,
        redirectTarget: "_self",
      });

      if (checkoutResult?.error) {
        console.error("[checkout] Cashfree checkout error:", checkoutResult.error);
        setSubmitError(
          checkoutResult.error.message ||
            "We could not open the payment page. Please try again.",
        );
        setSubmitting(false);
      }
    } catch (error) {
      console.error("[checkout] placeOrder/Cashfree redirect failed:", error);
      setSubmitError(
        "We could not reach the server. Nothing has been charged — please try again.",
      );
      setSubmitting(false);
    }
  };

  if (!hydrated) {
    return <CheckoutSkeleton />;
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

      {/*
        Two steps, so where the shopper is has to be legible. Rendered as an
        ordered list rather than decorative divs, so it reads as a sequence to a
        screen reader too.
      */}
      <ol className="mt-6 flex items-center gap-3 text-2xs uppercase tracking-[0.12em]">
        {(["details", "payment"] as const).map((name, index) => {
          const current = step === name;
          const done = step === "payment" && name === "details";

          return (
            <li key={name} className="flex items-center gap-3">
              {index > 0 ? (
                <span aria-hidden className="h-px w-6 bg-line sm:w-10" />
              ) : null}
              <span
                aria-current={current ? "step" : undefined}
                className={
                  current
                    ? "text-content"
                    : done
                      ? "text-content-muted"
                      : "text-content-subtle"
                }
              >
                {index + 1}. {name === "details" ? "Delivery" : "Payment"}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-8 grid items-start gap-10 lg:grid-cols-[1fr_22rem] lg:gap-16">
        <div className="min-w-0">
            <section
              aria-labelledby="step-details"
              hidden={step !== "details"}
            >
              <h2 id="step-details" className="text-2xl leading-tight">
                Contact & delivery
              </h2>

              {/*
                Saved addresses, when there are any. Above the fields rather than
                beside them: the whole point is that a returning shopper can pick
                one and never look at the form at all.
              */}
              {savedAddresses.length > 0 ? (
                <div className="mt-6">
                  <h3 className="eyebrow mb-3">Deliver to a saved address</h3>

                  <ul className="grid gap-3 sm:grid-cols-2">
                    {savedAddresses.map((entry, index) => {
                      const selected = index === selectedSaved;

                      return (
                        <li key={`${entry.line1}-${index}`}>
                          <button
                            type="button"
                            onClick={() => applySavedAddress(entry)}
                            aria-pressed={selected}
                            className={`flex h-full w-full flex-col border p-4 text-left transition-colors ${
                              selected
                                ? "border-content bg-surface-sunken"
                                : "border-line hover:border-content-subtle"
                            }`}
                          >
                            <span className="flex w-full items-start justify-between gap-3">
                              <span className="font-sans text-sm font-medium text-content">
                                {entry.name}
                              </span>
                              {index === 0 ? (
                                <span className="shrink-0 text-2xs uppercase tracking-[0.12em] text-content-subtle">
                                  Default
                                </span>
                              ) : null}
                            </span>

                            <span className="mt-1.5 text-xs leading-relaxed text-content-muted">
                              {formatAddressLine(entry)}
                            </span>
                            <span
                              data-numeric
                              className="mt-1 text-xs text-content-muted"
                            >
                              {entry.phone}
                            </span>

                            {selected ? (
                              <span className="mt-2.5 inline-flex items-center gap-1.5 text-2xs uppercase tracking-[0.1em] text-content">
                                <Check size={12} weight="bold" aria-hidden />
                                Delivering here
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>

                  <p className="mt-4 text-xs text-content-muted">
                    Or {selectedSaved >= 0 ? "edit the" : "fill in the"} details below to
                    deliver somewhere else.
                  </p>
                </div>
              ) : null}

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
                  label="Pincode"
                  type="text"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  placeholder="385001"
                  maxLength={6}
                  value={details.postalCode}
                  onChange={(event) => setDetail("postalCode", event.target.value.replace(/\D/g, ''))}
                  error={detailErrors.postalCode}
                  hint="6-digit postal code for accurate delivery"
                  required
                />

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

                {submitError && step === "details" ? (
                  <p
                    role="alert"
                    className="border border-danger-500/40 bg-danger-500/5 p-4 text-sm leading-relaxed text-danger-500 dark:text-danger-100"
                  >
                    {submitError}
                  </p>
                ) : null}

                <Button size="lg" onClick={handleContinueToPayment}>
                  Continue to payment
                </Button>
              </div>
            </section>

            {/* ---- Step two: payment ------------------------------------ */}

            <section aria-labelledby="step-payment" hidden={step !== "payment"}>
              <h2 id="step-payment" className="text-2xl leading-tight">
                Payment
              </h2>

              <div className="mt-6 flex flex-col gap-5">
                {/*
                  The address back in front of them at the moment of commitment.
                  A wrong pincode is the most expensive mistake available on this
                  page — it is what a COD refusal and a returned parcel both come
                  from — so it is shown rather than assumed remembered.
                */}
                <div className="flex items-start justify-between gap-4 border border-line bg-surface-sunken p-5">
                  <div>
                    <h3 className="eyebrow mb-2">Delivering to</h3>
                    <address className="text-sm not-italic leading-relaxed text-content-muted">
                      <span className="text-content">{details.name}</span>
                      <br />
                      {details.line1}
                      <br />
                      {details.city}
                      {details.region ? `, ${details.region}` : ""}
                      <br />
                      <span data-numeric>{details.postalCode}</span>
                      <br />
                      <span data-numeric>{details.phone}</span>
                    </address>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setStep("details");
                      window.scrollTo({ top: 0 });
                    }}
                    className="shrink-0 text-2xs uppercase tracking-[0.1em] text-content-muted transition-colors hover:text-content"
                  >
                    <span className="link-underline">Edit</span>
                  </button>
                </div>

                <fieldset className="flex flex-col gap-3">
                  <legend className="eyebrow mb-3">How would you like to pay?</legend>

                  <label
                    className={`flex cursor-pointer items-start gap-3 border p-5 transition-colors ${
                      paymentMethod === "prepaid"
                        ? "border-content bg-surface-sunken"
                        : "border-line hover:border-content-subtle"
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="prepaid"
                      checked={paymentMethod === "prepaid"}
                      onChange={() => setRequestedPayment("prepaid")}
                      className="mt-1 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-medium text-content">Pay now</span>
                        <span data-numeric className="text-sm">
                          {money(summary.total)}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-content-muted">
                        Card, UPI, netbanking or wallet. Entered on Cashfree&rsquo;s
                        secure page — your card details never reach us.
                      </span>
                    </span>
                  </label>

                  {/*
                    Only offered when the shop has COD switched on. A disabled
                    option with an explanation is better than a hidden one: a
                    shopper who expected COD learns why it is not there.
                  */}
                  {rules.codEnabled ? (
                    <label
                      className={`flex items-start gap-3 border p-5 transition-colors ${
                        !cod.available
                          ? "cursor-not-allowed border-line opacity-60"
                          : paymentMethod === "cod"
                            ? "cursor-pointer border-content bg-surface-sunken"
                            : "cursor-pointer border-line hover:border-content-subtle"
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="cod"
                        checked={paymentMethod === "cod"}
                        onChange={() => setRequestedPayment("cod")}
                        disabled={!cod.available}
                        className="mt-1 shrink-0"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-sm font-medium text-content">
                            Cash on delivery
                          </span>
                          <span data-numeric className="text-sm">
                            {money(summary.total + rules.codFee)}
                          </span>
                        </span>

                        <span className="mt-1 block text-xs leading-relaxed text-content-muted">
                          {checkingCod ? (
                            "Checking availability at your PIN code…"
                          ) : cod.available ? (
                            <>
                              Pay the courier when the parcel arrives. Keep the exact
                              amount ready — couriers rarely carry change.
                              {rules.codFee > 0
                                ? ` Includes a ${money(rules.codFee)} handling fee.`
                                : ""}
                            </>
                          ) : (
                            cod.reason
                          )}
                        </span>
                      </span>
                    </label>
                  ) : null}
                </fieldset>

                {submitError && step === "payment" ? (
                  <p
                    role="alert"
                    className="border border-danger-500/40 bg-danger-500/5 p-4 text-sm leading-relaxed text-danger-500 dark:text-danger-100"
                  >
                    {submitError}
                  </p>
                ) : null}

                <Button
                  size="lg"
                  onClick={handlePlaceOrder}
                  disabled={submitting}
                  aria-busy={submitting}
                >
                  {submitting ? (
                    <CircleNotch size={14} aria-hidden className="animate-spin" />
                  ) : (
                    <LockSimple size={14} weight="fill" aria-hidden />
                  )}
                  {submitting
                    ? "Placing order…"
                    : paymentMethod === "cod"
                      ? `Place order — pay ${money(payableTotal)} on delivery`
                      : `Pay ${money(payableTotal)}`}
                </Button>

                <p className="text-xs leading-relaxed text-content-subtle">
                  By placing this order you agree to our{" "}
                  <Link href="/terms" className="link-underline">
                    Terms &amp; Conditions
                  </Link>
                  ,{" "}
                  <Link href="/privacy" className="link-underline">
                    Privacy Policy
                  </Link>
                  ,{" "}
                  <Link href="/return-exchange-policy" className="link-underline">
                    Return &amp; Exchange Policy
                  </Link>{" "}
                  and{" "}
                  <Link href="/refund-cancellation-policy" className="link-underline">
                    Refund &amp; Cancellation Policy
                  </Link>
                  .
                </p>
              </div>
            </section>

        </div>

        {/* Sticky summary */}
        <aside className="lg:sticky lg:top-28">
          <OrderSummary
            showShipping
            // Only once COD is actually the selected method, so the summary and
            // the button never disagree about what is payable.
            codFee={paymentMethod === "cod" ? rules.codFee : 0}
            className="border border-line"
          />

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
