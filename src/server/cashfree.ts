import { timingSafeEqual, createHmac } from "node:crypto";
import { normaliseRefundStatus, type RefundStatus } from "@/lib/refund";

/**
 * Cashfree Payment Gateway — the only PSP this store takes real money through.
 *
 * Same two-driver shape as `src/server/sms.ts` / `src/server/email/transport.ts`: one
 * artefact runs locally and in production, and which mode is live is decided by the
 * environment rather than a build flag. There is no "log and pretend" fallback here
 * the way there is for SMS/email, though — those are notifications where a developer
 * has to be able to finish a flow with no vendor account, but there is no honest way
 * to "log" a payment. With no credentials configured, checkout refuses the order with
 * a clear message rather than recording one that was never actually paid for. Test in
 * Cashfree's own sandbox (the default here) to develop and demo the flow end to end.
 *
 * ## No SDK
 *
 * `cashfree-pg` wraps a handful of REST calls behind a class with mutable static
 * configuration (`Cashfree.XClientId = ...`), which does not fit a serverless
 * request-scoped model well and pulls in a dependency for three endpoints this
 * project already knows how to call with `fetch` — see `sms.ts` and
 * `delhivery.ts` for the same call. Every request/response shape below is the
 * plain v2023-08-01 REST API, called directly.
 *
 * ## Money
 *
 * Every price in this codebase is an integer number of minor units (paise). Cashfree's
 * `order_amount` is a decimal **major**-unit amount (rupees, up to two decimal places)
 * — the one place in the payment path money changes representation. The conversion
 * happens only in `createCashfreeOrder`, in one direction, and is documented there.
 */

export type CashfreeEnvironment = "sandbox" | "production";

export interface CashfreeConfig {
  appId: string;
  secretKey: string;
  environment: CashfreeEnvironment;
  webhookSecret: string;
  apiVersion: string;
  apiBase: string;
}

/**
 * Cashfree settings, or `null` when they are not all present.
 *
 * All or nothing, the same contract `twoFactorConfig`/`resendConfig` use — a
 * half-configured payment provider is far worse than an absent one, since it is the
 * kind of gap that only surfaces the first time a real shopper tries to pay.
 */
export function cashfreeConfig(): CashfreeConfig | null {
  const appId = process.env.CASHFREE_APP_ID?.trim();
  const secretKey = process.env.CASHFREE_SECRET_KEY?.trim();
  const webhookSecret = process.env.CASHFREE_WEBHOOK_SECRET?.trim() || secretKey;

  if (!appId || !secretKey || !webhookSecret) return null;

  const environment: CashfreeEnvironment =
    process.env.CASHFREE_ENVIRONMENT?.trim().toLowerCase() === "production"
      ? "production"
      : "sandbox";

  const apiVersion = process.env.CASHFREE_API_VERSION?.trim() || "2023-08-01";
  const apiBase =
    environment === "production" ? "https://api.cashfree.com" : "https://sandbox.cashfree.com";

  return { appId, secretKey, environment, webhookSecret, apiVersion, apiBase };
}

/** True when a real provider is wired up. Drives whether checkout can take payment. */
export function cashfreeConfigured(): boolean {
  return cashfreeConfig() !== null;
}

/* ------------------------------------------------------------------ */
/* Create order / fetch order                                          */
/* ------------------------------------------------------------------ */

export interface CashfreeCustomerDetails {
  customerId: string;
  customerName: string;
  customerEmail: string;
  /** E.164 with the leading `+` stripped — Cashfree expects a bare national number. */
  customerPhone: string;
}

export interface CreateCashfreeOrderInput {
  /** This app's own order id (e.g. `PR-260924-K4TQ`), reused as Cashfree's `order_id`. */
  orderId: string;
  /** Minor units (paise). Converted to rupees for Cashfree here, and only here. */
  amountMinorUnits: number;
  customer: CashfreeCustomerDetails;
  /** Where Cashfree redirects the shopper after the hosted checkout completes. */
  returnUrl: string;
  /** Cashfree's webhook callback. Optional — the dashboard-configured URL is used if unset. */
  notifyUrl?: string;
}

