import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type { AdminRole, AdminUser, Permission } from "@/lib/types";
import { mutateStore, readStore } from "./store";
import { readPayload, secretFromEnv, signPayload } from "./tokens";

/**
 * Admin authentication.
 *
 * Dependency-free by design — `node:crypto` provides everything needed and adding
 * an auth library here would be more surface area than the feature warrants.
 *
 * What this does:
 * - Passwords are hashed with scrypt (memory-hard) using a per-user random salt.
 *   The plaintext is never stored, logged or returned.
 * - Comparisons are constant-time, so response timing does not leak the hash.
 * - Sessions are stateless HMAC-signed tokens in an httpOnly, SameSite=Lax cookie.
 *   Tampering invalidates the signature; expiry is inside the signed payload.
 * - Repeated failures lock an account for a cooling-off period. See
 *   `src/server/login-attempts.ts`.
 *
 * What it deliberately does not do: password reset by email, TOTP, or SSO. Those
 * need an email provider and a second factor policy — see the README.
 */

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options?: { N?: number; r?: number; p?: number; maxmem?: number },
) => Promise<Buffer>;

/** scrypt cost. N=16384 keeps sign-in comfortably under ~100ms on a small host. */
const SCRYPT = { N: 16384, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;

export const SESSION_COOKIE = "prestine_admin_session";
/** Sessions last a working day; a merchant should not be logged out mid-task. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

/* ------------------------------------------------------------------ */
/* Secret                                                             */
/* ------------------------------------------------------------------ */

/**
 * Signing secret.
 *
 * In production this must come from the environment. In development a stable
 * per-machine fallback is derived so restarting the dev server does not log you
 * out — but it is never used when NODE_ENV is production.
 */
function sessionSecret(): string {
  return secretFromEnv("ADMIN_SESSION_SECRET", "session");
}

/* ------------------------------------------------------------------ */
/* Passwords                                                          */
/* ------------------------------------------------------------------ */

export async function hashPassword(
  password: string,
): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, KEY_LENGTH, SCRYPT);
  return { hash: derived.toString("hex"), salt };
}

export async function verifyPassword(
  password: string,
  hash: string,
  salt: string,
): Promise<boolean> {
  try {
    const derived = await scrypt(password, salt, KEY_LENGTH, SCRYPT);
    const expected = Buffer.from(hash, "hex");
    if (expected.length !== derived.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** Minimum policy, enforced server-side on create and change. */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 12) return "Use at least 12 characters.";
  if (!/[a-z]/.test(password)) return "Include a lowercase letter.";
  if (!/[A-Z]/.test(password)) return "Include an uppercase letter.";
  if (!/\d/.test(password)) return "Include a number.";
  return null;
}

/* ------------------------------------------------------------------ */
/* Session tokens                                                     */
/* ------------------------------------------------------------------ */

export interface SessionPayload {
  userId: string;
  email: string;
  role: AdminRole;
  /** Unix seconds. */
  expiresAt: number;
}

/**
 * Construction and verification live in `./tokens`, shared with customer sessions.
 *
 * These two wrappers stay because they are what the rest of the admin code imports, and
 * because binding the admin secret here is what stops a customer token ever verifying as
 * a staff session — the payloads are structurally similar enough that a shared secret
 * would make that substitution possible.
 */
export function createSessionToken(payload: SessionPayload): string {
  return signPayload(payload, sessionSecret());
}

export function readSessionToken(token: string | undefined): SessionPayload | null {
  return readPayload<SessionPayload>(token, sessionSecret());
}

/* ------------------------------------------------------------------ */
/* Permissions                                                        */
/* ------------------------------------------------------------------ */

/**
 * Role capabilities.
 *
 * Staff can fulfil orders but cannot change prices, discounts, settings or other
 * users — the split that matters in a small team.
 */
const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  owner: [
    "products:write",
    "orders:write",
    "discounts:write",
    "settings:write",
    "staff:write",
  ],
  manager: ["products:write", "orders:write", "discounts:write"],
  staff: ["orders:write"],
};

