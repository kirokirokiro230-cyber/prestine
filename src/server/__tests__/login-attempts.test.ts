import { beforeEach, describe, expect, it } from "vitest";
import { MAX_ATTEMPTS } from "@/lib/login-throttle";
import {
  clearFailedLogins,
  loginLockout,
  recordFailedLogin,
  resetLoginAttempts,
} from "../login-attempts";

/**
 * Exercises the in-memory backend, which is what runs when Supabase is not configured —
 * local development and this suite. The table-backed path (`rate_limit_hits`, added in
 * `supabase/migrations/00000000000010_rate_limits.sql`) shares its policy through
 * `lockoutFrom`, tested exhaustively in `src/lib/__tests__/login-throttle.test.ts`, so
 * what is verified here is the wiring: that attempts accumulate against the right key,
 * that a success clears them, and that keys do not leak into each other.
 *
 * The environment variables are cleared rather than merely assumed absent, so the suite
 * keeps testing the in-memory path even on a machine with real credentials exported.
 */
describe("login attempt tracking", () => {
  beforeEach(() => {
    resetLoginAttempts();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("starts unlocked", async () => {
    expect(await loginLockout("email:owner@example.com")).toEqual({
      locked: false,
      secondsRemaining: 0,
    });
  });

  it("locks after the limit is reached", async () => {
    const key = "email:owner@example.com";

    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) {
      await recordFailedLogin(key);
      expect((await loginLockout(key)).locked).toBe(false);
    }

    await recordFailedLogin(key);
    expect((await loginLockout(key)).locked).toBe(true);
  });

  /** Otherwise one attacker could lock out every other admin by guessing their address. */
  it("keeps keys independent", async () => {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      await recordFailedLogin("email:victim@example.com");
    }

    expect((await loginLockout("email:victim@example.com")).locked).toBe(true);
    expect((await loginLockout("email:someone@example.com")).locked).toBe(false);
    expect((await loginLockout("ip:203.0.113.4")).locked).toBe(false);
  });

  /**
   * Four bad guesses then the right password must not leave the account one mistake from
   * a lockout for the rest of the window.
   */
  it("clears history on success", async () => {
    const key = "email:owner@example.com";
    for (let attempt = 0; attempt < MAX_ATTEMPTS - 1; attempt += 1) {
      await recordFailedLogin(key);
    }

    await clearFailedLogins(key);

    for (let attempt = 0; attempt < MAX_ATTEMPTS - 1; attempt += 1) {
      await recordFailedLogin(key);
      expect((await loginLockout(key)).locked).toBe(false);
    }
  });

  /** A mixed-case address must not be a way to get a fresh allowance. */
  it("is case insensitive", async () => {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      await recordFailedLogin("email:Owner@Example.com");
    }

    expect((await loginLockout("email:owner@example.com")).locked).toBe(true);
  });

  it("counts attempts against a key that survives repeated reads", async () => {
    const key = "ip:198.51.100.7";
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      await recordFailedLogin(key);
    }

    // Reading must not consume the history, or every other check would see it reset.
    expect((await loginLockout(key)).locked).toBe(true);
    expect((await loginLockout(key)).locked).toBe(true);
  });
});
