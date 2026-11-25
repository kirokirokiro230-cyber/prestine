import { randomInt, randomUUID } from "node:crypto";
import { normalisePhone } from "@/lib/phone";
import type { OtpPurpose, PhoneVerification } from "@/lib/types";
import { hashPassword, verifyPassword } from "./auth";
import {
  clearFailedLogins,
  loginLockout,
  recordFailedLogin,
} from "./login-attempts";
import { getSettings } from "./repositories/settings";
import { sendSms, type SmsResult } from "./sms";
import { callRpc, db, insertInto, unwrap } from "./supabase";
import type { PhoneVerificationRow } from "./database.types";
import { checkTwoFactorOtp, startTwoFactorOtp, twoFactorConfigured } from "./twofactor";

function fromRow(row: PhoneVerificationRow): PhoneVerification {
  return {
    id: row.id,
    phone: row.phone,
    purpose: row.purpose,
    provider: row.provider,
    codeHash: row.code_hash ?? undefined,
    codeSalt: row.code_salt ?? undefined,
    providerRef: row.provider_ref ?? undefined,
    expiresAt: row.expires_at,
    attempts: row.attempts,
    createdAt: row.created_at,
    pendingName: row.pending_name ?? undefined,
    pendingPasswordHash: row.pending_password_hash ?? undefined,
    pendingPasswordSalt: row.pending_password_salt ?? undefined,
    pendingEmail: row.pending_email ?? undefined,
  };
}

/**
 * One-time codes for the two moments that need one.
 *
 * Signup, to prove the number belongs to the person claiming it. Password reset, to
 * re-prove it when the password behind it is gone. Nothing else — ordinary sign-in is a
 * password, and a second factor on every sign-in is a tax on the customer that buys the
 * shop very little on a storefront with no stored payment methods.
 *
 * ## What makes six digits safe
 *
 * A six-digit code is one secret in a million, which sounds weak and is not, because
 * three limits compound:
 *
 * - **Attempts are capped at five per code.** The sixth guess does not get a verdict; it
 *   burns the code. Grinding a million candidates therefore needs two hundred thousand
 *   fresh codes.
 * - **Codes expire in ten minutes.** The window to spend those guesses is small.
 * - **Issuing is rate limited.** Five codes per quarter hour per number, so those two
 *   hundred thousand codes take about a year and a half to request.
 *
 * Remove any one of the three and the other two stop being sufficient. They are not
 * defence in depth; they are three factors of the same product.
 *
 * ## What is stored
 *
 * The hash of the code, never the code. `attempts` is only a meaningful cap if a code
 * cannot be read out of the row it is checked against, and the same applies to anyone
 * holding a backup. Hashed with the password parameters — slow on purpose, so a million
 * candidates against one hash is not a shortcut around the attempt cap.
 *
 * One live code per number per purpose. Issuing replaces its predecessor, because a
 * shopper who taps resend must not end up holding two valid codes with no way to know
 * which SMS the form wants.
 */

/* ------------------------------------------------------------------ */
/* Policy                                                              */
/* ------------------------------------------------------------------ */

/** Six digits. Long enough given the caps above, short enough to read off a screen. */
const CODE_DIGITS = 6;

/**
 * Ten minutes.
 *
 * Long enough to cover a slow carrier and a shopper who put their phone down; short
 * enough that a code read over someone's shoulder is worthless by the time it is used.
 */
export const CODE_TTL_MS = 10 * 60 * 1000;

/** Wrong guesses before the code is burned rather than merely rejected. */
export const MAX_ATTEMPTS = 5;

/**
 * One minute between sends.
 *
 * Carrier delivery is routinely fifteen seconds and occasionally forty. Without a
 * cooldown, a shopper who waits ten of those seconds taps resend three times, receives
 * three messages, and reads the first one — which is now the code that no longer works.
 * The cooldown is as much about that as it is about cost.
 */
export const RESEND_COOLDOWN_MS = 60 * 1000;

