import { headers } from "next/headers";

/**
 * The calling client's address, for rate-limit keys.
 *
 * ## Why a shared helper
 *
 * This logic was duplicated in four places (`admin/actions/auth.ts`,
 * `actions/customer-auth.ts`, `actions/contact.ts`, `proxy.ts`), and three of
 * the four read only `x-forwarded-for`. That matters because the fallback is a
 * single shared bucket: on any host that does not set the header, every
 * anonymous visitor throttles as one key, so one busy shopper locks out
 * everybody.
 *
 * ## Header order
 *
 * `x-nf-client-connection-ip` first, because Netlify sets it from the actual
 * TCP connection and a client cannot forge it. `x-forwarded-for` is next and is
 * what Vercel and most reverse proxies set — but it is client-supplied unless
 * the platform overwrites it, so it is deliberately not preferred.
 *
 * Read the first entry of `x-forwarded-for`, not the last: it is a chain, and
 * the original client is at the front.
 *
 * ## The fallback
 *
 * `"unknown"` rather than `"local"`, so it reads as what it is in logs. Treat a
 * limiter keyed on it as near-useless and make sure any endpoint that matters
 * also has a second key — a phone number, an email, an order reference — that
 * does not depend on the network layer being honest.
 */
export async function clientIp(): Promise<string> {
  const list = await headers();

  return (
    list.get("x-nf-client-connection-ip")?.trim() ||
    list.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    list.get("x-real-ip")?.trim() ||
    "unknown"
  );
}
