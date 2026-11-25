/**
 * Brute-force policy for admin sign-in.
 *
 * Pure arithmetic over a list of failure timestamps, kept separate from where those
 * timestamps are stored so the policy can be tested exhaustively without a database and
 * so both backends in `src/server/login-attempts.ts` cannot drift apart on the rules.
 *
 * ## A sliding window, not a counter plus a lockout
 *
 * The obvious implementation keeps a count, a window start and a `lockedUntil` stamp.
 * That needs three pieces of mutable state to stay consistent, and it has an awkward
 * edge: attempts that arrive during a lockout are either dropped or reset the counter,
 * and both are wrong in a different direction.
 *
 * Counting failures in the trailing window instead needs no state beyond the timestamps
 * themselves. The account is locked while the window holds enough failures, and it frees
 * itself as they age out. Attempts made while locked are recorded like any other, so a
 * bot that keeps hammering keeps the lock alive — which is the behaviour you want and
 * which the counter version has to special-case.
 */

/** Failures within the window before the account is locked. */
export const MAX_ATTEMPTS = 5;

/** How long a failure counts against the account. */
export const WINDOW_MS = 15 * 60 * 1000;

export interface Lockout {
  locked: boolean;
  /** Whole seconds until the next attempt is allowed. Zero when not locked. */
  secondsRemaining: number;
}

const UNLOCKED: Lockout = { locked: false, secondsRemaining: 0 };

/**
 * Decide whether a key is locked, given every recorded failure for it.
 *
 * Timestamps may arrive in any order and may include entries older than the window;
 * both are filtered here rather than being made the caller's problem, because "the
 * query happened to return them sorted" is not something to rely on.
 */
export function lockoutFrom(
  timestamps: number[],
  now: number,
  /**
   * Allowance for this key. Defaults to the sign-in limit.
   *
   * Only the count varies, never the window: sign-in wants five guesses in
   * fifteen minutes, but a shopper legitimately checks several PIN codes and the
   * confirmation page legitimately retries, so those need a higher ceiling on
   * the same clock. Keeping one window means the stored timestamps have a single
   * retention horizon and the table can prune itself without knowing which
   * caller wrote a row.
   */
  maxAttempts: number = MAX_ATTEMPTS,
): Lockout {
  const limit = Math.max(1, maxAttempts);

  const inWindow = timestamps
    .filter((at) => now - at < WINDOW_MS)
    .sort((a, b) => a - b);

  if (inWindow.length < limit) return UNLOCKED;

  /*
   * The lock lifts when the window no longer contains `limit` failures — that is,
   * when the Nth-newest expires. Counting from the newest end rather than using the
   * oldest entry matters once there are more than `limit` failures: the oldest may
   * be about to expire while five newer ones still hold the lock.
   */
  const decisive = inWindow[inWindow.length - limit];
  const remaining = decisive + WINDOW_MS - now;

  if (remaining <= 0) return UNLOCKED;

  // Round up, so "1 second remaining" is never reported as zero seconds and unlocked.
  return { locked: true, secondsRemaining: Math.ceil(remaining / 1000) };
}

/** "Try again in 3 minutes." Minutes, because seconds invite retry-hammering. */
export function lockoutMessage(lockout: Lockout): string {
  const minutes = Math.max(1, Math.ceil(lockout.secondsRemaining / 60));
  return `Too many failed attempts. Try again in ${minutes} minute${
    minutes === 1 ? "" : "s"
  }.`;
}
