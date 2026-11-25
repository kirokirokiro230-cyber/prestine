"use server";

import { redirect } from "next/navigation";
import { normalisePhone, phoneError } from "@/lib/phone";
import { safeInternalPath } from "@/lib/safe-redirect";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/server/auth";
import {
  createCustomer,
  findCustomerByPhone,
  recordCustomerLogin,
  setCustomerPassword,
} from "@/server/customers";
import {
  endCustomerSession,
  startCustomerSession,
} from "@/server/customer-session";
import {
  clearFailedLogins,
  loginLockout,
  recordFailedLogin,
} from "@/server/login-attempts";
import { lockoutMessage } from "@/lib/login-throttle";
import { clientIp } from "@/server/client-ip";
import { issueCode, verifyCode } from "@/server/otp";

/**
 * Customer authentication actions.
 *
 * The shopper-facing counterpart to `src/app/admin/actions/auth.ts`, and the same
 * two rules apply for the same reasons:
 *
 * - Sign-in never says whether the number is registered. Only "those details are not
 *   correct" — anything more specific hands out a way to enumerate real phone numbers.
 * - Every attempt is throttled by phone *and* by IP, so one attacker cannot lock out a
 *   real shopper by guessing their number repeatedly, and cannot dodge the limit by
 *   rotating numbers from one address either.
 *
 * Signup and reset are both two actions, not one, because a code has to travel over SMS
 * between them: `requestSignupCode`/`requestPasswordResetCode` issue and text the code,
 * `completeSignup`/`completePasswordReset` take the code back along with what it is
 * for and either create the account or set a new password.
 */

export interface AuthFormState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
  /** Echoed back so the OTP step can be rendered without losing what was typed. */
  phone?: string;
}

const clientKey = clientIp;

// Only internal redirects — see `safeInternalPath` for why a prefix check is not enough.
function internalNext(next: string, fallback = "/account"): string {
  return safeInternalPath(next, fallback);
}

/* ------------------------------------------------------------------ */
/* Signup                                                              */
/* ------------------------------------------------------------------ */

/**
 * Step one of signup: validate, hash the password, and text a code.
 *
 * The password is hashed here and never again — `completeSignup` receives it back
 * only as the hash carried on the pending verification record, so the plaintext exists
 * in memory for exactly as long as this one request.
 */
export async function requestSignupCode(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "Enter your name.";
  const phoneProblem = phoneError(phone);
  if (phoneProblem) fieldErrors.phone = phoneProblem;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    fieldErrors.email = "Enter a valid email address, or leave it blank.";
  }
  const strength = validatePasswordStrength(password);
  if (strength) fieldErrors.password = strength;

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors, phone };

  // Signup refuses a number that is already registered — reset stays silent about
  // this instead, because the two flows have opposite information to protect.
  if (await findCustomerByPhone(phone)) {
    return {
      fieldErrors: { phone: "An account with that number already exists. Sign in instead." },
      phone,
    };
  }

  const { hash, salt } = await hashPassword(password);

  const result = await issueCode({
    phone,
    purpose: "signup",
    pending: { name, email: email || undefined, passwordHash: hash, passwordSalt: salt },
    // Signup will issue to a number with no account, which makes it the cheapest
    // path to burning SMS credit by rotating numbers. Capped per caller too.
    ip: await clientKey(),
  });

  if (!result.ok) return { error: result.error, phone };

  return {
    success:
      result.delivery === "logged"
        ? "SMS is not configured on this environment — the code was printed to the server console."
        : "We texted you a 6-digit code.",
    phone,
  };
}

/**
 * Step two of signup: check the code and create the account.
 *
 * The name, email and password hash all come back from the verification record that
 * `requestSignupCode` created, not from this form — so a tampered request cannot swap
 * in a different name or a different password than the one that was actually verified.
 */
