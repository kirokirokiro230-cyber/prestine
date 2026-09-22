/**
 * Tiny observable stores over localStorage.
 *
 * Why this exists rather than `useState` + an effect: browser storage is an
 * external system, and React's own answer for reading one is
 * `useSyncExternalStore`. Going through a store gives us three things an effect
 * cannot:
 *
 * 1. No cascading render on mount — the value is read during render, not after.
 * 2. Correct hydration — `getServerSnapshot` returns the fallback so server and
 *    client markup match, then React re-renders once with the real value.
 * 3. Every consumer of the same key stays in step, including across tabs.
 *
 * Snapshot identity matters: `read()` caches by the raw stored string so it
 * returns a referentially stable value while nothing has changed. Without that,
 * `useSyncExternalStore` would loop.
 */

type Listener = () => void;

export interface BrowserStore<T> {
  key: string;
  read: () => T;
  write: (next: T) => void;
  subscribe: (listener: Listener) => () => void;
  serverSnapshot: () => T;
}

/** JSON-serialised store, for objects and arrays. */
export function createJsonStore<T>(key: string, fallback: T): BrowserStore<T> {
  let cachedRaw: string | null = null;
  let cachedValue: T = fallback;
  let primed = false;

  const listeners = new Set<Listener>();

  const read = (): T => {
    if (typeof window === "undefined") return fallback;

    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      // Storage blocked (private mode, disabled cookies) — behave as if empty.
      return cachedValue;
    }

    if (primed && raw === cachedRaw) return cachedValue;

    let value = fallback;
    if (raw !== null) {
      try {
        value = JSON.parse(raw) as T;
      } catch {
        // Corrupt payload from an older schema — fall back rather than throw.
        value = fallback;
      }
    }

    cachedRaw = raw;
    cachedValue = value;
    primed = true;
    return value;
  };

  const write = (next: T) => {
    const raw = JSON.stringify(next);
    cachedRaw = raw;
    cachedValue = next;
    primed = true;

    try {
      window.localStorage.setItem(key, raw);
    } catch {
      // Quota or blocked storage: keep the in-memory value so the session works.
    }

    for (const listener of listeners) listener();
  };

  const subscribe = (listener: Listener) => {
    listeners.add(listener);

    const onStorage = (event: StorageEvent) => {
      if (event.key !== key) return;
      primed = false; // force a re-read on the next snapshot
      listener();
    };

    window.addEventListener("storage", onStorage);

    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  };

  return { key, read, write, subscribe, serverSnapshot: () => fallback };
}

/**
 * Raw-string store. Used for the theme, because the pre-paint script in the
 * document head reads the same key and must not have to parse JSON.
 */
export function createStringStore<T extends string>(
  key: string,
  fallback: T,
  allowed: readonly T[],
): BrowserStore<T> {
  const listeners = new Set<Listener>();

  const read = (): T => {
    if (typeof window === "undefined") return fallback;
    try {
      const raw = window.localStorage.getItem(key) as T | null;
      return raw && allowed.includes(raw) ? raw : fallback;
    } catch {
      return fallback;
    }
  };

  const write = (next: T) => {
    try {
      window.localStorage.setItem(key, next);
    } catch {
      /* ignore */
    }
    for (const listener of listeners) listener();
  };

  const subscribe = (listener: Listener) => {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  };

  return { key, read, write, subscribe, serverSnapshot: () => fallback };
}
