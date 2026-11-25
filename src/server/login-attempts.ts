import {
  WINDOW_MS,
  lockoutFrom,
  type Lockout,
} from "@/lib/login-throttle";
import { callRpc, db } from "./supabase";

/**
 * Where failed attempts are recorded.
 *
 * Two backends behind one API. The sliding-window policy lives in
 * `src/lib/login-throttle.ts` and is shared by both, so they cannot drift apart
 * on the rules.
 *
 * ## Why this is table-backed in production
 *
 * This was originally an in-memory Map, which is correct on a single
 * long-running process. On a serverless host it is not: every cold start begins
 * with an empty Map, and concurrent function instances never see each other's
 * counts. A brute-force limiter that resets whenever the platform decides to
 * scale is decoration, and it fails open precisely when someone is hammering
 * hard enough to trigger more instances.
 *
 * So when Supabase is configured the timestamps go to `rate_limit_hits`
 * (`supabase/migrations/00000000000010_rate_limits.sql`), shared by every
 * instance. The Map remains as the fallback for local development and the test
 * suite, which run without a database.
 *
 * ## Naming
 *
 * The functions are named for failed logins because that was their first
 * caller, but what they implement is "how many times has this key done a thing
 * in the last fifteen minutes". Callers namespace their own keys — `email:…`,
 * `ip:…`, `otp:…`, `contact:ip:…` — so sign-in, OTP issuing, the contact form
 * and the public storefront endpoints all share one limiter.
 *
 * ## Failing open
 *
 * Every database path is wrapped so a Postgres problem can never break a login
 * form or a checkout. A limiter that takes the site down when it cannot record
 * an attempt has inverted its own purpose. The tradeoff is explicit: during a
 * database outage the limiter stops limiting rather than stops the shop.
 */

const WINDOW_SECONDS = Math.round(WINDOW_MS / 1000);

/**
 * Held on `globalThis` for the same reason the store's cache is: hot reload
 * creates a new module registry, and a limiter that resets on every file save
 * is not one.
 */
const globalForAttempts = globalThis as unknown as {
  prestineLoginAttempts?: Map<string, number[]>;
};

function memoryStore(): Map<string, number[]> {
  globalForAttempts.prestineLoginAttempts ??= new Map();
  return globalForAttempts.prestineLoginAttempts;
}

/**
 * Whether the durable backend is available.
 *
 * Checked per call rather than cached, so the test suite can delete the
 * environment variables and get the in-memory behaviour it asserts on.
 */
function durable(): boolean {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/**
 * Is this key currently locked out?
 *
 * Keys are namespaced by the caller and lower-cased here, so a mixed-case
 * address cannot be used to get a fresh allowance.
 */
export async function loginLockout(
  key: string,
  /**
   * Optional allowance for this key. An options object, not a bare number.
   *
   * It used to be `maxAttempts?: number`, and that shape is a trap: four call
   * sites wrote `keys.map(loginLockout)`, and `Array.prototype.map` passes
   * `(element, index, array)`. The index landed in `maxAttempts` — 0 for the first
   * key, 1 for the second — and both were clamped to a limit of one. The effect
   * was that a single failed attempt by anyone locked the admin account, a
   * customer's phone number, or the contact form for fifteen minutes. A shape the
   * array index cannot be mistaken for removes the whole class of bug, and the
   * type checker now rejects `map(loginLockout)` outright.
   */
  options?: { maxAttempts?: number },
): Promise<Lockout> {
  // Defence in depth for the same bug arriving through an untyped path: only a
  // real object is read, so a stray number is ignored rather than becoming a limit.
  const maxAttempts =
    options && typeof options === "object" ? options.maxAttempts : undefined;

  const id = key.toLowerCase();
  const now = Date.now();

  if (durable()) {
    try {
      const { data, error } = await callRpc(db(), "rate_limit_hits_in_window", {
        p_key: id,
        p_window_seconds: WINDOW_SECONDS,
      });

      if (error) throw new Error(error.message);

      const timestamps = (data ?? []).map((at) => new Date(at).getTime());

      return lockoutFrom(timestamps, now, maxAttempts);
    } catch (error) {
      // Fail open — see the module note.
      console.error("[rate-limit] could not read attempts; allowing:", error);
      return lockoutFrom([], now, maxAttempts);
    }
  }

  return lockoutFrom(memoryStore().get(id) ?? [], now, maxAttempts);
}

/**
 * Record one attempt against a key.
 *
 * Never throws. Callers record *before* calling a paid provider where the
 * concern is cost (the contact form, OTP issuing) and *after* a failure where
 * the concern is guessing (sign-in).
 */
export async function recordFailedLogin(key: string): Promise<void> {
  const id = key.toLowerCase();

  if (durable()) {
    try {
      const { error } = await callRpc(db(), "record_rate_limit_hit", {
        p_key: id,
        p_window_seconds: WINDOW_SECONDS,
      });
      if (error) throw new Error(error.message);
      return;
    } catch (error) {
      console.error("[rate-limit] could not record an attempt:", error);
      return;
    }
  }

  const now = Date.now();
  const store = memoryStore();
  const kept = (store.get(id) ?? []).filter((at) => now - at < WINDOW_MS);
  kept.push(now);
  store.set(id, kept);
}

/**
 * Clear a key's history after a success.
 *
 * Otherwise four bad guesses followed by the right password would leave the
 * account one mistake away from a lockout for the next quarter of an hour.
 */
export async function clearFailedLogins(key: string): Promise<void> {
  const id = key.toLowerCase();

  if (durable()) {
    try {
      const { error } = await callRpc(db(), "clear_rate_limit_hits", {
        p_key: id,
      });
      if (error) throw new Error(error.message);
      return;
    } catch (error) {
      console.error("[rate-limit] could not clear attempts:", error);
      return;
    }
  }

  memoryStore().delete(id);
}

/** Drop all recorded attempts from the in-memory backend. Test helper. */
export function resetLoginAttempts(): void {
  memoryStore().clear();
}
