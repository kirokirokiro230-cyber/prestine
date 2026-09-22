import { randomInt, randomUUID } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { normalisePhone } from "@/lib/phone";
import type { OtpPurpose, PhoneVerification } from "@/lib/types";
import { hashPassword, verifyPassword } from "./auth";
import { getDb, isDatabaseConfigured } from "./db/client";
import { fromPhoneVerification, toPhoneVerification } from "./db/mappers";
import { phoneVerifications } from "./db/schema";
import {
  clearFailedLogins,
  loginLockout,
  recordFailedLogin,
} from "./login-attempts";
import { getSettings } from "./repositories/settings";
import { sendSms, type SmsResult } from "./sms";
import { mutateStore, readStore } from "./store";
import { checkVerification, startVerification, verifyConfigured } from "./verify";

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
 * Reuses the sliding-window limiter that guards sign-in: same policy, same dual backend,
 * same fail-open behaviour, and the same shared table when a database is configured. The
 * functions are named for failed logins because that was their first caller, but what
 * they implement is "how many times has this key done a thing in the last fifteen
 * minutes" — and `login_attempts` already stores `ip:` keys alongside identifiers, so an
 * `otp:` key is not a new kind of contents.
 *
 * Counting this in the verification table instead would mean keeping spent codes around
 * purely to be counted, which is a worse answer than borrowing a limiter that is already
 * pruned, already shared across instances and already tested.
 */
function quotaKey(phone: string): string {
  return `otp:${phone}`;
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

  /* ---- Issue ----------------------------------------------------- */

  /*
   * Two transports, chosen once per deployment by which credential is set. When a Verify
   * Service is configured Twilio generates, sends, expires and attempt-caps the code, so
   * this row carries no hash and only exists to hold the pending signup between "sent"
   * and "confirmed"; `verifyCode` reads `provider` to know not to compare a local hash.
   * Otherwise this application generates the code and hashes it, the original path.
   */
  const useVerify = verifyConfigured();
  const issuedAt = new Date(now);

  /*
   * The local path needs the plaintext once — to text it — and stores only its hash.
   * The Verify path never sees a code at all, so it generates neither.
   */
  const code = useVerify ? null : generateCode();
  const local = code ? await hashPassword(code) : null;

  const verification: PhoneVerification = {
    id: `otp_${randomUUID().slice(0, 8)}`,
    phone,
    purpose: input.purpose,
    provider: useVerify ? "twilio-verify" : "local",
    codeHash: local?.hash,
    codeSalt: local?.salt,
    expiresAt: new Date(now + CODE_TTL_MS).toISOString(),
    attempts: 0,
    createdAt: issuedAt.toISOString(),
    pendingName: input.pending?.name,
    pendingEmail: input.pending?.email,
    pendingPasswordHash: input.pending?.passwordHash,
    pendingPasswordSalt: input.pending?.passwordSalt,
  };

  if (!isDatabaseConfigured()) {
    await mutateStore((store) => {
      /*
       * Replace this number's live code for this purpose, and sweep anything that has
       * expired anywhere. Pruning on write rather than on a schedule, for the reason
       * `recordFailedLogin` does the same: a cleanup job someone has to remember exists is
       * a cleanup job that eventually is not running.
       */
      store.phoneVerifications = store.phoneVerifications.filter(
        (entry) =>
          !(entry.phone === phone && entry.purpose === input.purpose) &&
          new Date(entry.expiresAt).getTime() > now,
      );
      store.phoneVerifications.push(verification);
    });
  } else {
    const db = getDb();
    // Replace this number's live code for this purpose, and sweep anything expired.
    await db
      .delete(phoneVerifications)
      .where(
        and(eq(phoneVerifications.phone, phone), eq(phoneVerifications.purpose, input.purpose)),
      );
    await db.delete(phoneVerifications).where(lt(phoneVerifications.expiresAt, new Date(now)));
    await db.insert(phoneVerifications).values(fromPhoneVerification(verification));
  }

  // Counted after the record is written, so a failed write does not consume quota.
  await recordFailedLogin(quotaKey(phone));

  /*
   * Whichever transport is configured sends the code. Verify composes and sends its own
   * message; the local path composes ours and hands it to the SMS transport, which in
   * turn falls back to logging the code when no provider is set at all.
   */
  const result: SmsResult = useVerify
    ? await startVerification(phone)
    : await sendSms(phone, smsBody((await getSettings()).name, code!));

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

  if (verification.provider === "twilio-verify") {
    /*
     * Twilio owns the code, its expiry and its attempt cap. This row's `attempts` stays
     * 0 and is not consulted — a `max_attempts_reached` or `expired` verdict comes back
     * from Twilio as `wrong-code`, the same as a plain mistype, because from the form's
     * side all three mean "that code no longer works, ask for another".
     */
    const check = await checkVerification(phone, code);
    if (!check.ok) {
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
  if (!isDatabaseConfigured()) {
    const store = await readStore();
    return store.phoneVerifications.find(
      (entry) =>
        entry.phone === phone &&
        entry.purpose === purpose &&
        new Date(entry.expiresAt).getTime() > now,
    );
  }

  const [row] = await getDb()
    .select()
    .from(phoneVerifications)
    .where(
      and(
        eq(phoneVerifications.phone, phone),
        eq(phoneVerifications.purpose, purpose),
        gt(phoneVerifications.expiresAt, new Date(now)),
      ),
    );
  return row ? toPhoneVerification(row) : undefined;
}

/**
 * Record a wrong guess. Returns how many are left.
 *
 * Read and write in one mutation, because the cap is only a cap if two simultaneous
 * guesses cannot both read `attempts` as four. `mutateStore` serialises mutations on the
 * JSON-store path; against Postgres, `attempts = attempts + 1 returning` performs the
 * same increment atomically in the database rather than in application code.
 */
async function countAttempt(id: string): Promise<number> {
  if (!isDatabaseConfigured()) {
    return mutateStore((store) => {
      const entry = store.phoneVerifications.find((candidate) => candidate.id === id);
      if (!entry) return 0;

      entry.attempts += 1;
      return Math.max(0, MAX_ATTEMPTS - entry.attempts);
    });
  }

  const db = getDb();
  const [row] = await db
    .update(phoneVerifications)
    .set({ attempts: sql`${phoneVerifications.attempts} + 1` })
    .where(eq(phoneVerifications.id, id))
    .returning({ attempts: phoneVerifications.attempts });
  if (!row) return 0;
  return Math.max(0, MAX_ATTEMPTS - row.attempts);
}

async function discardVerification(id: string): Promise<void> {
  if (!isDatabaseConfigured()) {
    await mutateStore((store) => {
      store.phoneVerifications = store.phoneVerifications.filter(
        (entry) => entry.id !== id,
      );
    });
    return;
  }

  await getDb().delete(phoneVerifications).where(eq(phoneVerifications.id, id));
}