export interface CashfreeOrderResponse {
  cfOrderId: string;
  orderId: string;
  orderStatus: "ACTIVE" | "PAID" | "EXPIRED" | "TERMINATED" | "TERMINATION_REQUESTED" | string;
  paymentSessionId: string;
}

export class CashfreeApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "CashfreeApiError";
  }
}

function headers(config: CashfreeConfig): HeadersInit {
  return {
    "x-client-id": config.appId,
    "x-client-secret": config.secretKey,
    "x-api-version": config.apiVersion,
    "content-type": "application/json",
  };
}

/**
 * Create a Cashfree order and obtain a `payment_session_id`.
 *
 * This is the one call that must happen before a shopper can be sent to hosted
 * checkout. It is made from `placeOrder` (`src/app/actions/checkout.ts`) using the
 * server-recomputed total — never a client-supplied figure — as the same trust
 * boundary that already governs every other price in this codebase.
 */
export async function createCashfreeOrder(
  config: CashfreeConfig,
  input: CreateCashfreeOrderInput,
): Promise<CashfreeOrderResponse> {
  // Rupees with at most two decimal places, per Cashfree's `order_amount` contract.
  // Paise-to-rupees is exact for any integer input (division by 100), so no rounding
  // beyond formatting to two decimals is introduced here.
  const orderAmount = Math.round(input.amountMinorUnits) / 100;

  const body = {
    order_id: input.orderId,
    order_amount: orderAmount,
    order_currency: "INR",
    customer_details: {
      customer_id: input.customer.customerId,
      customer_name: input.customer.customerName,
      customer_email: input.customer.customerEmail,
      customer_phone: input.customer.customerPhone,
    },
    order_meta: {
      return_url: input.returnUrl,
      ...(input.notifyUrl ? { notify_url: input.notifyUrl } : {}),
    },
    // Keeps a Cashfree order in ACTIVE for 24h before it expires and can no longer
    // take a payment attempt — long enough for a shopper who leaves the tab open,
    // short enough that a stale pending order does not stay payable indefinitely.
    order_expiry_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };

  let response: Response;
  try {
    response = await fetch(`${config.apiBase}/pg/orders`, {
      method: "POST",
      headers: headers(config),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Network error";
    throw new CashfreeApiError(`Could not reach Cashfree: ${detail}`, 0, null);
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      (payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message?: unknown }).message)
        : null) ?? `Cashfree returned ${response.status}`;
    throw new CashfreeApiError(message, response.status, payload);
  }

  const data = payload as {
    cf_order_id: string;
    order_id: string;
    order_status: string;
    payment_session_id: string;
  };

  return {
    cfOrderId: data.cf_order_id,
    orderId: data.order_id,
    orderStatus: data.order_status,
    paymentSessionId: data.payment_session_id,
  };
}

export interface CashfreeOrderStatus {
  orderId: string;
  orderStatus: string;
  /** Rupees, as Cashfree reports it (a decimal, not minor units). */
  orderAmount: number;
  orderCurrency?: string;
  /**
   * The live session for an ACTIVE order, when Cashfree includes it. Optional on
   * purpose: callers fall back to opening a new order rather than assuming it.
   */
  paymentSessionId?: string;
}

/**
 * Whether Cashfree's reported amount is the amount this order was meant to cost.
 *
 * The amount Cashfree holds was set by this server when the order was created, so a
 * shopper cannot change it — but "the status says PAID" and "the right amount was
 * paid" are two different claims, and a paid order is the one thing here that
 * releases goods. Checking both means a mis-keyed amount on retry, a currency
 * mismatch, or any future bug that creates a Cashfree order for the wrong figure
 * fails closed (the order stays unpaid and is logged) instead of shipping a parcel
 * that was only part-paid for.
 *
 * Compared in minor units after rounding, because Cashfree reports rupees as a
 * float and `0.1 + 0.2`-style error must not read as a mismatch.
 */
