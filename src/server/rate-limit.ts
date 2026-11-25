import type { Lockout } from "@/lib/login-throttle";
import { clientIp } from "./client-ip";
import { loginLockout, recordFailedLogin } from "./login-attempts";

/**
 * Rate limits for public endpoints, and the one helper that applies them.
 *
 * Sign-in, OTP issuing and the contact form each call the limiter directly,
 * because they need to record only on failure or only before a paid send. This
 * covers the simpler case: endpoints where *every* request counts against the
 * allowance.
 *
 * All limits share the fifteen-minute window from `src/lib/login-throttle.ts`;
 * only the count differs. See `lockoutFrom` for why the window is fixed.
 */

/**
 * Requests allowed per address per fifteen minutes.
 *
 * Chosen to be invisible to a real shopper and bounded for everyone else. The
 * numbers matter in both directions: too low and a legitimate customer gets
 * locked out of checkout, which costs an order and is worse than the abuse.
 */
export const LIMITS = {
  /**
   * Placing an order. Generous, because a shopper whose card is declined
   * genuinely retries, sometimes several times, and being locked out of
   * checkout is the most expensive false positive in the app.
   */
  checkout: 15,

  /**
   * PIN-code serviceability and delivery estimates. Each one is a call to
   * Delhivery against our account's quota, but shoppers do legitimately check
   * a few addresses.
   */
  pincodeLookup: 30,

  /**
   * Cancelling an order. Takes a reference and an email from raw form input, so
   * it is the enumeration target among the customer actions, and a success
   * cancels an order and sends mail.
   */
  orderCancel: 10,

  /** Catalogue and search reads. Cheap, but not free, and trivially scriptable. */
  publicRead: 120,

  /**
   * Return requests. Takes a reference and an email from raw form input, like cancelling,
   * so it is a guessing target — and a hit writes a refund destination onto an order.
   */
  returnRequest: 10,

  /**
   * Guest order lookups that found nothing.
   *
   * Only misses are counted, so this never bites a shopper reading their own
   * receipts — see `lookupOrders`. The allowance is therefore about how many
   * *fruitless* lookups one address may make, and 60 in fifteen minutes is far
   * more than a browser replaying stale saved references ever needs.
   */
  orderLookup: 60,
} as const;

/**
 * Check an allowance and consume one unit of it.
 *
 * Returns the `Lockout` when the caller is over the limit, or `null` when the
 * request may proceed. Records before doing the work, so an endpoint that fails
 * downstream cannot be hammered for free — the opposite of sign-in, where only
 * a wrong password should count.
 *
 * Multiple keys are checked and recorded together: typically one for the
 * address and one for a stable identifier, so the limit still bites when the
 * network layer cannot be trusted.
 */
export async function consumeRateLimit(
  keys: string[],
  maxAttempts: number,
): Promise<Lockout | null> {
  const lockouts = await Promise.all(
    keys.map((key) => loginLockout(key, { maxAttempts })),
  );

  const locked = lockouts.find((lockout) => lockout.locked);
  if (locked) return locked;

  await Promise.all(keys.map(recordFailedLogin));
  return null;
}

/**
 * The common case: one allowance, keyed on the caller's address.
 *
 * `namespace` keeps endpoints from sharing a bucket — a shopper checking PIN
 * codes must not use up their own checkout allowance.
 */
export async function consumeIpRateLimit(
  namespace: string,
  maxAttempts: number,
): Promise<Lockout | null> {
  const ip = await clientIp();
  return consumeRateLimit([`${namespace}:ip:${ip}`], maxAttempts);
}

/** The message shown when a public endpoint refuses. */
export function rateLimitMessage(lockout: Lockout): string {
  const minutes = Math.max(1, Math.ceil(lockout.secondsRemaining / 60));
  return `Too many requests. Please try again in ${minutes} minute${
    minutes === 1 ? "" : "s"
  }.`;
}
