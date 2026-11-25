/**
 * Where to send a shopper to follow their parcel.
 *
 * ## Why this is a shared function
 *
 * The account page previously built this inline and hardcoded DPD:
 *
 *     https://track.dpd.co.uk/search?reference={trackingNumber}
 *
 * which pointed every waybill at one UK courier's website regardless of who was
 * actually carrying it. Once shipments were being manifested with Delhivery,
 * that link sent Indian customers to a British courier that had never heard of
 * their parcel.
 *
 * Keeping the mapping in one place means adding a second courier later is one
 * edit here rather than a hunt through components.
 */

/** Carriers we can deep-link into, keyed by a normalised name. */
const TRACKING_URLS: Record<string, (reference: string) => string> = {
  delhivery: (reference) =>
    `https://www.delhivery.com/track/package/${encodeURIComponent(reference)}`,
};

/**
 * A public tracking URL, or `null` when we cannot build an honest one.
 *
 * Returns `null` rather than guessing for an unknown carrier. A link to the
 * wrong courier is worse than no link: it tells the customer their parcel does
 * not exist.
 */
export function trackingUrl(
  carrier: string | undefined,
  reference: string | undefined,
): string | null {
  if (!reference?.trim()) return null;

  const key = carrier?.trim().toLowerCase();

  /*
   * No carrier recorded is treated as Delhivery, because it is the only one this
   * shop ships with and older orders were manifested before the carrier column
   * was being written.
   */
  const build = TRACKING_URLS[key || "delhivery"];
  if (!build) return null;

  return build(reference.trim());
}

/** The carrier's display name, for showing next to the waybill. */
export function carrierLabel(carrier: string | undefined): string {
  const key = carrier?.trim();
  if (!key) return "Delhivery";
  return key;
}
