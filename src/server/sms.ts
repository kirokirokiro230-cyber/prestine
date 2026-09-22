/**
 * How a text message actually leaves the building.
 *
 * The same two-driver shape as `src/server/email/transport.ts` and
 * `src/server/storage.ts`, for the same reason: one artefact runs locally and in
 * production, and which driver is live is decided by the environment rather than a build
 * flag.
 *
 * - **twilio** — HTTP API, used when the account SID, auth token and a sender are all set.
 * - **log** — the default. Prints what would have been sent and delivers nothing.
 *
 * ## Why `log` is the default rather than an error
 *
 * Because a developer has to be able to complete a signup on a fresh clone. With no
 * Twilio account the code is written to the server console, which is enough to finish
 * the flow and see every state the real thing produces. The alternative — refusing to
 * issue a code without credentials — makes the whole account system untestable until
 * someone's card details are in a vendor dashboard.
 *
 * It is loud about it. A line in the log that says the code was **not** sent is the
 * difference between "SMS is not configured" and "SMS is broken", and those two have
 * very different fixes.
 *
 * ## No SDK
 *
 * `twilio` is a large dependency for one POST with a form-encoded body, and this project
 * has six runtime dependencies and a bundle check in CI. `fetch` does it natively.
 *
 * ## No retries
 *
 * A failed send is reported to the caller as a value and left. The shopper is looking at
 * a screen with a resend button on it, which is a better retry than anything this file
 * could schedule — it happens only when a human confirms the message really did not
 * arrive, and it issues a fresh code rather than re-sending a stale one.
 */

export type SmsDriver = "twilio" | "log";

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  /**
   * Either an E.164 number, an alphanumeric sender ID, or a Messaging Service SID
   * beginning `MG`. Which one it is decides the parameter it is sent as.
   */
  sender: string;
}

/**
 * Twilio settings, or null when they are not all present.
 *
 * All or nothing, the same contract `resendConfig` and `supabaseStorageConfig` use. A
 * half-configured transport that silently degrades is how you discover weeks later that
 * nobody has been able to register.
 *
 * The sender lives in the environment rather than in store settings because it has to be
 * a number or sender ID provisioned on the Twilio account. A merchant typing an arbitrary
 * value into an admin form would produce sends rejected at the provider — a failure with
 * no visible cause, and the worst kind to debug.
 */
export function twilioConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  /*
   * Two names for the sender because Twilio has two ways to nominate one and accounts
   * are set up both ways. A Messaging Service is the better answer for anything at scale
   * — it handles sender pools and per-country compliance — but a single number is what a
   * new account has, so both are accepted.
   */
  const sender =
    process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() ||
    process.env.TWILIO_FROM_NUMBER?.trim();

  if (!accountSid || !authToken || !sender) return null;

  return { accountSid, authToken, sender };
}

export function smsDriver(): SmsDriver {
  return twilioConfig() ? "twilio" : "log";
}

/** True when a real provider is wired up. Drives the notice on the signup screen. */
export function smsConfigured(): boolean {
  return smsDriver() === "twilio";
}

export type SmsResult =
  | { status: "sent" }
  | { status: "logged" }
  | { status: "failed"; error: string };

/**
 * Send one message.
 *
 * Never throws. Delivery is one half of a flow whose other half is a form waiting on a
 * response, and an exception escaping here would show a shopper a crash where the honest
 * answer is "we could not send that, try again". Failures come back as a value, the same
 * contract `sendEmail`, `putObject` and `checkPincode` already use.
 */
export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const config = twilioConfig();

  if (!config) {
    /*
     * Deliberately loud, and deliberately including the code.
     *
     * This is the only way to complete a signup on a machine with no Twilio account, so
     * the message has to be readable rather than redacted. It only ever runs when no
     * provider is configured — which, on a production host, is itself the bug this line
     * is reporting.
     */
    console.info(
      `[sms] not configured — would send to ${to}: ${body} ` +
        "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER to deliver it.",
    );
    return { status: "logged" };
  }

  /*
   * A Messaging Service SID goes in `MessagingServiceSid`; a number or alphanumeric
   * sender ID goes in `From`. Twilio now also accepts an MG SID in `From`, but being
   * explicit means a misconfigured value fails with the provider naming the right
   * parameter instead of a generic "invalid From".
   */
  const parameters = new URLSearchParams({ To: to, Body: body });
  if (config.sender.startsWith("MG")) {
    parameters.set("MessagingServiceSid", config.sender);
  } else {
    parameters.set("From", config.sender);
  }

  const credentials = Buffer.from(
    `${config.accountSid}:${config.authToken}`,
  ).toString("base64");

  let response: Response;
  try {
    response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: parameters.toString(),
        /*
         * Ten seconds, matching the email transport. Unlike email this one *is* on the
         * request path — a shopper is waiting on it — so an unbounded fetch would hold
         * the signup form open until the platform killed the invocation, which produces
         * no error the form can render.
         */
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      },
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Network error";
    console.error("[sms] send request failed:", error);
    return { status: "failed", error: detail };
  }

  if (!response.ok) {
    /*
     * Twilio's own message is the useful part — "unverified number on a trial account",
     * "region not enabled for SMS" — so it is logged, truncated. It is **not** returned
     * to the shopper: the response body can name the account and the sender, and a
     * signup form is an unauthenticated surface.
     */
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    console.error(`[sms] send rejected (${response.status}): ${detail}`);
    return {
      status: "failed",
      error: `Provider returned ${response.status}`,
    };
  }

  return { status: "sent" };
}
