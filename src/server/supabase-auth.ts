import { sql } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "./db/client";

/**
 * The Supabase Auth bridge.
 *
 * This app authenticates customers with its own phone-OTP flow (`otp.ts`) and its own
 * signed-cookie session (`customer-session.ts`); Supabase's phone provider stays
 * disabled and never issues or checks a code. What this module does is the *bridge*: on
 * a successful OTP verification, ensure a matching `auth.users` row exists and hand back
 * its id, which the caller records on `customers.authUserId`. That id is what row-level
 * security reads through `auth.uid()`, so it is the link between "this app decided the
 * code was right" and "the database will let this identity read its own rows".
 *
 * ## Plain `fetch`, deliberately — same call as `storage.ts`
 *
 * `@supabase/supabase-js` wraps the GoTrue admin endpoint used here but pulls in a
 * realtime client, a Postgres client and the browser auth client to do it. `storage.ts`
 * already talks to Supabase over `fetch` for exactly this reason; this follows suit and
 * touches only the one admin endpoint it needs. The service-role key is server-only and
 * bypasses RLS, so nothing here may ever run in the browser.
 *
 * ## Fails soft
 *
 * The bridge is not allowed to block a sign-in. A customer who has proven they hold their
 * number must get their session whether or not Supabase Auth is reachable — the column is
 * nullable precisely so it can be filled in on a later successful verification. Every
 * function here therefore returns `null` rather than throwing, and logs the reason.
 */

interface AuthAdminConfig {
  /** Project URL, without a trailing slash. */
  origin: string;
  serviceRoleKey: string;
}

/** Trailing slashes make every later template string ambiguous. Strip once, here. */
function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/**
 * Read the Supabase Auth admin settings, or null when they are not present.
 *
 * Reuses the same two variables `storage.ts` reads — the service-role credential and the
 * project URL are the same Supabase project. When either is absent the bridge is simply
 * off (local development on the JSON store, or a deployment that has not been pointed at
 * Supabase Auth yet), and the caller carries on with its own session unchanged.
 */
function authAdminConfig(): AuthAdminConfig | null {
  const origin = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!origin || !serviceRoleKey) return null;
  return { origin: trimSlash(origin), serviceRoleKey };
}

/** True when the bridge is configured and can be attempted. */
export function supabaseAuthConfigured(): boolean {
  return authAdminConfig() !== null;
}

/**
 * The `auth.users` id for a number that already has an identity, or null.
 *
 * A direct query against `auth.users` rather than paging the admin REST API: the list
 * endpoint offers no phone filter, so finding one number would mean walking every page.
 * The phone is stored in the same E.164 spelling on both sides (the repository
 * normalises `customers.phone`, and this module hands Supabase that same value on
 * create), so an equality match is exact.
 */
export async function findAuthUserIdByPhone(phone: string): Promise<string | null> {
  if (!isDatabaseConfigured()) return null;

  try {
    // postgres-js `execute` resolves to a RowList, which is an array of row objects.
    const rows = await getDb().execute<{ id: string }>(
      sql`select id from auth.users where phone = ${phone} limit 1`,
    );
    const row = rows.at(0);
    return row?.id ?? null;
  } catch (error) {
    console.error("[supabase-auth] lookup by phone failed:", error);
    return null;
  }
}

/**
 * Ensure an `auth.users` identity exists for this number and return its id, or null.
 *
 * Create-then-reconcile: the common path is a brand-new number, so it attempts the
 * create first and only falls back to a lookup when Supabase reports the phone already
 * exists (a returning number, or a row created out of band). `phone_confirm: true`
 * marks the number as verified without Supabase sending its own code — this app already
 * proved the number over its own OTP, and the provider that would send one is disabled.
 *
 * Returns null on any failure. The caller must treat a null as "no identity linked yet"
 * and proceed with the session regardless — see the module note on failing soft.
 */
export async function ensureAuthUser(phone: string): Promise<string | null> {
  const config = authAdminConfig();
  if (!config) return null;

  const endpoint = `${config.origin}/auth/v1/admin/users`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        // GoTrue wants the service-role key in both slots: `apikey` for the API gateway
        // and `Authorization` for the admin authorization itself.
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ phone, phone_confirm: true }),
      cache: "no-store",
    });
  } catch (error) {
    console.error("[supabase-auth] create request failed:", error);
    return null;
  }

  if (response.ok) {
    const created = (await response.json().catch(() => null)) as { id?: string } | null;
    if (created?.id) return created.id;
    console.error("[supabase-auth] create returned no id");
    return null;
  }

  /*
   * A number that already has an identity comes back as a duplicate. That is the
   * returning-customer case, not an error: look the existing row up and link to it. The
   * status GoTrue uses for this has moved between versions (409, and 422 with a
   * `phone_exists`/`user_already_exists` code), so a lookup fallback is triggered for
   * any duplicate-shaped rejection rather than a single status.
   */
  const detail = await response.text().catch(() => "");
  const duplicate =
    response.status === 409 ||
    response.status === 422 ||
    /already.*(registered|exists)|phone_exists|user_already_exists/i.test(detail);

  if (duplicate) {
    return findAuthUserIdByPhone(phone);
  }

  // Anything else is logged (it can name internal configuration) and treated as "no
  // identity yet" so the sign-in still completes.
  console.error(`[supabase-auth] create rejected (${response.status}): ${detail}`);
  return null;
}
