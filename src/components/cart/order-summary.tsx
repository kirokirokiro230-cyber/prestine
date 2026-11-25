"use client";

import { useState } from "react";
import Link from "next/link";
import { Tag, X } from "@phosphor-icons/react";
import { useCart } from "@/components/providers/cart-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { ConfettiBurst } from "@/components/ui/confetti-burst";
import { applyPromo, savingsFromMarkdowns } from "@/lib/cart-math";
import { firstOrderAmount } from "@/lib/first-order";
import { cn } from "@/lib/utils";
import { FreeShippingMeter } from "./free-shipping-meter";

/**
 * Order totals with promo entry.
 *
 * Reused on the cart page and in checkout. `showShipping` is off before a
 * shipping method is chosen so the shopper is not shown a number that is about to
 * change — the honest label is "calculated at the next step".
 */
export function OrderSummary({
  showShipping = false,
  showPromo = true,
  codFee = 0,
  children,
  className,
}: {
  showShipping?: boolean;
  showPromo?: boolean;
  /**
   * COD handling fee to include, in minor units.
   *
   * Passed in by the checkout's payment step rather than read from the cart,
   * because it depends on which method is selected there — and the cart page,
   * where nothing has been chosen yet, must not quote it. Defaults to zero so
   * every other caller is unaffected.
   *
   * It exists because the alternative is worse: a sticky summary reading one
   * total while the button beside it reads another is the kind of discrepancy a
   * shopper notices at precisely the wrong moment.
   */
  codFee?: number;
  children?: React.ReactNode;
  className?: string;
}) {
  const { lines, summary, promoCode, setPromoCode, subtotal, rules, money, firstOrderOffer } =
    useCart();
  const { notify } = useToast();
  const [code, setCode] = useState("");
  const [promoError, setPromoError] = useState<string | null>(null);
  /**
   * Bumped on every successful application, which is what fires the confetti.
   *
   * A counter rather than a boolean so applying a second code after removing the first
   * bursts again — a boolean already set to `true` cannot express "again".
   */
  const [celebrations, setCelebrations] = useState(0);

  const markdownSavings = savingsFromMarkdowns(lines);
  const suggestion = rules.promoCodes[0];

  const handleApply = (event: React.FormEvent) => {
    event.preventDefault();
    const result = applyPromo(code, subtotal, rules);
    if (!result.ok) {
      setPromoError(result.reason);
      return;
    }
    /*
     * The two do not combine; the larger applies. A code worth no more than the first-order
     * discount would be accepted and then do nothing, with the field closing as if it had
     * worked. Say so instead, and keep the single-use discount.
     */
    if (
      firstOrderOffer?.kind === "eligible" &&
      firstOrderAmount(subtotal, rules.firstOrderPercent) >= result.discount
    ) {
      setPromoError(
        `Your first-order discount (${rules.firstOrderPercent}% off) is worth at least as much as this code, so it is already applied.`,
      );
      return;
    }

    setPromoError(null);
    setPromoCode(result.promo.code);
    setCode("");
    setCelebrations((current) => current + 1);

    /*
     * The toast carries the news; the confetti is decoration. Screen reader users and
     * anyone who has asked for reduced motion get no burst at all, so the saving has to be
     * announced in words — and a toast is how every other cart action already reports
     * itself, so this stays consistent rather than inventing a live region.
     */
    notify({
      tone: "success",
      title: `${result.promo.code} applied`,
      description: `${money(result.discount)} off — ${result.promo.description.toLowerCase()}.`,
    });
  };

  return (
    // `relative` anchors the confetti, which is absolutely positioned to this panel.
    <div className={cn("relative bg-surface p-5 sm:p-6", className)}>
      {/*
        Keyed on the counter, so each application mounts a fresh burst. See the note in
        `confetti-burst.tsx` on why a remount beats re-triggering the animation in place.
      */}
      {celebrations > 0 ? <ConfettiBurst key={celebrations} /> : null}
      <h2 className="font-sans text-2xs font-medium uppercase tracking-[0.14em]">
        Order summary
      </h2>

      <dl className="mt-5 flex flex-col gap-3 text-sm">
        <Row term={`Subtotal (${lines.length} ${lines.length === 1 ? "line" : "lines"})`}>
          {money(summary.subtotal)}
        </Row>

        {markdownSavings > 0 ? (
          <Row term="Markdown savings" tone="positive">
            −{money(markdownSavings)}
          </Row>
        ) : null}

        {summary.discount > 0 && summary.promo ? (
          <div className="flex items-start justify-between gap-3">
            <dt className="flex min-w-0 flex-wrap items-center gap-2 text-content-muted">
              {/*
                Pops in when it arrives. `motion-reduce:animate-none` because the global
                reduced-motion rule clamps the duration rather than removing the animation,
                which would otherwise leave a 0.01ms scale jump.
              */}
              <span className="inline-flex animate-pop-in items-center gap-1.5 bg-accent-soft px-2 py-1 text-2xs font-medium uppercase tracking-[0.08em] text-accent motion-reduce:animate-none">
                <Tag size={11} weight="fill" aria-hidden />
                {summary.promo.code}
              </span>
              <button
                type="button"
                onClick={() => setPromoCode(null)}
                aria-label={`Remove promotion code ${summary.promo.code}`}
                className="text-content-subtle transition-colors hover:text-danger-500"
              >
                <X size={12} aria-hidden />
              </button>
            </dt>
            <dd
              data-numeric
              className="shrink-0 text-success-700 tabular-nums dark:text-success-500"
            >
              −{money(summary.discount)}
            </dd>
          </div>
        ) : null}

        {summary.discount > 0 && summary.firstOrder ? (
          <div className="flex items-start justify-between gap-3">
            <dt className="flex min-w-0 flex-wrap items-center gap-2 text-content-muted">
              <span className="inline-flex items-center gap-1.5 bg-accent-soft px-2 py-1 text-2xs font-medium uppercase tracking-[0.08em] text-accent">
                <Tag size={11} weight="fill" aria-hidden />
                First order · {summary.firstOrder.percent}% off
              </span>
            </dt>
            <dd
              data-numeric
              className="shrink-0 text-success-700 tabular-nums dark:text-success-500"
            >
              −{money(summary.discount)}
            </dd>
          </div>
        ) : null}

        <Row term="Shipping">
          {showShipping ? (
            summary.shipping === 0 ? (
              <span className="text-success-700 dark:text-success-500">Complimentary</span>
            ) : (
              money(summary.shipping)
            )
          ) : (
            <span className="text-content-subtle">At next step</span>
          )}
        </Row>

        <Row term={`Estimated tax (${Math.round(rules.taxRate * 100)}%)`}>
          {showShipping ? (
            money(summary.tax)
          ) : (
            <span className="text-content-subtle">At next step</span>
          )}
        </Row>

        {codFee > 0 ? (
          <Row term="Cash on delivery fee">{money(codFee)}</Row>
        ) : null}
      </dl>

      <div className="mt-5 flex items-baseline justify-between border-t border-line pt-5">
        <span className="text-sm font-medium">Total</span>
        <span data-numeric className="text-xl">
          {showShipping
            ? money(summary.total + codFee)
            : money(summary.subtotal - summary.discount)}
        </span>
      </div>

      <FirstOrderNote />

      <div className="mt-5">
        <FreeShippingMeter />
      </div>

      {showPromo && !promoCode ? (
        <form onSubmit={handleApply} className="mt-6 border-t border-line pt-5">
          <label
            htmlFor="promo"
            className="text-2xs font-medium uppercase tracking-[0.12em] text-content-muted"
          >
            Promotion code
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="promo"
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                if (promoError) setPromoError(null);
              }}
              placeholder="Enter code"
              autoComplete="off"
              aria-invalid={promoError ? true : undefined}
              aria-describedby={
                promoError ? "promo-error" : suggestion ? "promo-hint" : undefined
              }
              className={cn(
                "h-11 min-w-0 flex-1 border bg-canvas px-3 text-sm uppercase tracking-wide placeholder:normal-case placeholder:tracking-normal placeholder:text-content-subtle focus:outline-none",
                promoError ? "border-danger-500" : "border-line-strong focus:border-accent",
              )}
            />
            <Button type="submit" variant="secondary" size="md" disabled={!code.trim()}>
              Apply
            </Button>
          </div>

          {promoError ? (
            <p
              id="promo-error"
              role="alert"
              className="mt-2 text-xs text-danger-500 dark:text-danger-100"
            >
              {promoError}
            </p>
          ) : suggestion ? (
            // A merchant can delete every code, so the hint has to be optional.
            <p id="promo-hint" className="mt-2 text-xs text-content-subtle">
              Try {suggestion.code} — {suggestion.description.toLowerCase()}.
            </p>
          ) : null}
        </form>
      ) : null}

      {children ? <div className="mt-6">{children}</div> : null}
    </div>
  );
}

