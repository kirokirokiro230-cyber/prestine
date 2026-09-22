/**
 * Which image hosts the Next optimiser is allowed to fetch, and a guard for the rest.
 *
 * ## Why this exists
 *
 * `next/image` does not degrade when handed a host that is missing from
 * `images.remotePatterns` — it throws, and in the App Router that surfaces as an error
 * page rather than a broken image. Meanwhile the admin panel accepts any absolute
 * `https://` URL for product photography, banners and category tiles, because a CDN is a
 * legitimate place to keep images.
 *
 * Those two facts together mean pasting a URL into a text field can take down the home
 * page, and the person who did it cannot fix it — the allow-list lives in
 * `next.config.ts`, which is not something a merchant can edit.
 *
 * So: hosts on this list go through the optimiser and get AVIF, resizing and caching.
 * Anything else renders as a plain `<img>`. Unoptimised, but on the page.
 *
 * ## Single source of truth
 *
 * `next.config.ts` builds its `remotePatterns` from this same array. Keeping two lists in
 * step by hand is how you end up with a guard that says yes to a host the optimiser
 * rejects, which is precisely the crash this is meant to prevent.
 */

/**
 * Hosts with a standing entry in `remotePatterns`.
 *
 * The Supabase bucket host is not here because it is derived from `SUPABASE_URL` at
 * runtime — see `supabaseImageHost` below.
 */
export const OPTIMISED_IMAGE_HOSTS = ["images.unsplash.com", "cdn.shopify.com"] as const;

/**
 * The bucket hostname, when Storage is configured.
 *
 * `URL` parsing rather than a regex so a malformed value yields null instead of a broken
 * pattern, and so this behaves identically to the derivation in `next.config.ts`.
 */
export function supabaseImageHost(): string | null {
  /*
   * The public variable first, because this function also runs in the browser.
   *
   * `SUPABASE_URL` is server-only: Next replaces `process.env.X` in client bundles only
   * for `NEXT_PUBLIC_` names, so on the client it is `undefined`. That made
   * `canOptimiseImage` answer "no" in the browser and "yes" on the server for the very
   * same bucket URL — a hydration mismatch on every uploaded photograph, where the
   * server sent an optimised `next/image` and the client wanted a plain `<img>`.
   *
   * `next.config.ts` derives the value and inlines it through its `env` option, so no new
   * configuration is needed. A bucket hostname is not a secret — it is in every image URL
   * on the page already.
   */
  const published = process.env.NEXT_PUBLIC_SUPABASE_IMAGE_HOST?.trim();
  if (published) return published;

  const origin = process.env.SUPABASE_URL?.trim();
  if (!origin) return null;
  try {
    return new URL(origin).hostname;
  } catch {
    return null;
  }
}

/**
 * True when `next/image` can safely be handed this source.
 *
 * Relative paths are same-origin and always fine — that covers every uploaded image
 * under the disk driver. A protocol-relative or non-http URL is refused outright rather
 * than guessed at.
 */
export function canOptimiseImage(src: string): boolean {
  const value = src.trim();
  if (!value) return false;

  // Same-origin, but not `//host/path`, which is a remote URL wearing a local shape.
  if (value.startsWith("/") && !value.startsWith("//")) return true;

  try {
    const { hostname, protocol } = new URL(value);
    if (protocol !== "https:" && protocol !== "http:") return false;

    if ((OPTIMISED_IMAGE_HOSTS as readonly string[]).includes(hostname)) return true;
    return hostname === supabaseImageHost();
  } catch {
    return false;
  }
}
