import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/server/auth";
import { isStoreOffline } from "@/server/repositories/settings";

/**
 * Request proxy — the file Next 16 renamed from `middleware.ts`.
 *
 * Two jobs: guard `/admin`, and take the storefront offline when a merchant asks.
 *
 * The admin panel is defended in four layers, deliberately overlapping:
 *   1. Optional IP allowlist here — a 404 before anything renders.
 *   2. Session cookie presence here — redirect to login before anything renders.
 *   3. `requireAdmin` on every page, which verifies the signature and re-reads the
 *      account so a disabled user fails closed.
 *   4. `requirePermission` on every mutation, which checks the role.
 *
 * Layers 3 and 4 are the actual security boundary. Layers 1 and 2 exist so an
 * attacker never gets far enough to probe them.
 *
 * Proxy always runs on the Node.js runtime, which is what makes the maintenance
 * check possible at all — it reads the store, which the edge runtime could not do.
 * That read goes through a ten-second cache, so a burst of traffic costs one query
 * rather than one per page view. See `isStoreOffline` in the settings repository.
 *
 * The admin guard here is a first line of defence, not the security boundary: it
 * only checks that a session cookie is *present*. Signature verification, expiry,
 * account status and permissions are all re-checked on the server in `requireAdmin`
 * and `requirePermission`, because a cookie is trivially forged.
 *
 * The value of doing it here is that an unauthenticated visitor is redirected
 * before any admin page renders, rather than after.
 */

export const config = {
  /**
   * Everything except Next internals, static assets and the maintenance page
   * itself. `/api` is included on purpose — the product and search endpoints
   * should go quiet during maintenance too.
   */
  matcher: [
    "/((?!_next/static|_next/image|maintenance|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|wav|mp3|ogg)$).*)",
  ],
};

const PUBLIC_ADMIN_PATHS = ["/admin/login", "/admin/setup"];

/**
 * Endpoints called by other systems, not by shoppers. See the maintenance check below
 * for why these must keep working while the storefront is closed.
 */
const MAINTENANCE_EXEMPT_PATHS = new Set([
  "/api/payments/cashfree/webhook",
  "/api/webhooks/delhivery",
  "/api/shipping/sync-tracking",
  "/api/email/review-requests",
]);

/**
 * Optional network lock on the whole admin panel.
 *
 * Set `ADMIN_IP_ALLOWLIST` to a comma-separated list of addresses and every other
 * address gets a 404 on `/admin` — including the login form, so an attacker cannot
 * even reach the password field, let alone brute-force it. This is the single most
 * effective control available if you and your staff work from known locations.
 *
 * Unset by default, because getting it wrong locks you out of your own shop. Add your
 * address, deploy, confirm you can still sign in, and only then rely on it.
 *
 * Caveat worth understanding: this trusts `x-forwarded-for`. That header is set by the
 * platform on Vercel and is reliable there. If you self-host behind nginx or Caddy you
 * must configure the proxy to set it, otherwise a client can forge it and this becomes
 * decoration.
 */
const ADMIN_IP_ALLOWLIST = (process.env.ADMIN_IP_ALLOWLIST ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

function clientIp(request: NextRequest): string | null {
  // First entry is the original client; the rest are proxies it passed through.
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip");
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  /* ---- Admin guard ---------------------------------------------------- */

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (ADMIN_IP_ALLOWLIST.length > 0) {
      const ip = clientIp(request);
      if (!ip || !ADMIN_IP_ALLOWLIST.includes(ip)) {
        // 404, not 403. A 403 confirms there is an admin panel here to attack.
        return noStore(new NextResponse(null, { status: 404 }));
      }
    }

    if (PUBLIC_ADMIN_PATHS.some((path) => pathname.startsWith(path))) {
      return noStore(NextResponse.next());
    }
    if (hasSession) return noStore(NextResponse.next());

    const login = new URL("/admin/login", request.url);
    // Remember where they were headed so sign-in can return them there.
    if (pathname !== "/admin") login.searchParams.set("next", pathname + search);
    return noStore(NextResponse.redirect(login));
  }

  /* ---- Maintenance mode ----------------------------------------------- */

  // Signed-in staff keep full access, which is the point of the feature: it exists
  // so a merchant can reprice or restyle with the shop closed and still check the
  // result on the live site.
  if (hasSession) return NextResponse.next();

  /*
   * Machine-to-machine endpoints stay open while the shop is closed.
   *
   * Maintenance mode exists to stop shoppers browsing, and it was answering these with
   * a 503 as well. That has real costs: Cashfree's payment webhook is refused, so a
   * customer who paid just before the shop closed is not recorded as paid until it
   * reopens; Delhivery's webhook is refused; and the scheduled tracking sweep gets a 503,
   * so parcels stop advancing for as long as the shop is shut.
   *
   * Safe to exempt because none of them rely on this gate: each refuses a caller without
   * its own credential (a signature, or a bearer secret that is checked in constant time
   * and fails closed when unset). The list is exact paths, not a prefix, so a new route
   * under /api is closed during maintenance unless someone opts it in here on purpose.
   */
  if (MAINTENANCE_EXEMPT_PATHS.has(pathname)) return NextResponse.next();

  // Cached with a short TTL and failing open — see `src/server/maintenance.ts`. This
  // runs on every storefront request, so it must not be a query per page view.
  if (!(await isStoreOffline())) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "The store is temporarily closed." },
      { status: 503, headers: { "Retry-After": "3600", "Cache-Control": "no-store" } },
    );
  }

  /**
   * Rewrite rather than redirect, so the shopper keeps the URL they asked for and
   * lands on it once the shop reopens.
   *
   * The response is a 200 carrying the maintenance page, not a 503 — Next does not
   * let middleware change the status of a rewritten page render. The page is
   * `noindex`, so nothing gets indexed in place of the real content. If a strict
   * 503 matters for your SEO, close the shop at the CDN or load balancer instead;
   * this flag is meant for short windows.
   */
  const response = NextResponse.rewrite(new URL("/maintenance", request.url));
  response.headers.set("Retry-After", "3600");
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/** Admin responses must never sit in a shared proxy cache. */
function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  return response;
}
