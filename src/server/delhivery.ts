/**
 * Delhivery pincode serviceability.
 *
 * ## What this can and cannot tell you
 *
 * Delhivery's B2C API answers **whether** a pincode is served, and which services apply
 * there — prepaid, cash on delivery, reverse pickup. It does **not** return a delivery
 * estimate: there is no TAT or expected-date endpoint in their B2C set, so a "3–5 days"
 * figure cannot be sourced from them. Per-pincode delivery estimates are an aggregator
 * feature (ClickPost, Shippit and similar resell it).
 *
 * So the delivery promise shown to a shopper comes from `settings.deliveryDaysMin/Max`,
 * and this module answers exactly one question: can we deliver there at all. Conflating
 * the two would mean inventing a number and attributing it to the courier.
 *
 * ## Failing open
 *
 * Every failure path returns `serviceable: "unknown"` rather than `false`. A shopper
 * whose pincode we cannot check must not be told we do not deliver to them — that is a
 * lost order caused by our outage. "Unknown" renders as the standard delivery promise
 * with no serviceability claim attached.
 *
 * ## Credentials
 *
 * `DELHIVERY_API_TOKEN` is a server-only client token from the Delhivery dashboard. When
 * it is absent the check is skipped entirely and `configured: false` comes back, which is
 * what lets the pincode box ship before the account exists.
 */

/** India Post pincodes are exactly six digits and never start with zero. */
const PINCODE = /^[1-9][0-9]{5}$/;

export function isValidPincode(value: string): boolean {
  return PINCODE.test(value.trim());
}

export interface ServiceabilityResult {
  /** False when no API token is set, so callers can degrade rather than error. */
  configured: boolean;
  /**
   * `"unknown"` whenever the answer could not be established — a network failure, a
   * rejected token, or an unparseable payload. Never inferred as `false`.
   */
  serviceable: true | false | "unknown";
  /** Present when Delhivery names the place, so the shopper can sanity-check the code. */
  city?: string;
  state?: string;
  /** Whether cash on delivery is offered there. */
  cashOnDelivery?: boolean;
}

const ENDPOINT = "https://track.delhivery.com/c/api/pin-codes/json/";

/**
 * Ask Delhivery whether a pincode is serviceable.
 *
 * Server-only: the token bypasses nothing but it is account-scoped and must never reach
 * the browser, so this is called from a server action rather than fetched client-side.
 */
export async function checkPincode(pincode: string): Promise<ServiceabilityResult> {
  const token = process.env.DELHIVERY_API_TOKEN?.trim();
  if (!token) return { configured: false, serviceable: "unknown" };

  if (!isValidPincode(pincode)) return { configured: true, serviceable: false };

  const url = new URL(ENDPOINT);
  url.searchParams.set("filter_codes", pincode.trim());

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Token ${token}`, Accept: "application/json" },
      /*
       * A shopper is waiting on this, and a courier API having a slow day must not hold
       * a product page request open. Five seconds then fall back to the standard promise.
       */
      signal: AbortSignal.timeout(5000),
      // Serviceability changes rarely; a day of caching spares the API and the shopper.
      next: { revalidate: 86_400 },
    });
  } catch (error) {
    console.error("[delhivery] serviceability request failed:", error);
    return { configured: true, serviceable: "unknown" };
  }

  if (!response.ok) {
    // Logged rather than surfaced: the body can name account configuration.
    console.error(`[delhivery] serviceability rejected (${response.status})`);
    return { configured: true, serviceable: "unknown" };
  }

  try {
    const body = (await response.json()) as {
      delivery_codes?: Array<{
        postal_code?: {
          pin?: number | string;
          district?: string;
          state_code?: string;
          cash?: string;
          pre_paid?: string;
        };
      }>;
    };

    const entry = body.delivery_codes?.[0]?.postal_code;

    /*
     * An empty `delivery_codes` array is a definite answer, not a failure: Delhivery
     * returns no entry for a pincode it does not serve. This is the one path that may
     * legitimately report `false`.
     */
    if (!entry) return { configured: true, serviceable: false };

    return {
      configured: true,
      serviceable: true,
      city: entry.district?.trim() || undefined,
      state: entry.state_code?.trim() || undefined,
      cashOnDelivery: entry.cash === "Y",
    };
  } catch (error) {
    console.error("[delhivery] serviceability payload unparseable:", error);
    return { configured: true, serviceable: "unknown" };
  }
}