/**
 * One line about the first-order discount when the shopper does not have it applied.
 *
 * Says only what helps: sign in to get it, finish the unpaid order that is holding it, or
 * that it is being kept because a code is worth more. Says nothing when it was used, when
 * this is not a first order, or when there is no offer, because "you can't have this" is
 * not something to put in front of a returning customer on every visit.
 */
function FirstOrderNote() {
  const { firstOrderOffer, summary, lines, promoCode, setPromoCode } = useCart();

  if (!firstOrderOffer || lines.length === 0) return null;

  let content: React.ReactNode = null;

  if (summary.firstOrder && promoCode) {
    // A code was entered, and the first-order discount turned out to be worth more, so the
    // code is doing nothing. Without this line it would vanish with no explanation.
    content = (
      <>
        Code {promoCode} is not used: your first-order discount is worth more.{" "}
        <button
          type="button"
          onClick={() => setPromoCode(null)}
          className="underline underline-offset-2 hover:text-accent"
        >
          Remove it
        </button>
      </>
    );
  } else if (firstOrderOffer.kind === "sign-in") {
    content = (
      <>
        <Link href="/signin" className="underline underline-offset-2 hover:text-accent">
          Sign in
        </Link>{" "}
        or{" "}
        <Link href="/signup" className="underline underline-offset-2 hover:text-accent">
          create an account
        </Link>{" "}
        for {firstOrderOffer.percent}% off your first order.
      </>
    );
  } else if (firstOrderOffer.kind === "held") {
    content = (
      <>
        Your first-order discount is on order {firstOrderOffer.orderId}, which is not paid yet.
        Pay for it, or cancel it from your account to use the discount here.
      </>
    );
  } else if (firstOrderOffer.kind === "eligible" && summary.promo) {
    content = <>Your first-order discount is saved for your next order.</>;
  }

  if (!content) return null;

  return (
    <p className="mt-4 text-xs leading-relaxed text-content-muted" role="status">
      {content}
    </p>
  );
}

function Row({
  term,
  tone,
  children,
}: {
  term: string;
  tone?: "positive";
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-content-muted">{term}</dt>
      <dd
        data-numeric
        className={cn(
          "shrink-0 tabular-nums",
          tone === "positive" ? "text-success-700 dark:text-success-500" : "text-content",
        )}
      >
        {children}
      </dd>
    </div>
  );
}
