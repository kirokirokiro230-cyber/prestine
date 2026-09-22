"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { phoneError } from "@/lib/phone";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/server/auth";
import {
  createCustomer,
  findCustomerByPhone,
  recordCustomerLogin,
  setCustomerAuthUserId,
  setCustomerPassword,
} from "@/server/customers";
import { ensureAuthUser } from "@/server/supabase-auth";
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

async function clientKey(): Promise<string> {
  const list = await headers();
  return list.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

function internalNext(next: string, fallback = "/account"): string {
  // Only allow internal redirects — an open redirect here would be a phishing gift.
  return next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

/**
 * Bridge a just-verified customer into Supabase Auth.
 *
 * Runs only after the OTP has been confirmed, which is the whole point of the bridge:
 * this app's code decides the number is genuine, and a success then ensures a matching
 * `auth.users` identity exists and records its id on the row. That id is what row-level
 * security reads through `auth.uid()`.
 *
 * Deliberately swallows every failure. A customer who has proven they hold their number
 * must get their session whether or not Supabase Auth is reachable — `authUserId` is
 * nullable exactly so it can be filled in on a later verification. When the bridge is not
 * configured at all (local development on the JSON store), `ensureAuthUser` returns null
 * and this is a no-op.
 */
async function bridgeToSupabaseAuth(customerId: string, phone: string): Promise<void> {
  try {
    const authUserId = await ensureAuthUser(phone);
    if (authUserId) await setCustomerAuthUserId(customerId, authUserId);
  } catch (error) {
    // Logged, never rethrown — see the note above on why this cannot block sign-in.
    console.error("[customer-auth] Supabase Auth bridge failed:", error);
  }
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

  // A brand-new number: create its Supabase Auth identity and link it.
  await bridgeToSupabaseAuth(customer.id, customer.phone);

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
  const keys = [`customer-phone:${phone}`, `customer-ip:${ip}`];

  const lockouts = await Promise.all(keys.map(loginLockout));
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

  const result = await issueCode({ phone, purpose: "password-reset" });
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

  // A returning number: find (or, for an account that predates the bridge, create) its
  // Supabase Auth identity and link it if it is not linked yet.
  if (!customer.authUserId) {
    await bridgeToSupabaseAuth(customer.id, customer.phone);
  }

  await startCustomerSession(customer);

  redirect("/account");
}
