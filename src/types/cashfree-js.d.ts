/**
 * Ambient types for `@cashfreepayments/cashfree-js`.
 *
 * The package ships no type declarations of its own (see its `package.json` — no
 * `types`/`typings` field) and there is no published `@types/cashfreepayments__cashfree-js`.
 * This covers only the surface `src/components/checkout/checkout-flow.tsx` actually
 * calls — `load()` and the `checkout()` method it returns — rather than the package's
 * full component API (payment element fields, etc.), which this app does not use: the
 * hosted-checkout redirect keeps card details off this app entirely, so there is no
 * reason to model the custom-element surface here.
 */
declare module "@cashfreepayments/cashfree-js" {
  export type CashfreeMode = "sandbox" | "production";

  export interface CashfreeCheckoutOptions {
    paymentSessionId: string;
    /** `_self` navigates the current tab; `_blank`/`_modal` are also supported by the SDK. */
    redirectTarget?: "_self" | "_blank" | "_modal" | HTMLElement;
  }

  export interface CashfreeCheckoutResult {
    error?: { message: string };
    redirect?: boolean;
    paymentDetails?: { paymentMessage?: string };
  }

  export interface CashfreeInstance {
    checkout(options: CashfreeCheckoutOptions): Promise<CashfreeCheckoutResult>;
  }

  /** Resolves `null` when called outside a browser. */
  export function load(options: { mode: CashfreeMode }): Promise<CashfreeInstance | null>;
}