export function cashfreeAmountMatches(
  remote: Pick<CashfreeOrderStatus, "orderAmount" | "orderCurrency">,
  expectedMinorUnits: number,
): boolean {
  if (remote.orderCurrency && remote.orderCurrency.toUpperCase() !== "INR") return false;
  if (!Number.isFinite(remote.orderAmount)) return false;
  return Math.round(remote.orderAmount * 100) === Math.round(expectedMinorUnits);
}

/**
 * Re-fetch an order's status directly from Cashfree.
 *
 * The webhook is the primary path to `mark_order_paid`, but webhooks can be delayed,
 * dropped, or missed if the endpoint was briefly unreachable. This is the fallback
 * the confirmation page and an admin "check payment" action use to reconcile —
 * calling Cashfree directly rather than trusting only a callback that may never
 * arrive.
 */
export async function fetchCashfreeOrder(
  config: CashfreeConfig,
  orderId: string,
): Promise<CashfreeOrderStatus> {
  let response: Response;
  try {
    response = await fetch(`${config.apiBase}/pg/orders/${encodeURIComponent(orderId)}`, {
      method: "GET",
      headers: headers(config),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Network error";
    throw new CashfreeApiError(`Could not reach Cashfree: ${detail}`, 0, null);
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      (payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message?: unknown }).message)
        : null) ?? `Cashfree returned ${response.status}`;
    throw new CashfreeApiError(message, response.status, payload);
  }

  const data = payload as {
    order_id: string;
    order_status: string;
    order_amount: number;
    order_currency?: string;
    payment_session_id?: string;
  };
  return {
    orderId: data.order_id,
    orderStatus: data.order_status,
    orderAmount: data.order_amount,
    orderCurrency: data.order_currency,
    paymentSessionId: data.payment_session_id || undefined,
  };
}

/**
 * Close a Cashfree order so it can no longer take a payment.
 *
 * Used whenever this app stops wanting an order to be payable: the customer cancels
 * it, or a retry opens a replacement. Without it a Cashfree order stays ACTIVE for
 * the full twenty-four hours it was created with, and a shopper holding the old
 * payment page can still pay it — taking money for an order that was cancelled, or
 * paying twice for one that was retried.
 *
 * Best effort and never throws: a failure here must not block the cancellation or the
 * retry it accompanies, and an order that is already PAID, EXPIRED or TERMINATED is
 * refused by Cashfree harmlessly. The return value says whether it took effect.
 */