export function roleHas(role: AdminRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const ROLE_LABELS: Record<AdminRole, string> = {
  owner: "Owner",
  manager: "Manager",
  staff: "Staff",
};

export const ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  owner: "Full access, including settings and staff management.",
  manager: "Products, orders and discounts. No settings or staff.",
  staff: "Orders and fulfilment only. Cannot change products or prices.",
};

/* ------------------------------------------------------------------ */
/* Users                                                              */
/* ------------------------------------------------------------------ */

export async function listAdmins(): Promise<AdminUser[]> {
  return (await readStore()).admins;
}

export async function findAdminByEmail(email: string): Promise<AdminUser | undefined> {
  const normalised = email.trim().toLowerCase();
  return (await readStore()).admins.find((admin) => admin.email === normalised);
}

export async function findAdminById(id: string): Promise<AdminUser | undefined> {
  return (await readStore()).admins.find((admin) => admin.id === id);
}

/** True when no admin exists yet, which unlocks the one-time setup screen. */
export async function needsFirstAdmin(): Promise<boolean> {
  return (await readStore()).admins.length === 0;
}

export async function createAdmin(input: {
  email: string;
  name: string;
  password: string;
  role: AdminRole;
}): Promise<AdminUser> {
  const strength = validatePasswordStrength(input.password);
  if (strength) throw new Error(strength);

  const { hash, salt } = await hashPassword(input.password);
  const email = input.email.trim().toLowerCase();

  return mutateStore((store) => {
    if (store.admins.some((admin) => admin.email === email)) {
      throw new Error("An admin with that email already exists.");
    }

    const admin: AdminUser = {
      id: `adm_${randomUUID().slice(0, 8)}`,
      email,
      name: input.name.trim(),
      role: input.role,
      passwordHash: hash,
      passwordSalt: salt,
      createdAt: new Date().toISOString(),
    };

    store.admins.push(admin);
    return admin;
  });
}

export async function updateAdmin(
  id: string,
  patch: { name?: string; role?: AdminRole; disabled?: boolean; password?: string },
): Promise<AdminUser> {
  let credentials: { hash: string; salt: string } | null = null;

  if (patch.password) {
    const strength = validatePasswordStrength(patch.password);
    if (strength) throw new Error(strength);
    credentials = await hashPassword(patch.password);
  }

  return mutateStore((store) => {
    const admin = store.admins.find((entry) => entry.id === id);
    if (!admin) throw new Error("Admin not found");

    if (patch.name !== undefined) admin.name = patch.name.trim();
    if (patch.disabled !== undefined) admin.disabled = patch.disabled;

    if (patch.role !== undefined && patch.role !== admin.role) {
      // Never allow the last owner to be demoted, or nobody can reach settings.
      const owners = store.admins.filter(
        (entry) => entry.role === "owner" && !entry.disabled,
      );
      if (admin.role === "owner" && owners.length <= 1) {
        throw new Error("There must always be at least one active owner.");
      }
      admin.role = patch.role;
    }

    if (credentials) {
      admin.passwordHash = credentials.hash;
      admin.passwordSalt = credentials.salt;
    }

    return admin;
  });
}

export async function deleteAdmin(id: string): Promise<void> {
  await mutateStore((store) => {
    const admin = store.admins.find((entry) => entry.id === id);
    if (!admin) return;

    const owners = store.admins.filter(
      (entry) => entry.role === "owner" && !entry.disabled,
    );
    if (admin.role === "owner" && owners.length <= 1) {
      throw new Error("You cannot remove the last owner.");
    }

    store.admins = store.admins.filter((entry) => entry.id !== id);
  });
}

export async function recordLogin(id: string): Promise<void> {
  await mutateStore((store) => {
    const admin = store.admins.find((entry) => entry.id === id);
    if (admin) admin.lastLoginAt = new Date().toISOString();
  });
}

/*
 * Brute-force throttling lives in `src/server/login-attempts.ts`.
 *
 * It was here, as a Map. That is correct on one long-running process and silently
 * ineffective on a serverless host, where five guesses can land on five instances that
 * each see an empty Map. It now records to a shared table, which is a different enough
 * concern — and a different enough set of failure modes — to warrant its own module.
 */
