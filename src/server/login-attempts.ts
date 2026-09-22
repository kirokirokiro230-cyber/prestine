import { randomUUID } from "node:crypto";
import { and, eq, gte, lt } from "drizzle-orm";
import {
  WINDOW_MS,
  lockoutFrom,
  type Lockout,
} from "@/lib/login-throttle";
import { getDb, isDatabaseConfigured } from "./db/client";
import { loginAttempts } from "./db/schema";

/**
 * Where failed sign-in attempts are recorded.
 *
 * ## Why this is not a Map any more
 *
 * It was, and on a single long-running process a Map is the right answer — no write per
 * failed guess, no table to prune. On a serverless host it is worse than useless: each
 * invocation may be a fresh instance with an empty Map, so five guesses spread over five
 * instances never reach the limit. A limiter that silently does nothing is more dangerous
 * than no limiter, because the login form looks protected.
 *
 * So there are two backends, chosen by whether a database is configured:
 *
 * - **table** — `login_attempts`, shared by every instance. The real implementation.
 * - **memory** — a Map, for local development and the test suite, where there is one
 *   process and no database. Identical policy, via `lockoutFrom`.
 *
 * ## Cost
 *
 * Two queries on a failed sign-in and one on a successful one. Sign-in is rare and
 * already spends ~100ms in scrypt by design, so a round trip is immaterial — and this is
 * the one place in the app where being slow is a feature.
 */

/* ------------------------------------------------------------------ */
/* In-memory backend                                                   */
/* ------------------------------------------------------------------ */

/**
 * Held on `globalThis` for the same reason the database client is: hot reload creates a
 * new module registry, and a limiter that resets on every file save is not one.
 */
const globalForAttempts = globalThis as unknown as {
  prestineLoginAttempts?: Map<string, number[]>;
};

function memoryStore(): Map<string, number[]> {
  globalForAttempts.prestineLoginAttempts ??= new Map();
  return globalForAttempts.prestineLoginAttempts;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Is this key currently locked out?
 *
 * Keys are namespaced by the caller (`email:…`, `ip:…`) and lower-cased here, so a
 * mixed-case address cannot be used to get a fresh allowance.
 *
 * **Fails open on a database error.** A shop whose owner cannot sign in because the
 * limiter's query timed out has locked out the only person who can fix it. The password
 * check itself is unaffected, so the cost of failing open is a lost rate limit during an
 * outage, not a lost account.
 */
export async function loginLockout(key: string): Promise<Lockout> {
  const id = key.toLowerCase();
  const now = Date.now();

  if (!isDatabaseConfigured()) {
    return lockoutFrom(memoryStore().get(id) ?? [], now);
  }

  try {
    const rows = await getDb()
      .select({ at: loginAttempts.at })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.email, id),
          gte(loginAttempts.at, new Date(now - WINDOW_MS)),
        ),
      );

    return lockoutFrom(
      rows.map((row) => row.at.getTime()),
      now,
    );
  } catch (error) {
    console.error("[login-attempts] could not read attempts, allowing:", error);
    return { locked: false, secondsRemaining: 0 };
  }
}

/**
 * Record one failed attempt.
 *
 * Also deletes rows that have aged out of the window — for this key and, opportunistically,
 * any key at all. Pruning here rather than on a schedule means the table cannot grow
 * unbounded without needing a cron job that someone has to remember exists, and a failed
 * sign-in is exactly the moment when a little extra work is welcome.
 *
 * Never throws. A limiter that breaks the login form when it cannot record an attempt has
 * inverted its own purpose.
 */
export async function recordFailedLogin(key: string): Promise<void> {
  const id = key.toLowerCase();
  const now = Date.now();
  const cutoff = new Date(now - WINDOW_MS);

  if (!isDatabaseConfigured()) {
    const store = memoryStore();
    const kept = (store.get(id) ?? []).filter((at) => now - at < WINDOW_MS);
    kept.push(now);
    store.set(id, kept);
    return;
  }

  try {
    const db = getDb();
    await db.insert(loginAttempts).values({
      id: randomUUID(),
      email: id,
      at: new Date(now),
    });

    /*
     * Sweep everything that has aged out, not just this key's rows. Pruning here rather
     * than on a schedule keeps the table bounded without a cron job someone has to
     * remember exists, and the table only ever holds the last fifteen minutes of
     * failures across the whole store — so a full predicate is cheaper than being clever.
     */
    await db.delete(loginAttempts).where(lt(loginAttempts.at, cutoff));
  } catch (error) {
    console.error("[login-attempts] could not record a failed attempt:", error);
  }
}

/**
 * Clear a key's history after a successful sign-in.
 *
 * Otherwise four bad guesses followed by the right password would leave the account one
 * mistake away from a lockout for the next quarter of an hour.
 */
export async function clearFailedLogins(key: string): Promise<void> {
  const id = key.toLowerCase();

  if (!isDatabaseConfigured()) {
    memoryStore().delete(id);
    return;
  }

  try {
    await getDb().delete(loginAttempts).where(eq(loginAttempts.email, id));
  } catch (error) {
    console.error("[login-attempts] could not clear attempts:", error);
  }
}

/** Drop all recorded attempts. Test helper for the in-memory backend. */
export function resetLoginAttempts(): void {
  memoryStore().clear();
}
