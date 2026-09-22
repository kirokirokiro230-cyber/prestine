import { describe, expect, it } from "vitest";
import { createTtlCache } from "../ttl-cache";

/**
 * A controllable clock. Injecting one beats manipulating global timers: the assertions
 * read as "advance past the TTL" rather than as timer plumbing, and nothing leaks between
 * tests.
 */
function clock(start = 0) {
  let value = start;
  return {
    now: () => value,
    advance: (ms: number) => {
      value += ms;
    },
  };
}

describe("createTtlCache", () => {
  it("loads once and serves the cached value while fresh", async () => {
    let calls = 0;
    const time = clock();
    const cache = createTtlCache(
      async () => {
        calls += 1;
        return calls;
      },
      { ttlMs: 1000, now: time.now },
    );

    expect(await cache.get()).toBe(1);
    expect(await cache.get()).toBe(1);
    time.advance(999);
    expect(await cache.get()).toBe(1);
    expect(calls).toBe(1);
  });

  it("reloads once the entry has expired", async () => {
    let calls = 0;
    const time = clock();
    const cache = createTtlCache(
      async () => {
        calls += 1;
        return calls;
      },
      { ttlMs: 1000, now: time.now },
    );

    expect(await cache.get()).toBe(1);
    time.advance(1000);
    expect(await cache.get()).toBe(2);
    expect(calls).toBe(2);
  });

  /**
   * The reason the promise is cached rather than the resolved value. Without it, a burst
   * of requests arriving on a cold instance each start their own load — precisely the
   * stampede the cache exists to prevent.
   */
  it("shares one load between concurrent callers", async () => {
    let calls = 0;
    let release: (value: string) => void = () => {};
    const cache = createTtlCache(
      () => {
        calls += 1;
        return new Promise<string>((resolve) => {
          release = resolve;
        });
      },
      { ttlMs: 1000, now: clock().now },
    );

    const all = Promise.all([cache.get(), cache.get(), cache.get()]);
    release("value");

    expect(await all).toEqual(["value", "value", "value"]);
    expect(calls).toBe(1);
  });

  it("forgets the value on invalidate", async () => {
    let calls = 0;
    const cache = createTtlCache(
      async () => {
        calls += 1;
        return calls;
      },
      { ttlMs: 60_000, now: clock().now },
    );

    expect(await cache.get()).toBe(1);
    cache.invalidate();
    expect(await cache.get()).toBe(2);
  });

  /**
   * A cached rejection would turn a momentary blip into a guaranteed outage for the whole
   * TTL. The next caller must get a fresh attempt.
   */
  it("does not cache a failed load", async () => {
    let calls = 0;
    const cache = createTtlCache(
      async () => {
        calls += 1;
        if (calls === 1) throw new Error("cold");
        return "warm";
      },
      { ttlMs: 60_000, now: clock().now },
    );

    await expect(cache.get()).rejects.toThrow("cold");
    expect(await cache.get()).toBe("warm");
    expect(calls).toBe(2);
  });

  /**
   * A slow failure must not evict the value that replaced it. Without the identity check
   * in the rejection handler, the late `catch` clears an entry it no longer owns and every
   * later request pays for a reload.
   */
  it("a late failure does not evict a newer value", async () => {
    let calls = 0;
    let failFirst: (error: Error) => void = () => {};

    const cache = createTtlCache(
      () => {
        calls += 1;
        if (calls === 1) {
          return new Promise<string>((_resolve, reject) => {
            failFirst = reject;
          });
        }
        return Promise.resolve(`load-${calls}`);
      },
      { ttlMs: 60_000, now: clock().now },
    );

    const pending = cache.get();
    cache.invalidate();
    expect(await cache.get()).toBe("load-2");

    failFirst(new Error("too late"));
    await expect(pending).rejects.toThrow("too late");

    // Still the second load: the stale rejection did not clear the current entry.
    expect(await cache.get()).toBe("load-2");
    expect(calls).toBe(2);
  });
});