/**
 * Where the issuing quota is counted.
 *
 * Reuses the sliding-window limiter that guards sign-in: same policy, same store. The
 * functions are named for failed logins because that was their first caller, but what
 * they implement is "how many times has this key done a thing in the last fifteen
 * minutes" — and the limiter already stores `ip:` keys alongside identifiers, so an
 * `otp:` key is not a new kind of contents.
 *
 * Counting this in the verification table instead would mean keeping spent codes around
 * purely to be counted, which is a worse answer than borrowing a limiter that is already
 * pruned and already tested.
 */
function quotaKey(phone: string): string {
  return `otp:${phone}`;
}

/**
 * The second quota, counted per caller rather than per number.
 *
 * The per-phone cap alone bounds nothing that costs money: every SMS goes to a
 * *different* number, so an attacker rotating numbers gets a fresh sixty-second
 * cooldown and a fresh fifteen-minute allowance each time, and each one of those is a
 * message this shop pays for. Signup is the cheapest path into it, because unlike reset
 * it will issue to a number with no account.
 *
 * Capping per address is what actually bounds the bill. It is deliberately the weaker of
 * the two keys — an address is only as trustworthy as the platform's headers — so it
 * supplements the per-phone cap rather than replacing it.
 */
function ipQuotaKey(ip: string): string {
  return `otp-ip:${ip}`;
}

/* ------------------------------------------------------------------ */
/* Issuing                                                             */
/* ------------------------------------------------------------------ */

/**
 * The account details a signup is holding until its code is confirmed.
 *
 * The password arrives here already hashed. The plaintext is never written down, not even
 * for the ten minutes a pending signup exists.
 */
export interface PendingSignup {
  name: string;
  email?: string;
  passwordHash: string;
  passwordSalt: string;
}

export type IssueResult =
  | {
      ok: true;
      /**
       * Whether the message was actually delivered. `logged` means no provider is
       * configured and the code is in the server console — the flow continues either way,
       * because refusing to sign anyone up on an unconfigured host is worse.
       */
      delivery: SmsResult["status"];
      /** When a resend will be allowed, so the form can count down rather than guess. */
      retryAfterSeconds: number;
    }
  | { ok: false; error: string };

/**
 * Issue a code and text it.
 *
 * Callers decide *whether* a number should get a code — signup refuses numbers that are
 * already registered, reset stays silent about numbers that are not. This function only
 * decides whether it is too soon, too often, or fine.
 */
