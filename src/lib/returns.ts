/**
 * The returns window.
 *
 * One module so the sentence a shopper reads and the rule the server enforces
 * come from the same place. Before this, `returnWindowDays` was quoted in a
 * dozen pieces of copy and checked in exactly none — the policy was a promise
 * with nothing behind it, and a return raised a year later would have been
 * accepted without complaint.
 */

/** Render a window for shoppers: "48 hours", "7 days", "30 days". */
export function formatReturnWindow(hours: number): string {
  if (hours <= 0) return "no returns";

  /*
   * Under two days reads better in hours — "48 hours" is how a policy like this
   * is written and how a customer thinks about it, where "2 days" invites the
   * question of which two days.
   */
  if (hours < 48) {
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }

  if (hours === 48) return "48 hours";

  // Beyond that, days. Whole days where it divides, otherwise rounded down with
  // the remainder dropped rather than inventing a "7.5 days".
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * The window as a modifier in front of a noun: "48-hour returns".
 *
 * Separate from `formatReturnWindow` because that one's output is a noun phrase
 * and reads wrong in this position — the footer link would say "48 hours
 * returns". English hyphenates and singularises a unit used attributively.
 */
export function formatReturnWindowAdjective(hours: number): string {
  if (hours <= 0) return "no returns";
  if (hours < 48) return `${hours}-hour returns`;
  if (hours === 48) return "48-hour returns";
  return `${Math.floor(hours / 24)}-day returns`;
}

/** Whole days, for the legacy `{{returnWindowDays}}` email token. */
export function returnWindowInDays(hours: number): number {
  return Math.max(0, Math.round(hours / 24));
}

export type ReturnEligibility =
  | { eligible: true; hoursRemaining: number }
  | { eligible: false; reason: string };

/**
 * Whether a return may still be raised for an order.
 *
 * Measured from delivery, not from the order date: the window is time to
 * inspect what arrived, and a parcel that spent a week in transit has not used
 * any of it up.
 *
 * An order that has not been delivered yet is **not** eligible, and says so
 * rather than being quietly allowed. Returning something that has not arrived is
 * a cancellation, which is a different flow with different consequences for the
 * parcel already in the network.
 */
export function returnEligibility(
  order: { status: string; deliveredAt?: string },
  windowHours: number,
  now: number = Date.now(),
): ReturnEligibility {
  if (windowHours <= 0) {
    return { eligible: false, reason: "Returns are not accepted." };
  }

  if (order.status === "cancelled") {
    return { eligible: false, reason: "That order was cancelled, so there is nothing to return." };
  }

  if (!order.deliveredAt) {
    return {
      eligible: false,
      reason:
        "That order has not been delivered yet. The returns window opens once the parcel arrives.",
    };
  }

  const deliveredAt = new Date(order.deliveredAt).getTime();
  if (!Number.isFinite(deliveredAt)) {
    return { eligible: false, reason: "We could not read the delivery date on that order." };
  }

  const deadline = deliveredAt + windowHours * 60 * 60 * 1000;
  const remainingMs = deadline - now;

  if (remainingMs <= 0) {
    return {
      eligible: false,
      reason: `The ${formatReturnWindow(windowHours)} returns window for that order closed on ${new Date(
        deadline,
      ).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.`,
    };
  }

  return { eligible: true, hoursRemaining: Math.ceil(remainingMs / (60 * 60 * 1000)) };
}

/** "9 hours left to return this" — for a shopper inside the window. */
export function formatHoursRemaining(hours: number): string {
  if (hours <= 1) return "less than an hour left";
  if (hours < 48) return `${hours} hours left`;
  const days = Math.floor(hours / 24);
  return `${days} days left`;
}