export async function terminateCashfreeOrder(
  config: CashfreeConfig,
  orderId: string,
): Promise<boolean> {
  try {
    const response = await fetch(`${config.apiBase}/pg/orders/${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      headers: headers(config),
      body: JSON.stringify({ order_status: "TERMINATED" }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    return response.ok;
  } catch (error) {
    console.error(`[cashfree] could not terminate ${orderId}:`, error);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Refunds                                                             */
/* ------------------------------------------------------------------ */

/**
 * A refund, as Cashfree describes it, in this app's terms: paise, and our status names.
 */
export interface CashfreeRefund {
  /** The `refund_id` this app chose when creating it. */
  refundId: string;
  /** Cashfree's own id for it. */
  cfRefundId?: string;
  orderId: string;
  /** Paise. Cashfree reports rupees; converted here, once. */
  amountMinorUnits: number;
  status: Exclude<RefundStatus, "requested">;
  /** Cashfree's own wording, e.g. "In Progress". For staff, never parsed. */
  statusDescription?: string;
  processedAt?: string;
}

export interface CreateCashfreeRefundInput {
  /** The Cashfree order that was PAID (not necessarily this app's order id). */
  orderId: string;
  /** Our unique refund id. Cashfree refuses a second refund with the same one. */
  refundId: string;
  /** Paise. Converted to rupees for Cashfree here, and only here. */
  amountMinorUnits: number;
}

/**
 * The shape of one refund in a Cashfree response, which is an object from Create Refund and
 * Get Refund and sometimes wrapped in an array. Read defensively: a field that is not what
 * this expects becomes "unknown" rather than being believed.
 */
function parseCashfreeRefund(payload: unknown, fallback: { orderId: string; refundId: string }) {
  const entry = Array.isArray(payload) ? payload[0] : payload;

  if (!entry || typeof entry !== "object") {
    throw new CashfreeApiError("Cashfree returned an unreadable refund.", 0, payload);
  }

  const data = entry as Record<string, unknown>;
  const amount = Number(data.refund_amount);

  const refund: CashfreeRefund = {
    refundId: typeof data.refund_id === "string" ? data.refund_id : fallback.refundId,
    cfRefundId:
      data.cf_refund_id !== undefined && data.cf_refund_id !== null
        ? String(data.cf_refund_id)
        : undefined,
    orderId: typeof data.order_id === "string" ? data.order_id : fallback.orderId,
    // A missing or garbled amount becomes NaN, which the caller treats as "do not trust
    // this refund's amount" rather than as zero.
    amountMinorUnits: Number.isFinite(amount) ? Math.round(amount * 100) : Number.NaN,
    status: normaliseRefundStatus(data.refund_status),
    statusDescription:
      typeof data.status_description === "string" ? data.status_description : undefined,
    processedAt: typeof data.processed_at === "string" ? data.processed_at : undefined,
  };

  return refund;
}

async function refundCall(
  config: CashfreeConfig,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; idempotencyKey?: string },
): Promise<{ status: number; payload: unknown }> {
  let response: Response;
  try {
    response = await fetch(`${config.apiBase}${path}`, {
      method: init.method,
      headers: {
        ...(headers(config) as Record<string, string>),
        ...(init.idempotencyKey ? { "x-idempotency-key": init.idempotencyKey } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch (error) {
    // Status 0: the request may or may not have arrived. See `refundOutcomeIsKnown`.
    const detail = error instanceof Error ? error.message : "Network error";
    throw new CashfreeApiError(`Could not reach Cashfree: ${detail}`, 0, null);
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      (payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message?: unknown }).message)
        : null) ?? `Cashfree returned ${response.status}`;
    throw new CashfreeApiError(message, response.status, payload);
  }

  return { status: response.status, payload };
}

/**
 * Ask Cashfree to refund part or all of a paid order.
 *
 * `amountMinorUnits` can be anything up to what was paid; Cashfree enforces that ceiling
 * itself, and this app enforces it first (`reserve_order_refund`). The money returns to
 * whatever the customer paid with, which is why a prepaid return needs no UPI ID.
 *
 * The note sent is generic, on purpose. Staff's own reason is an internal record and can
 * say things ("customer abusive") that must not travel to a payment processor, and
 * Cashfree limits the length of the field anyway.
 *
 * Throws `CashfreeApiError`. What the error means for the refund is NOT obvious, and
 * getting it wrong either loses money or refunds twice, so read `refundOutcomeIsKnown`.
 */
export async function createCashfreeRefund(
  config: CashfreeConfig,
  input: CreateCashfreeRefundInput,
): Promise<CashfreeRefund> {
  const { payload } = await refundCall(
    config,
    `/pg/orders/${encodeURIComponent(input.orderId)}/refunds`,
    {
      method: "POST",
      body: {
        refund_amount: Math.round(input.amountMinorUnits) / 100,
        refund_id: input.refundId,
        refund_note: `Refund for order ${input.orderId}`.slice(0, 100),
        refund_speed: "STANDARD",
      },
      // A second line of defence behind the unique refund id: the same key replays the
      // same answer instead of creating anything new.
      idempotencyKey: input.refundId,
    },
  );

  return parseCashfreeRefund(payload, { orderId: input.orderId, refundId: input.refundId });
}

/**
 * Read one refund back from Cashfree. `null` when Cashfree has never heard of it, which
 * for a refund this app tried to create means the request never arrived.
 */
export async function fetchCashfreeRefund(
  config: CashfreeConfig,
  orderId: string,
  refundId: string,
): Promise<CashfreeRefund | null> {
  try {
    const { payload } = await refundCall(
      config,
      `/pg/orders/${encodeURIComponent(orderId)}/refunds/${encodeURIComponent(refundId)}`,
      { method: "GET" },
    );
    return parseCashfreeRefund(payload, { orderId, refundId });
  } catch (error) {
    if (error instanceof CashfreeApiError && error.status === 404) return null;
    throw error;
  }
}

/**
 * Whether a failed Create Refund call definitely did NOT create a refund.
 *
 * - A 4xx answer (bad amount, over the refundable total, unknown order) means Cashfree
 *   read the request and refused it. Nothing was created, and the reserved money can be
 *   released.
 * - A network error or timeout, or a 5xx, means the request may have been processed and
 *   the reply lost. Releasing the money then would let staff refund again while the first
 *   is on its way, which is a double refund. So the outcome is UNKNOWN and the refund is
 *   left reserved until someone checks it against Cashfree.
 * - 408 (timeout) and 409 (the refund id already exists) are 4xx but are the same
 *   "something may exist" case.
 */
export function refundOutcomeIsKnown(error: unknown): boolean {
  if (!(error instanceof CashfreeApiError)) return false;
  if (error.status === 408 || error.status === 409) return false;
  return error.status >= 400 && error.status < 500;
}

/* ------------------------------------------------------------------ */
/* Webhook signature verification                                      */
/* ------------------------------------------------------------------ */

/**
 * Verify a Cashfree webhook signature.
 *
 * Per Cashfree's documented algorithm: `Base64Encode(HMACSHA256(timestamp + rawBody,
 * secretKey))`, where `timestamp` is the exact string from the `x-webhook-timestamp`
 * header and `rawBody` is the exact, unparsed request body — signed over the raw
 * bytes Cashfree sent, not a re-serialised version of the parsed JSON (which can
 * reorder keys or reformat whitespace and change the bytes being signed). Callers
 * must read the body as text with `request.text()` and pass that string here
 * unmodified, only parsing it with `JSON.parse` *after* this returns true.
 *
 * Constant-time comparison, for the same reason `secretMatches` in
 * `src/app/api/email/review-requests/route.ts` uses `timingSafeEqual`: a plain `===`
 * on a signature leaks timing information about how much of it matched.
 */
export function verifyCashfreeWebhookSignature(
  config: CashfreeConfig,
  rawBody: string,
  timestamp: string,
  signature: string,
): boolean {
  if (!timestamp || !signature) return false;

  const expected = createHmac("sha256", config.webhookSecret)
    .update(timestamp + rawBody)
    .digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/* ------------------------------------------------------------------ */
/* Webhook payload                                                     */
/* ------------------------------------------------------------------ */

export type CashfreeWebhookType =
  | "PAYMENT_SUCCESS_WEBHOOK"
  | "PAYMENT_FAILED_WEBHOOK"
  | "PAYMENT_USER_DROPPED_WEBHOOK"
  | string;

export interface CashfreeWebhookPayload {
  type: CashfreeWebhookType;
  event_time?: string;
  data?: {
    order?: { order_id?: string; order_amount?: number; order_currency?: string };
    payment?: {
      cf_payment_id?: string | number;
      payment_status?: string;
      payment_amount?: number;
      payment_time?: string;
    };
    /**
     * Present on refund events. Only the ids are used: the status in the payload is not
     * believed, the refund is read back from Cashfree (see the webhook route).
     */
    refund?: { order_id?: string; refund_id?: string; refund_status?: string };
  };
}

/**
 * Parse a webhook body into the fields this app actually acts on.
 *
 * Deliberately defensive: this app's own reconciliation fetch
 * (`fetchCashfreeOrder`) is the source of truth for whether an order is actually
 * paid, not the shape of a webhook payload. This parser exists only to know *which*
 * order to reconcile and to avoid doing that round trip for events this app does not
 * care about — a malformed or unexpectedly-shaped payload degrades to "reconcile
 * nothing", never to "trust an unread field and mark something paid".
 */
export function parseCashfreeWebhook(raw: string): CashfreeWebhookPayload | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || typeof parsed.type !== "string") return null;
    return parsed as CashfreeWebhookPayload;
  } catch {
    return null;
  }
}
