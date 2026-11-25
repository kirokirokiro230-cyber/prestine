import { beforeEach, describe, expect, it } from "vitest";
import { MAX_ATTEMPTS } from "@/lib/login-throttle";
import { cashfreeAmountMatches } from "../cashfree";
import {
  loginLockout,
  recordFailedLogin,
  resetLoginAttempts,
} from "../login-attempts";

/**
 * Regression tests for the two defects that mattered most in the pre-production audit.
 */

describe("cashfreeAmountMatches", () => {
  it("accepts the exact amount, converting rupees to minor units", () => {
    expect(cashfreeAmountMatches({ orderAmount: 1999, orderCurrency: "INR" }, 199_900)).toBe(true);
    expect(cashfreeAmountMatches({ orderAmount: 86.5, orderCurrency: "INR" }, 8_650)).toBe(true);
  });

  /*
   * Cashfree reports rupees as a float. 0.1 + 0.2 is the classic; the comparison is
   * made in whole paise after rounding so a representation error is never read as a
   * short payment, which would hold a genuinely paid order.
   */
  it("is not fooled by floating point representation", () => {
    expect(cashfreeAmountMatches({ orderAmount: 0.1 + 0.2, orderCurrency: "INR" }, 30)).toBe(true);
    expect(cashfreeAmountMatches({ orderAmount: 1234.56, orderCurrency: "INR" }, 123_456)).toBe(true);
  });

  it("rejects a paid amount that differs from the order total", () => {
    expect(cashfreeAmountMatches({ orderAmount: 1, orderCurrency: "INR" }, 199_900)).toBe(false);
    expect(cashfreeAmountMatches({ orderAmount: 1998.99, orderCurrency: "INR" }, 199_900)).toBe(false);
    expect(cashfreeAmountMatches({ orderAmount: 1999.01, orderCurrency: "INR" }, 199_900)).toBe(false);
  });

  it("rejects any currency other than INR", () => {
    expect(cashfreeAmountMatches({ orderAmount: 1999, orderCurrency: "USD" }, 199_900)).toBe(false);
  });

  it("accepts a response that omits the currency, and rejects a non-number amount", () => {
    expect(cashfreeAmountMatches({ orderAmount: 1999 }, 199_900)).toBe(true);
    expect(cashfreeAmountMatches({ orderAmount: Number.NaN }, 199_900)).toBe(false);
  });
});

/**
 * The sign-in, customer sign-in and contact-form code all check two keys at once with
 * `Promise.all(keys.map(...))`. `loginLockout` once took an optional numeric second
 * argument, `Array.prototype.map` supplied the array index for it, and every one of
 * those call sites locked after a SINGLE failure: one wrong password by anyone locked
 * the admin account for fifteen minutes.
 */
describe("loginLockout when called the way sign-in calls it", () => {
  beforeEach(() => {
    resetLoginAttempts();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("does not lock after one failure when mapped over several keys", async () => {
    const keys = ["email:owner@example.com", "ip:203.0.113.4"];

    await Promise.all(keys.map(recordFailedLogin));

    // The shape sign-in uses. Written with an explicit arrow, as the callers now are.
    const lockouts = await Promise.all(keys.map((key) => loginLockout(key)));

    expect(lockouts.map((lockout) => lockout.locked)).toEqual([false, false]);
  });

  /*
   * The same bug through an untyped path: a bare number in the second slot must be
   * ignored, not treated as an allowance. This is what `keys.map(loginLockout)` used to
   * deliver, before the signature stopped accepting a number at all.
   */
  it("ignores a stray numeric second argument instead of using it as the limit", async () => {
    const key = "email:owner@example.com";
    await recordFailedLogin(key);

    const lockoutWithIndex = loginLockout as unknown as (
      key: string,
      stray: number,
    ) => ReturnType<typeof loginLockout>;

    expect((await lockoutWithIndex(key, 0)).locked).toBe(false);
    expect((await lockoutWithIndex(key, 1)).locked).toBe(false);
  });

  it("still locks at the real limit", async () => {
    const key = "email:owner@example.com";

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      await recordFailedLogin(key);
    }

    expect((await loginLockout(key)).locked).toBe(true);
  });

  it("honours an explicit allowance passed as an option", async () => {
    const key = "order-lookup:ip:198.51.100.7";

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await recordFailedLogin(key);
    }

    expect((await loginLockout(key)).locked).toBe(true);
    expect((await loginLockout(key, { maxAttempts: 60 })).locked).toBe(false);
  });
});
