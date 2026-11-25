import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import { OPTIMISED_IMAGE_HOSTS } from "./src/lib/image-hosts";

/**
 * Load `.env.local` / `.env` before anything below reads `process.env`.
 *
 * Next evaluates this file *before* it loads the env files, so `process.env.SUPABASE_URL`
 * is undefined here unless it happens to be a real OS-level variable. On Netlify and
 * Vercel it is one, which is why this was invisible in production — but locally the value
 * lives in `.env.local`, so `SUPABASE_IMAGE_HOST` silently resolved to null and
 * `next/image` answered every Supabase URL with `"url" parameter is not allowed`.
 *
 * `@next/env` ships with Next and is the documented way to do this. Calling it twice is
 * harmless: Next calls it again itself moments later and the result is identical.
 */
loadEnvConfig(process.cwd());

/**
 * Hostname of the Supabase Storage bucket, when one is configured.
 *
 * Derived here rather than imported from `src/server/storage.ts`: this file is loaded by
 * the Next CLI before the TypeScript path aliases exist, so `@/server/...` does not
 * resolve. `URL` parsing rather than a regex, so a malformed value yields null and the
 * build carries on with the fixed hosts instead of emitting a broken pattern.
 */
const SUPABASE_IMAGE_HOST = (() => {
  const origin = process.env.SUPABASE_URL?.trim();
  if (!origin) return null;
  try {
    return new URL(origin).hostname;
  } catch {
    return null;
  }
})();

/**
 * Security headers.
 *
 * Split into two sets: a baseline for the whole site, and a stricter set for
 * `/admin` where the cost of a mistake is the whole store rather than one page.
 */
const BASE_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-Frame-Options", value: "DENY" },
];

/**
 * CSP, built separately from `BASE_HEADERS` because it differs between dev and
 * production rather than only being added/removed like `HSTS` below.
 *
 * `frame-ancestors 'none'` stops clickjacking (nobody may frame this site) and is
 * safe unconditionally. `script-src`/`connect-src`/`frame-src` additionally allow
 * Cashfree's own domains for checkout — its script (`sdk.cashfree.com`) calls out
 * to `api.cashfree.com`, and the hosted payment page itself is framed from
 * `sandbox.cashfree.com` (test) or `payments.cashfree.com` (live). Per Cashfree's
 * own CSP guidance for Cashfree.js: without these, a strict CSP can block the
 * payment script or the hosted checkout with no error a shopper (or a support
 * ticket) would ever surface as "the CSP did it".
 *
 * `'unsafe-eval'` is included **only in development**: Next/React's own dev-mode
 * tooling (source-mapped stack traces, Fast Refresh) calls `eval()`, and a
 * `script-src` with no `'unsafe-eval'` breaks that outright — visible as `eval()
 * is not supported in this environment` in the console, not as anything related
 * to Cashfree. React's own docs are explicit that production builds never call
 * `eval()`, so production keeps the tighter policy.
 */
function contentSecurityPolicy(production: boolean): string {
  return [
    "frame-ancestors 'none'",
    `script-src 'self' 'unsafe-inline' ${production ? "" : "'unsafe-eval' "}https://sdk.cashfree.com`,
    // `sdk.cashfree.com` here too: the SDK script fetches its own sourcemap
    // (`cashfree.js.map`) via a request that `connect-src` governs, not `script-src`
    // — omitting it blocks that fetch outright and breaks the whole SDK load, not
    // merely dev-mode debugging.
    "connect-src 'self' https://sdk.cashfree.com https://api.cashfree.com https://sandbox.cashfree.com",
    "frame-src https://sdk.cashfree.com https://api.cashfree.com https://sandbox.cashfree.com https://payments.cashfree.com https://payments-test.cashfree.com",
  ].join("; ");
}

/**
 * HSTS. Tells browsers to refuse plain HTTP to this host for a year, which closes
 * the redirect window an attacker on the same network could otherwise intercept.
 *
 * Only sent in production: setting this on localhost would pin your machine to
 * HTTPS for every local project on that port. Add `preload` and submit to
 * hstspreload.org once you are confident the domain and all subdomains are
 * HTTPS-only — it is effectively irreversible.
 */
const HSTS = {
  key: "Strict-Transport-Security",
  value: "max-age=31536000; includeSubDomains",
};