export async function issueCode(input: {
  phone: string;
  purpose: OtpPurpose;
  /** Signup only. Held on the verification record until the code confirms. */
  pending?: PendingSignup;
  /**
   * The requesting address, for the per-caller SMS cap. Passed in rather than
   * read from `headers()` here so this module stays independent of request
   * context and remains testable.
   */
  ip?: string;
}): Promise<IssueResult> {
  const phone = normalisePhone(input.phone);
  if (!phone) return { ok: false, error: "Enter a valid mobile number." };

  const now = Date.now();

  /* ---- Too soon? ------------------------------------------------- */

  const live = await liveVerification(phone, input.purpose, now);
  if (live) {
    const elapsed = now - new Date(live.createdAt).getTime();
    if (elapsed < RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
      return {
        ok: false,
        error: `A code was just sent. You can ask for another in ${wait} second${wait === 1 ? "" : "s"}.`,
      };
    }
  }

  /* ---- Too often? ------------------------------------------------ */

  const lockout = await loginLockout(quotaKey(phone));
  if (lockout.locked) {
    const minutes = Math.max(1, Math.ceil(lockout.secondsRemaining / 60));
    return {
      ok: false,
      error: `Too many codes requested for that number. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    };
  }

  /*
   * The per-address cap. Deliberately worded without naming the number, since
   * this trips on a caller working through many numbers rather than on one
   * shopper's own number.
   */
  if (input.ip) {
    const byIp = await loginLockout(ipQuotaKey(input.ip));
    if (byIp.locked) {
      const minutes = Math.max(1, Math.ceil(byIp.secondsRemaining / 60));
      return {
        ok: false,
        error: `Too many codes requested recently. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      };
    }
  }

  /* ---- Issue ----------------------------------------------------- */

  /*
   * Two transports, chosen once per deployment by which credential is set. When 2Factor
   * is configured it generates, sends, expires and attempt-caps the code, so this row
   * carries no hash and only exists to hold the pending signup — plus the session id
   * needed to check the code later — between "sent" and "confirmed"; `verifyCode` reads
   * `provider` to know not to compare a local hash. Otherwise this application generates
   * the code and hashes it, the original path.
   */
  const useHostedProvider = twoFactorConfigured();
  const issuedAt = new Date(now);

  /*
   * The local path needs the plaintext once — to text it — and stores only its hash.
   * The hosted path never sees a code at all, so it generates neither.
   */
  const code = useHostedProvider ? null : generateCode();
  const local = code ? await hashPassword(code) : null;

  /*
   * The hosted send call has to happen *before* the row is written, unlike the local
   * path: it is what produces the session id (`providerRef`) the row needs to carry.
   * Doing it here rather than after the insert (as the local path's send happens)
   * would leave a row with no way to be verified if the write later failed — a strictly
   * worse partial state than simply not having sent anything yet.
   */
  let providerRef: string | undefined;
  if (useHostedProvider) {
    const started = await startTwoFactorOtp(phone);
    if (started.status === "failed") {
      return {
        ok: false,
        error: "We could not send a code to that number just now. Please try again.",
      };
    }
    providerRef = started.sessionId;
  }

  const verification: PhoneVerification = {
    id: `otp_${randomUUID().slice(0, 8)}`,
    phone,
    purpose: input.purpose,
    provider: useHostedProvider ? "2factor" : "local",
    codeHash: local?.hash,
    codeSalt: local?.salt,
    providerRef,
    expiresAt: new Date(now + CODE_TTL_MS).toISOString(),
    attempts: 0,
    createdAt: issuedAt.toISOString(),
    pendingName: input.pending?.name,
    pendingEmail: input.pending?.email,
    pendingPasswordHash: input.pending?.passwordHash,
    pendingPasswordSalt: input.pending?.passwordSalt,
  };

  /*
   * Replace this number's live code for this purpose, and sweep anything that has
   * expired anywhere. Pruning on write rather than on a schedule, for the reason
   * `recordFailedLogin` does the same: a cleanup job someone has to remember exists is
   * a cleanup job that eventually is not running.
   *
   * Two deletes rather than one `.or()`, because the two conditions are
   * independent (this number+purpose's live code, vs. anyone's expired
   * code) — combining them into a single filter would need the same
   * `.or()` string-escaping care flagged in `repositories/orders.ts`'s
   * queryOrders() for no benefit, since both are unconditional deletes with
   * no result to merge.
   */
  await db().from("phone_verifications").delete().eq("phone", phone).eq("purpose", input.purpose);
  await db()
    .from("phone_verifications")
    .delete()
    .lt("expires_at", new Date(now).toISOString());

  unwrap(
    await insertInto(db(), "phone_verifications", {
      id: verification.id,
      phone: verification.phone,
      purpose: verification.purpose,
      provider: verification.provider,
      code_hash: verification.codeHash ?? null,
      code_salt: verification.codeSalt ?? null,
      provider_ref: verification.providerRef ?? null,
      expires_at: verification.expiresAt,
      attempts: verification.attempts,
      created_at: verification.createdAt,
      pending_name: verification.pendingName ?? null,
      pending_password_hash: verification.pendingPasswordHash ?? null,
      pending_password_salt: verification.pendingPasswordSalt ?? null,
      pending_email: verification.pendingEmail ?? null,
    }).overrideTypes<unknown, { merge: false }>(),
  );

  // Counted after the record is written, so a failed write does not consume quota.
  await recordFailedLogin(quotaKey(phone));
  if (input.ip) await recordFailedLogin(ipQuotaKey(input.ip));

  /*
   * 2Factor already sent its message above, before the row existed — see the comment
   * where `providerRef` is obtained for why. Only the local path's send still happens
   * here, composing our own text and handing it to the SMS transport, which falls back
   * to logging the code when no provider is set at all.
   */
  if (!useHostedProvider) {
    const result: SmsResult = await sendSms(phone, smsBody((await getSettings()).name, code!));

    if (result.status === "failed") {
      /*
       * The code exists but nobody has it. Remove it so the cooldown does not strand the
       * shopper behind a sixty-second wait for a message that was never going to arrive.
       */
      await discardVerification(verification.id);
      return {
        ok: false,
        error: "We could not send a code to that number just now. Please try again.",
      };
    }

    return {
      ok: true,
      delivery: result.status,
      retryAfterSeconds: Math.ceil(RESEND_COOLDOWN_MS / 1000),
    };
  }

  return {
    ok: true,
    delivery: "sent",
    retryAfterSeconds: Math.ceil(RESEND_COOLDOWN_MS / 1000),
  };
}

