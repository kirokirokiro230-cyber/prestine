/**
 * A single-value cache with an expiry.
 *
 * Written for reads that happen on every request but change rarely — the maintenance
 * flag being the case that forced it. On a long-running server the store's own
 * in-process cache made those reads free; on a serverless host each invocation starts
 * cold-ish and the read becomes a database round trip in the request path, so it needs
 * bounding.
 *
 * Three properties that matter, and are the reason this is not four lines inline:
 *
 * - **The promise is cached, not the value.** A burst of concurrent requests arriving on
 *   a cold instance share one load instead of each starting their own. Caching the
 *   resolved value cannot do this — every request in the burst sees an empty cache.
 * - **A rejected load is not cached.** Storing a failure for the full TTL turns a blip
 *   into a guaranteed outage window; dropping it means the next request retries. The
 *   trade is that a persistent failure is retried once per request, which is the right
 *   way round for something whose fallback is "keep the shop open".
 * - **The clock is injectable.** Expiry is testable by passing a counter, which is both
 *   faster and less brittle than manipulating global timers.
 */

export interface TtlCache<T> {
  /** Cached value, loading it first if absent or expired. */
  get(): Promise<T>;
  /** Force the next `get` to reload. Call after a write that changes the value. */
  invalidate(): void;
}

export interface TtlCacheOptions {
  /** How long a loaded value stays fresh. */
  ttlMs: number;
  /** Clock, for tests. Defaults to `Date.now`. */
  now?: () => number;
}

export function createTtlCache<T>(
  load: () => Promise<T>,
  { ttlMs, now = Date.now }: TtlCacheOptions,
): TtlCache<T> {
  let entry: { value: Promise<T>; expiresAt: number } | null = null;

  return {
    get(): Promise<T> {
      if (entry && now() < entry.expiresAt) return entry.value;

      const value = load();
      const fresh = { value, expiresAt: now() + ttlMs };
      entry = fresh;

      /*
       * Clear on failure, but only if this load is still the current one. Without the
       * identity check a slow failing load could evict a newer successful value that
       * replaced it after an `invalidate`.
       */
      value.catch(() => {
        if (entry === fresh) entry = null;
      });

      return value;
    },

    invalidate(): void {
      entry = null;
    },
  };
}