export async function completeSignup(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const phone = String(formData.get("phone") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  const next = String(formData.get("next") ?? "/account");

  if (!code) return { fieldErrors: { code: "Enter the 6-digit code." }, phone };

  const verified = await verifyCode(phone, "signup", code);
  if (!verified.ok) return { error: verified.error, phone };

  const { verification } = verified;
  if (!verification.pendingPasswordHash || !verification.pendingPasswordSalt) {
    // The code was valid but was not one issued by a signup — a reset code, reused.
    return { error: "That code is not valid for creating an account.", phone };
  }

  const customer = await createCustomer({
    phone: verification.phone,
    name: verification.pendingName ?? "",
    email: verification.pendingEmail,
    passwordHash: verification.pendingPasswordHash,
    passwordSalt: verification.pendingPasswordSalt,
    phoneVerifiedAt: new Date().toISOString(),
  });

  await startCustomerSession(customer);
  redirect(internalNext(next));
}

/* ------------------------------------------------------------------ */
/* Sign in                                                             */
/* ------------------------------------------------------------------ */

export async function signIn(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/account");

  if (!phone || !password) {
    return { error: "Enter your mobile number and password.", phone };
  }

  const ip = await clientKey();

  /*
   * Keyed on the normalised number, not the string as typed. `98765 43210`,
   * `+919876543210` and `09876543210` are one account, and keying on the raw input
   * gave an attacker a fresh five-guess allowance for every spelling of it.
   */
  const keys = [`customer-phone:${normalisePhone(phone) ?? phone}`, `customer-ip:${ip}`];

  // Explicit arrow, never `keys.map(loginLockout)`: map would pass the array index
  // as the second argument. See the note on `loginLockout`.
  const lockouts = await Promise.all(keys.map((key) => loginLockout(key)));
  const locked = lockouts.find((lockout) => lockout.locked);
  if (locked) return { error: lockoutMessage(locked), phone };

  const customer = await findCustomerByPhone(phone);

  // Always run a verification so a missing account and a wrong password take
  // comparable time.
  const valid = customer
    ? await verifyPassword(password, customer.passwordHash, customer.passwordSalt)
    : await verifyPassword(password, "0".repeat(128), "00");

  if (!customer || !valid || customer.disabled) {
    await Promise.all(keys.map(recordFailedLogin));
    return { error: "Those details are not correct.", phone };
  }

  await Promise.all(keys.map(clearFailedLogins));

  await startCustomerSession(customer);
  await recordCustomerLogin(customer.id);

  redirect(internalNext(next));
}

export async function signOut(): Promise<void> {
  await endCustomerSession();
  redirect("/");
}

/* ------------------------------------------------------------------ */
/* Password reset                                                      */
/* ------------------------------------------------------------------ */

/**
 * Step one of reset: text a code, but say the same thing whether or not the number is
 * registered.
 *
 * This is the one place `issueCode`'s cooldown and rate-limit errors have to be
 * softened rather than shown verbatim for an unregistered number — otherwise "a code
 * was just sent" told to a number with no account is itself the membership leak this
 * flow exists to avoid. A registered number still sees the real cooldown message,
 * since at that point they already know they have an account.
 */
export async function requestPasswordResetCode(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const phone = String(formData.get("phone") ?? "").trim();

  const phoneProblem = phoneError(phone);
  if (phoneProblem) return { fieldErrors: { phone: phoneProblem }, phone };

  const customer = await findCustomerByPhone(phone);
  const silent: AuthFormState = {
    success: "If that number has an account, we have texted a 6-digit code to it.",
    phone,
  };

  if (!customer) return silent;

  const result = await issueCode({
    phone,
    purpose: "password-reset",
    ip: await clientKey(),
  });
  if (!result.ok) return silent;

  return {
    success:
      result.delivery === "logged"
        ? "SMS is not configured on this environment — the code was printed to the server console."
        : "We texted you a 6-digit code.",
    phone,
  };
}

export async function completePasswordReset(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const phone = String(formData.get("phone") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!code) return { fieldErrors: { code: "Enter the 6-digit code." }, phone };

  const strength = validatePasswordStrength(password);
  if (strength) return { fieldErrors: { password: strength }, phone };

  const verified = await verifyCode(phone, "password-reset", code);
  if (!verified.ok) return { error: verified.error, phone };

  const customer = await findCustomerByPhone(verified.verification.phone);
  if (!customer) {
    // The code verified against a number with no account — nothing to reset.
    return { error: "That code is not valid for resetting a password.", phone };
  }

  await setCustomerPassword(customer.id, password);
  await startCustomerSession(customer);

  redirect("/account");
}
