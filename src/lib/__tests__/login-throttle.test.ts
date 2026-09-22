import { describe, expect, it } from "vitest";
import {
  MAX_ATTEMPTS,
  WINDOW_MS,
  lockoutFrom,
  lockoutMessage,
} from "../login-throttle";

/** `count` failures, the most recent `agoMs` before `now`, one second apart. */
function failures(count: number, now: number, agoMs = 0): number[] {
  return Array.from({ length: count }, (_, index) => now - agoMs - index * 1000);
}

const NOW = 1_700_000_000_000;

describe("lockoutFrom", () => {
  it("allows an empty history", () => {
    expect(lockoutFrom([], NOW)).toEqual({ locked: false, secondsRemaining: 0 });
  });

  it("allows one attempt below the limit", () => {
    const lockout = lockoutFrom(failures(MAX_ATTEMPTS - 1, NOW), NOW);
    expect(lockout.locked).toBe(false);
  });

  it("locks on the limit", () => {
    const lockout = lockoutFrom(failures(MAX_ATTEMPTS, NOW), NOW);
    expect(lockout.locked).toBe(true);
    expect(lockout.secondsRemaining).toBeGreaterThan(0);
  });

  it("ignores failures older than the window", () => {
    const stale = failures(MAX_ATTEMPTS, NOW, WINDOW_MS + 1000);
    expect(lockoutFrom(stale, NOW).locked).toBe(false);
  });

  it("frees the account as the decisive failure expires", () => {
    const attempts = failures(MAX_ATTEMPTS, NOW);
    const oldest = Math.min(...attempts);

    // One millisecond before the oldest ages out, five still sit in the window.
    expect(lockoutFrom(attempts, oldest + WINDOW_MS - 1).locked).toBe(true);
    // Once it expires only four remain, which is below the limit.
    expect(lockoutFrom(attempts, oldest + WINDOW_MS).locked).toBe(false);
  });

  /**
   * The reason the Nth-newest failure is decisive rather than the oldest. With more than
   * MAX_ATTEMPTS failures the oldest can be about to expire while five newer ones still
   * hold the lock — using it would report an unlock that does not happen.
   */
  it("counts from the newest end when there are extra failures", () => {
    const recent = failures(MAX_ATTEMPTS, NOW);
    const ancient = NOW - WINDOW_MS + 10;
    const lockout = lockoutFrom([ancient, ...recent], NOW);

    expect(lockout.locked).toBe(true);
    // Driven by the fifth-newest, not by the nearly-expired outlier.
    const decisive = Math.min(...recent);
    expect(lockout.secondsRemaining).toBe(
      Math.ceil((decisive + WINDOW_MS - NOW) / 1000),
    );
  });

  it("does not depend on the order timestamps arrive in", () => {
    const attempts = failures(MAX_ATTEMPTS, NOW);
    const shuffled = [...attempts].reverse();
    expect(lockoutFrom(shuffled, NOW)).toEqual(lockoutFrom(attempts, NOW));
  });

  /** A sub-second remainder must never round down to zero and read as unlocked. */
  it("rounds the remainder up", () => {
    const attempts = failures(MAX_ATTEMPTS, NOW);
    const oldest = Math.min(...attempts);
    const lockout = lockoutFrom(attempts, oldest + WINDOW_MS - 1);

    expect(lockout.locked).toBe(true);
    expect(lockout.secondsRemaining).toBe(1);
  });

  it("stays locked while attempts keep arriving", () => {
    let attempts = failures(MAX_ATTEMPTS, NOW);
    let now = NOW;

    // A bot retrying every minute never escapes, because each retry is also recorded.
    for (let minute = 1; minute <= 30; minute += 1) {
      now += 60_000;
      attempts = [...attempts, now];
      expect(lockoutFrom(attempts, now).locked).toBe(true);
    }
  });
});

describe("lockoutMessage", () => {
  it("uses the singular for a minute or less", () => {
    expect(lockoutMessage({ locked: true, secondsRemaining: 1 })).toContain("1 minute.");
    expect(lockoutMessage({ locked: true, secondsRemaining: 60 })).toContain("1 minute.");
  });

  it("rounds partial minutes up", () => {
    expect(lockoutMessage({ locked: true, secondsRemaining: 61 })).toContain("2 minutes.");
  });

  /** Never "0 minutes", which reads as "try now" and invites immediate retries. */
  it("never reports zero", () => {
    expect(lockoutMessage({ locked: true, secondsRemaining: 0 })).toContain("1 minute.");
  });
});
