"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { recordAudit } from "@/server/audit";
import { clientIp } from "@/server/client-ip";
import { lockoutMessage } from "@/lib/login-throttle";
import { safeInternalPath } from "@/lib/safe-redirect";
import {
  createAdmin,
  findAdminByEmail,
  needsFirstAdmin,
  recordLogin,
  verifyPassword,
} from "@/server/auth";
import {
  clearFailedLogins,
  loginLockout,
  recordFailedLogin,
} from "@/server/login-attempts";
import { endSession, startSession } from "@/server/session";

/**
 * Authentication actions.
 *
 * Notes on the deliberate choices here:
 * - Failure messages never distinguish "no such account" from "wrong password".
 *   Doing so hands an attacker a list of valid admin emails.
 * - Throttling is keyed on the submitted email *and* the client IP, so one attacker
 *   cannot lock out a real user by guessing their address repeatedly, and cannot
 *   evade the limit by rotating emails from one address either.
 * - Failed attempts are audited. A burst of them is the signal you want.
 */

export interface AuthFormState {
  error?: string;
  /** Field-level errors for the setup form. */
  fieldErrors?: Record<string, string>;
}

// Address resolution lives in `src/server/client-ip.ts` so every limiter keys
// on the same thing, including Netlify's unforgeable connection header.
const clientKey = clientIp;

export async function signIn(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/admin");

  if (!email || !password) {
    return { error: "Enter your email address and password." };
  }

  const ip = await clientKey();
  const keys = [`email:${email}`, `ip:${ip}`];

  // Both keys in parallel: two independent reads, and sign-in is the one request where
  // latency is already dominated by the deliberate cost of scrypt.
  // Explicit arrow, never `keys.map(loginLockout)`: map would pass the array index
  // as the second argument. See the note on `loginLockout`.
  const lockouts = await Promise.all(keys.map((key) => loginLockout(key)));
  const locked = lockouts.find((lockout) => lockout.locked);
  if (locked) return { error: lockoutMessage(locked) };

  const admin = await findAdminByEmail(email);

  // Always run a verification so a missing account and a wrong password take
  // comparable time.
  const valid = admin
    ? await verifyPassword(password, admin.passwordHash, admin.passwordSalt)
    : await verifyPassword(password, "0".repeat(128), "00");

  if (!admin || !valid || admin.disabled) {
    await Promise.all(keys.map(recordFailedLogin));
    await recordAudit({
      actorId: null,
      actorEmail: email || "unknown",
      action: "login:failed",
      entity: "session",
      entityId: email || "unknown",
      summary: `Failed sign-in attempt from ${ip}`,
    });
    return { error: "Those credentials are not correct." };
  }

  await Promise.all(keys.map(clearFailedLogins));

  await startSession(admin);
  await recordLogin(admin.id);
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "login",
    entity: "session",
    entityId: admin.id,
    summary: `Signed in from ${ip}`,
  });

  // Only allow internal redirects, and only into the admin panel — an open redirect
  // here would be a phishing gift. `safeInternalPath` rejects `/\evil.example` and its
  // relatives, which a bare `startsWith("/admin")` happened to refuse only by accident.
  const target = safeInternalPath(next, "/admin");
  redirect(target === "/admin" || target.startsWith("/admin/") ? target : "/admin");
}

export async function signOut(): Promise<void> {
  const list = await headers();
  void list;

  await endSession();
  redirect("/admin/login");
}

/**
 * One-time setup: create the first owner.
 *
 * Guarded by `needsFirstAdmin`, so once an account exists this action refuses to run
 * — otherwise it would be an unauthenticated "make me an owner" endpoint.
 */
export async function createFirstAdmin(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!(await needsFirstAdmin())) {
    return { error: "Setup has already been completed. Sign in instead." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "Enter your name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    fieldErrors.email = "Enter a valid email address.";
  }
  if (password !== confirm) fieldErrors.confirm = "The passwords do not match.";

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  try {
    const admin = await createAdmin({ name, email, password, role: "owner" });
    await startSession(admin);
    await recordAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "create",
      entity: "admin",
      entityId: admin.id,
      summary: `Created the first owner account (${admin.email})`,
    });
  } catch (error) {
    return { fieldErrors: { password: (error as Error).message } };
  }

  redirect("/admin");
}