/**
 * The message.
 *
 * Deliberately plain and deliberately without a link. An SMS containing a URL is
 * indistinguishable from the phishing text that will eventually impersonate it, and
 * teaching customers that this shop sends links by SMS is a favour to whoever does.
 */
function smsBody(storeName: string, code: string): string {
  return (
    `${code} is your ${storeName} verification code. ` +
    `It expires in ${Math.round(CODE_TTL_MS / 60000)} minutes. ` +
    "If you did not request it, ignore this message and do not share the code."
  );
}

/**
 * A uniformly random code, from the CSPRNG.
 *
 * `randomInt` rather than `Math.random`, which is seeded predictably enough that a code
 * generated from it can be guessed from a previous one.
 */
function generateCode(): string {
  const ceiling = 10 ** CODE_DIGITS;
  return String(randomInt(0, ceiling)).padStart(CODE_DIGITS, "0");
}

/* ------------------------------------------------------------------ */
/* Verifying                                                           */
/* ------------------------------------------------------------------ */

export type VerifyResult =
  | { ok: true; verification: PhoneVerification }
  | { ok: false; error: string };

/**
 * Check a code and consume it.
 *
 * On success the record is deleted before this returns, so a code cannot be replayed —
 * which matters most for password reset, where the same six digits would otherwise let
 * someone change the password again an hour later.
 *
 * On failure the message never distinguishes "no code outstanding" from "wrong code",
 * because the difference is whether that number is registered, and answering that for
 * any number anyone types is a membership oracle. The one exception is running out of
 * attempts, which the shopper needs to be told about because their next move is different.
 */
