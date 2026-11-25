/**
 * How a text message leaves the building, on the local OTP path.
 *
 * `otp.ts` only ever calls `sendSms` when no hosted OTP provider (2Factor —
 * `src/server/twofactor.ts`) is configured: this application has generated its own
 * code and needs to text it. There is currently no second SMS transport wired up for
 * that path — 2Factor's own transactional SMS API needs a registered DLT template and
 * sender id (an Indian regulatory requirement, not just an API key), which is a
 * separate onboarding step from the OTP AUTOGEN flow this store actually uses, so it
 * is not implemented speculatively here.
 *
 * That leaves exactly the same fallback a fresh clone with no provider at all has
 * always had: the code is printed to the server console instead of delivered. This is
 * deliberate, not a placeholder — a developer has to be able to complete a signup
 * with no SMS account of any kind, and printing the code is what makes that possible.
 * It is loud about it, for the same reason it always was: a line that says a code was
 * **not** sent is the difference between "SMS is not configured" and "SMS is broken".
 *
 * If a transactional-SMS path is ever added here (2Factor's `ADDON_SERVICES/SEND/*`
 * endpoints, once a template and sender id are registered), it belongs behind the same
 * contract `sendSms` already exposes — nothing above this file needs to change.
 */

export type SmsResult =
  | { status: "sent" }
  | { status: "logged" }
  | { status: "failed"; error: string };

/**
 * Send one message.
 *
 * Never throws. Delivery is one half of a flow whose other half is a form waiting on a
 * response, and an exception escaping here would show a shopper a crash where the
 * honest answer is "we could not send that, try again". Failures come back as a value,
 * the same contract `checkPincode` and every other provider call in `src/server/` use.
 */
export async function sendSms(to: string, body: string): Promise<SmsResult> {
  /*
   * Deliberately loud, and deliberately including the code.
   *
   * This is the only way to complete a signup with no SMS provider configured at all,
   * so the message has to be readable rather than redacted. On a production host with
   * TWOFACTOR_API_KEY unset, this line is the bug report.
   */
  console.info(
    `[sms] no SMS transport configured — would send to ${to}: ${body} ` +
      "Set TWOFACTOR_API_KEY to send OTPs through 2Factor.in instead of logging them.",
  );
  return { status: "logged" };
}
