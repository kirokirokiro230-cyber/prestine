/**
 * Twilio Verify.
 *
 * A different Twilio product from `sms.ts`, and not a drop-in replacement for it: a
 * Messaging Service or a phone number sends a message you compose, but a Verify
 * *Service* — its SID starts `VA`, not `MG` — generates the code, texts it, tracks
 * attempts and decides expiry entirely on Twilio's side. Nothing about a code is ever
 * visible to this application; there is no digit to hash and no digit to check against.
 *
 * `otp.ts` calls in here instead of `sms.ts` whenever a Verify Service SID is
 * configured, and falls back to generating and checking its own code otherwise. The
 * two paths are mutually exclusive per deployment: whichever credential is set decides
 * which product texts the shopper, and `otp.ts` is where that choice is made.
 */

export interface VerifyConfig {
  accountSid: string;
  authToken: string;
  serviceSid: string;
}

/**
 * Verify settings, or null when they are not all present.
 *
 * All or nothing, the same contract every other transport in this project uses. A
 * `TWILIO_VERIFY_SERVICE_SID` with no account credentials (or the reverse) is a
 * configuration that cannot ever succeed, and failing it loudly here is better than
 * discovering it from a rejected API call mid-signup.
 */
export function verifyConfig(): VerifyConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID?.trim();

  if (!accountSid || !authToken || !serviceSid) return null;

  return { accountSid, authToken, serviceSid };
}

/** True when a Verify Service is wired up. Decides which transport `otp.ts` uses. */
export function verifyConfigured(): boolean {
  return verifyConfig() !== null;
}

function authHeader(config: VerifyConfig): string {
  return `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`;
}

export type StartVerificationResult =
  | { status: "sent" }
  | { status: "failed"; error: string };

/**
 * Ask Twilio to generate a code and text it.
 *
 * Never throws, for the same reason `sendSms` does not: a shopper is looking at a
 * form waiting on this, and an exception here would show a crash where the honest
 * answer is "we could not send that, try again".
 */
export async function startVerification(to: string): Promise<StartVerificationResult> {
  const config = verifyConfig();
  if (!config) return { status: "failed", error: "Verify is not configured." };

  const body = new URLSearchParams({ To: to, Channel: "sms" });

  let response: Response;
  try {
    response = await fetch(
      `https://verify.twilio.com/v2/Services/${encodeURIComponent(config.serviceSid)}/Verifications`,
      {
        method: "POST",
        headers: {
          Authorization: authHeader(config),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
        // Ten seconds. This is on the request path — a shopper is waiting on it.
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      },
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Network error";
    console.error("[verify] start request failed:", error);
    return { status: "failed", error: detail };
  }

  if (!response.ok) {
    // Twilio's own message is the useful part — logged, not returned to the shopper:
    // a signup form is an unauthenticated surface and the body can name the account.
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    console.error(`[verify] start rejected (${response.status}): ${detail}`);
    return { status: "failed", error: `Provider returned ${response.status}` };
  }

  return { status: "sent" };
}

export type CheckVerificationResult =
  | { ok: true }
  | { ok: false; reason: "wrong-code" | "no-pending-verification" | "provider-error" };

/**
 * Ask Twilio whether a code is the one it sent.
 *
 * Twilio's own attempt cap and expiry apply here, invisibly to this function — a
 * `max_attempts_reached` or `expired` status both come back as `"wrong-code"`, because
 * from the shopper's side of the form both mean the same thing: this code no longer
 * works, ask for another.
 *
 * A verification Twilio has never heard of — wrong number, or one that already
 * resolved — comes back 404 from Twilio's API. That is `"no-pending-verification"`
 * rather than `"provider-error"`, because it is an ordinary outcome (a stale form, a
 * mistyped number) and not something worth logging as a fault.
 */
export async function checkVerification(
  to: string,
  code: string,
): Promise<CheckVerificationResult> {
  const config = verifyConfig();
  if (!config) return { ok: false, reason: "provider-error" };

  const body = new URLSearchParams({ To: to, Code: code });

  let response: Response;
  try {
    response = await fetch(
      `https://verify.twilio.com/v2/Services/${encodeURIComponent(config.serviceSid)}/VerificationCheck`,
      {
        method: "POST",
        headers: {
          Authorization: authHeader(config),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      },
    );
  } catch (error) {
    console.error("[verify] check request failed:", error);
    return { ok: false, reason: "provider-error" };
  }

  if (response.status === 404) {
    return { ok: false, reason: "no-pending-verification" };
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    console.error(`[verify] check rejected (${response.status}): ${detail}`);
    return { ok: false, reason: "provider-error" };
  }

  const payload = (await response.json().catch(() => null)) as
    | { status?: string; valid?: boolean }
    | null;

  if (payload?.valid === true && payload.status === "approved") {
    return { ok: true };
  }

  return { ok: false, reason: "wrong-code" };
}
