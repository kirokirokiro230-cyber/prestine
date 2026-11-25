/**
 * 2Factor.in — hosted SMS OTP.
 *
 * Same role in this app as `verify.ts` (Twilio Verify) used to play: a provider that
 * generates the code, texts it, tracks its own expiry and attempt cap, and never lets
 * this application see a digit. `otp.ts` calls in here whenever a 2Factor API key is
 * configured, in preference to generating and checking its own code.
 *
 * ## Why this one needs a session id and Twilio Verify did not
 *
 * Twilio's check-code call takes the phone number and the code — nothing else to carry
 * between "sent" and "checked". 2Factor's AUTOGEN call instead returns a session id
 * (`Details` in its response) that the later verify call requires:
 * `SMS/VERIFY/{session_id}/{otp}`. That id has nowhere else to live between the two
 * calls except the `phone_verifications` row already tracking this attempt, hence
 * `provider_ref` on that table (see `00000000000007_twofactor_otp.sql`) and
 * `providerRef` on `PhoneVerification` (`src/lib/types.ts`) — `otp.ts` writes it when
 * issuing a code and reads it back when checking one.
 *
 * ## No SDK
 *
 * 2Factor's API is plain HTTP GET with the API key and phone number in the URL path —
 * there is no official Node SDK worth adding a dependency for for two calls, matching
 * every other provider integration in `src/server/` (`sms.ts`, `verify.ts`,
 * `cashfree.ts`, `delhivery.ts`).
 *
 * ## Phone format
 *
 * `otp.ts` always normalises to E.164 (`+919876543210`) before calling anything here —
 * see `src/lib/phone.ts`. 2Factor's own examples pass the number without the leading
 * `+`, so that stripping happens once, in this file, rather than asking `otp.ts` to
 * know a provider-specific quirk.
 */

export interface TwoFactorConfig {
  apiKey: string;
  /**
   * The name of an APPROVED OTP template in the 2Factor dashboard (SMS OTP → OTP
   * Templates). Without one, 2Factor's own routing decides the channel per number
   * and can fall back to a voice call instead of SMS — appending an approved
   * template name to the AUTOGEN call is what forces SMS delivery through that
   * specific, already-approved message.
   */
  templateName?: string;
}

/**
 * 2Factor settings, or null when not configured.
 *
 * `apiKey` is the only required credential — a single key with nothing partial to
 * have, the same all-or-nothing shape as every other provider config in this
 * project. `templateName` is optional so a fresh account can still send *something*
 * (2Factor's own default routing, which may be voice) before an OTP template has
 * been created and approved in the dashboard; once one exists, setting
 * `TWOFACTOR_TEMPLATE_NAME` switches delivery to SMS through it.
 */
export function twoFactorConfig(): TwoFactorConfig | null {
  const apiKey = process.env.TWOFACTOR_API_KEY?.trim();
  if (!apiKey) return null;
  const templateName = process.env.TWOFACTOR_TEMPLATE_NAME?.trim() || undefined;
  return { apiKey, templateName };
}

/** True when a 2Factor API key is set. Decides which hosted provider `otp.ts` uses. */
export function twoFactorConfigured(): boolean {
  return twoFactorConfig() !== null;
}

/** 2Factor expects the bare national/international digits, no leading `+`. */
function stripPlus(phone: string): string {
  return phone.replace(/^\+/, "");
}

interface TwoFactorResponse {
  Status?: string;
  Details?: string;
}

export type StartTwoFactorResult =
  | { status: "sent"; sessionId: string }
  | { status: "failed"; error: string };

/**
 * Ask 2Factor to generate a code and text it.
 *
 * Never throws, for the same reason every other transport here does not: a shopper is
 * looking at a form waiting on this, and an exception would show a crash where the
 * honest answer is "we could not send that, try again".
 */
export async function startTwoFactorOtp(to: string): Promise<StartTwoFactorResult> {
  const config = twoFactorConfig();
  if (!config) return { status: "failed", error: "2Factor is not configured." };

  /*
   * Appending an approved template name as a further path segment
   * (`AUTOGEN/{template}`) tells 2Factor to send via SMS through that specific,
   * pre-approved message rather than letting its own routing pick a channel — see
   * `TwoFactorConfig.templateName`'s own note on why that matters.
   */
  const url =
    `https://2factor.in/API/V1/${encodeURIComponent(config.apiKey)}` +
    `/SMS/${encodeURIComponent(stripPlus(to))}/AUTOGEN` +
    (config.templateName ? `/${encodeURIComponent(config.templateName)}` : "");

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      // Ten seconds, matching every other provider call on this request path — a
      // shopper is waiting on it.
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Network error";
    console.error("[2factor] send request failed:", error);
    return { status: "failed", error: detail };
  }

  const payload = (await response.json().catch(() => null)) as TwoFactorResponse | null;

  if (!response.ok || payload?.Status !== "Success" || !payload.Details) {
    /*
     * 2Factor returns 200 with `Status: "Error"` for most failures rather than a
     * non-2xx status, so both cases are checked. Its own message is logged, not
     * returned to the shopper — a signup form is an unauthenticated surface, and the
     * body can describe account-level problems (e.g. exhausted balance).
     */
    console.error(
      `[2factor] send rejected (${response.status}): ${payload?.Details ?? "no details"}`,
    );
    return { status: "failed", error: payload?.Details ?? `Provider returned ${response.status}` };
  }

  // `Details` on a successful AUTOGEN call is the session id the later verify call
  // needs — see this file's own note on why that has to be threaded through.
  return { status: "sent", sessionId: payload.Details };
}

export type CheckTwoFactorResult =
  | { ok: true }
  | { ok: false; reason: "wrong-code" | "no-pending-verification" | "provider-error" };

/**
 * Ask 2Factor whether a code matches the session from `startTwoFactorOtp`.
 *
 * 2Factor's own attempt cap and expiry apply invisibly here — an expired or
 * exhausted session comes back the same as a wrong code, because from the shopper's
 * side of the form both mean "that code no longer works, ask for another".
 */
export async function checkTwoFactorOtp(
  sessionId: string,
  code: string,
): Promise<CheckTwoFactorResult> {
  const config = twoFactorConfig();
  if (!config) return { ok: false, reason: "provider-error" };

  const url =
    `https://2factor.in/API/V1/${encodeURIComponent(config.apiKey)}` +
    `/SMS/VERIFY/${encodeURIComponent(sessionId)}/${encodeURIComponent(code)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch (error) {
    console.error("[2factor] check request failed:", error);
    return { ok: false, reason: "provider-error" };
  }

  const payload = (await response.json().catch(() => null)) as TwoFactorResponse | null;

  if (!response.ok) {
    console.error(`[2factor] check rejected (${response.status}): ${payload?.Details ?? ""}`);
    return { ok: false, reason: "provider-error" };
  }

  /*
   * A session 2Factor has never heard of, or one that already resolved, comes back
   * `Status: "Error"` with a message naming the reason (expired, invalid session,
   * OTP mismatch) rather than a distinct HTTP status the way Twilio's 404 was. There
   * is no reliable substring to split "no such session" from "wrong code" on, so
   * both collapse to the same outcome a stale form and a mistyped code already share
   * on Twilio's path — "wrong-code" — except for the specific expiry message, called
   * out separately only because `otp.ts` has no other way to learn that distinction.
   */
  if (payload?.Status === "Success" && payload.Details === "OTP Matched") {
    return { ok: true };
  }

  if (payload?.Details?.toLowerCase().includes("expired")) {
    return { ok: false, reason: "no-pending-verification" };
  }

  return { ok: false, reason: "wrong-code" };
}