/**
 * Admin-only headers.
 *
 * `X-Robots-Tag` is belt-and-braces alongside the `noindex` metadata: a crawler that
 * somehow reaches an admin URL gets the instruction in the response headers even if
 * it never parses the HTML. `no-store` keeps admin pages out of every shared cache
 * and out of the browser's back-forward cache, so a signed-out session cannot be
 * recovered with the back button.
 */
const ADMIN_HEADERS = [
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
  { key: "Cache-Control", value: "no-store, max-age=0, must-revalidate" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /**
   * Publish the bucket hostname to the client bundle.
   *
   * `canOptimiseImage` in `src/lib/image-hosts.ts` runs on both sides of the boundary and
   * has to give the same answer on each, or the server renders an optimised image where
   * the client renders a plain one. `SUPABASE_URL` is server-only, so the derived hostname
   * is inlined here instead. Derived rather than a second variable to fill in, and not a
   * secret — it appears in every image URL on the page.
   */
  env: {
    NEXT_PUBLIC_SUPABASE_IMAGE_HOST: SUPABASE_IMAGE_HOST ?? "",
  },
  images: {
    /**
     * On a host with a writable disk, photography is served from `/uploads/…` — a
     * same-origin path, so it needs no entry here. On Netlify it comes from a Supabase
     * Storage bucket, and `next/image` refuses to optimise a remote host that is not on
     * this list, so that hostname is derived from `SUPABASE_URL` above. Deriving it means
     * moving the project to a different Supabase project cannot leave a stale allow-list
     * behind.
     *
     * Products without photography fall back to locally generated SVG art direction, so
     * the storefront never renders a broken image.
     *
     * The two fixed hosts remain allowed because a merchant may still paste an external
     * URL, and existing records may already hold one. Add to the list only if you
     * actually host images somewhere else.
     */
    /*
     * Built from `OPTIMISED_IMAGE_HOSTS` so the runtime guard in
     * `src/lib/image-hosts.ts` and this allow-list cannot drift. A guard that permits a
     * host the optimiser rejects is exactly the crash it exists to prevent.
     */
    remotePatterns: [
      ...(SUPABASE_IMAGE_HOST
        ? [{ protocol: "https" as const, hostname: SUPABASE_IMAGE_HOST }]
        : []),
      ...OPTIMISED_IMAGE_HOSTS.map((hostname) => ({
        protocol: "https" as const,
        hostname,
      })),
    ],
    formats: ["image/avif", "image/webp"],
    /**
     * Development only, and only because of NAT64.
     *
     * Next refuses to fetch an upstream image whose hostname resolves to a reserved IP
     * range — a DNS-rebinding guard, and a good one. On a network running DNS64/NAT64,
     * every public host also resolves to a synthesised address under `64:ff9b::/96`
     * (RFC 6052), which the check counts as reserved. Supabase then fails locally with
     * `hostname resolved to private IP` even though its real addresses are public
     * Cloudflare ones.
     *
     * Narrow by construction: `remotePatterns` above already limits the optimiser to
     * three hostnames, so disabling this cannot be pointed at an arbitrary internal
     * address — it only stops the reserved-range test being applied to those three.
     * Production keeps the guard, because a deployed host has no reason to see NAT64 and
     * that is where the blast radius is real.
     *
     * Prefer fixing it at the network level if you can: a resolver that does not
     * synthesise AAAA records (1.1.1.1, 8.8.8.8) removes the need for this entirely.
     */
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== "production",
  },
  /**
   * Pages that no longer exist, sent to what replaced them.
   *
   * `/shipping-returns` became three policy pages; its returns half is the closest match and
   * the shipping half is one link away from there. `/accessibility` was removed with the rest
   * of the template text. Permanent, so search engines and old bookmarks update.
   */
  async redirects() {
    return [
      { source: "/shipping-returns", destination: "/return-exchange-policy", permanent: true },
      { source: "/accessibility", destination: "/", permanent: true },
    ];
  },
  async headers() {
    const production = process.env.NODE_ENV === "production";
    const csp = { key: "Content-Security-Policy", value: contentSecurityPolicy(production) };

    return [
      {
        source: "/(.*)",
        headers: production ? [...BASE_HEADERS, csp, HSTS] : [...BASE_HEADERS, csp],
      },
      {
        source: "/admin/:path*",
        headers: ADMIN_HEADERS,
      },
      {
        source: "/admin",
        headers: ADMIN_HEADERS,
      },
    ];
  },
};

export default nextConfig;