export async function verifyCode(
  rawPhone: string,
  purpose: OtpPurpose,
  rawCode: string,
): Promise<VerifyResult> {
  const phone = normalisePhone(rawPhone);
  const code = rawCode.replace(/\D/g, "");

  const invalid: VerifyResult = {
    ok: false,
    error: "That code is not correct, or it has expired. Request a new one.",
  };

  if (!phone || code.length !== CODE_DIGITS) {
    // Spend comparable time so a malformed code is not measurably faster than a wrong one.
    await verifyPassword(code, "0".repeat(128), "00");
    return invalid;
  }

  const now = Date.now();
  const verification = await liveVerification(phone, purpose, now);

  if (!verification) {
    await verifyPassword(code, "0".repeat(128), "00");
    return invalid;
  }

  if (verification.provider === "2factor") {
    /*
     * 2Factor owns the code, its expiry and its attempt cap. This row's `attempts`
     * stays 0 and is not consulted — an expired or exhausted session comes back as
     * `wrong-code`, the same as a plain mistype, because from the form's side both
     * mean "that code no longer works, ask for another". `providerRef` is mandatory
     * here: it is the session id from the AUTOGEN call this verification was issued
     * with, and a row of this provider always has one (see `issueCode`).
     */
    /*
     * Our own attempt cap, in front of the provider's. The comment above says 2Factor
     * tracks its own cap, and it may — but that is a setting on someone else's
     * account that nothing here can observe, and the whole safety argument at the top
     * of this file ("three factors of the same product") needs the five-guess limit to
     * be real. If the provider's were looser or absent, six digits would be one
     * secret in a million with unlimited guesses for ten minutes. Counting here makes
     * the limit true regardless of what the provider does.
     */
    if (verification.attempts >= MAX_ATTEMPTS) {
      await discardVerification(verification.id);
      return { ok: false, error: "Too many incorrect attempts. Request a new code." };
    }

    const check = verification.providerRef
      ? await checkTwoFactorOtp(verification.providerRef, code)
      : { ok: false as const, reason: "provider-error" as const };

    if (!check.ok) {
      // A provider fault is not the shopper's mistake, so it does not spend an attempt.
      if (check.reason !== "provider-error") {
        const remaining = await countAttempt(verification.id);
        if (remaining <= 0) {
          await discardVerification(verification.id);
          return { ok: false, error: "Too many incorrect attempts. Request a new code." };
        }
      }

      return {
        ok: false,
        error:
          check.reason === "provider-error"
            ? "We could not check that code just now. Please try again."
            : invalid.error,
      };
    }

    await discardVerification(verification.id);
    await clearFailedLogins(quotaKey(phone));
    return { ok: true, verification };
  }

  if (verification.provider === "twilio-verify") {
    /*
     * This store no longer sends codes through Twilio Verify — see `issueCode`, which
     * never writes this provider value any more. A row can only reach this branch if
     * it was issued in the few minutes before this switch and has not yet expired
     * (`CODE_TTL_MS` is ten minutes), so there is nothing left to check it against.
     * Treated as an ordinary "ask for another" rather than a fault: the shopper's
     * next code will be issued by whichever provider is configured now.
     */
    await discardVerification(verification.id);
    return invalid;
  }

  if (verification.attempts >= MAX_ATTEMPTS) {
    await discardVerification(verification.id);
    return {
      ok: false,
      error: "Too many incorrect attempts. Request a new code.",
    };
  }

  const correct = await verifyPassword(
    code,
    verification.codeHash ?? "0".repeat(128),
    verification.codeSalt ?? "00",
  );

  if (!correct) {
    const remaining = await countAttempt(verification.id);
    return {
      ok: false,
      error:
        remaining > 0
          ? `That code is not correct. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`
          : "Too many incorrect attempts. Request a new code.",
    };
  }

  /*
   * Consumed. Deleted before the caller acts on it, so two concurrent submissions of the
   * same code cannot both proceed to create an account or reset a password.
   */
  await discardVerification(verification.id);

  /*
   * Clear the issuing quota. Someone who has just proved they hold the number is not the
   * attacker the quota exists for, and leaving it counted would mean a customer who needed
   * three codes to get through signup is then rate limited on their next reset.
   */
  await clearFailedLogins(quotaKey(phone));

  return { ok: true, verification };
}

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

/** The unexpired code for this number and purpose, if there is one. */
async function liveVerification(
  phone: string,
  purpose: OtpPurpose,
  now: number,
): Promise<PhoneVerification | undefined> {
  const row = unwrap(
    await db()
      .from("phone_verifications")
      .select("*")
      .eq("phone", phone)
      .eq("purpose", purpose)
      .gt("expires_at", new Date(now).toISOString())
      .maybeSingle()
      .overrideTypes<PhoneVerificationRow, { merge: false }>(),
  );
  return row ? fromRow(row) : undefined;
}

/**
 * Record a wrong guess. Returns how many are left.
 *
 * `attempts = attempts + 1` is issued as a single atomic UPDATE rather than
 * read-then-write, so two simultaneous guesses cannot both read `attempts`
 * as four and both write five — the increment happens inside Postgres's own
 * row lock, which is what `mutateStore`'s serialised queue used to
 * guarantee for the JSON document as a whole.
 */
async function countAttempt(id: string): Promise<number> {
  const { data, error } = await callRpc(db(), "increment_verification_attempts", { p_id: id });
  if (error) throw new Error(error.message);
  const attempts = data ?? MAX_ATTEMPTS;
  return Math.max(0, MAX_ATTEMPTS - attempts);
}

async function discardVerification(id: string): Promise<void> {
  const { error } = await db().from("phone_verifications").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
