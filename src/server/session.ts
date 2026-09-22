import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AdminUser, Permission } from "@/lib/types";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  findAdminById,
  readSessionToken,
  roleHas,
  type SessionPayload,
} from "./auth";

/**
 * Session lifecycle and the authorisation guard.
 *
 * `requirePermission` is the single gate every mutation calls. Middleware keeps
 * unauthenticated visitors out of `/admin`, but middleware alone is not a security
 * boundary — a Server Action can be invoked directly, so authorisation is checked
 * again here, on the server, for every write.
 */

export async function startSession(admin: AdminUser): Promise<void> {
  const payload: SessionPayload = {
    userId: admin.id,
    email: admin.email,
    role: admin.role,
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };

  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(payload), {
    // Unreadable from JavaScript, so an XSS bug cannot exfiltrate the session.
    httpOnly: true,
    /**
     * `strict` rather than `lax`: the cookie is never sent on a request that
     * originated from another site, which shuts down cross-site request forgery
     * against the admin panel outright.
     *
     * The tradeoff is small and worth it — following a link to `/admin/orders/x`
     * from an email lands on the login screen first, then redirects through. Do not
     * relax this to `lax` to remove that one extra click.
     */
    sameSite: "strict",
    // Secure in production only, so the cookie still works over plain HTTP in dev.
    secure: process.env.NODE_ENV === "production",
    /**
     * Site-wide rather than scoped to `/admin`, deliberately. The proxy reads this
     * cookie on storefront routes too, so signed-in staff can browse the shop while
     * maintenance mode is on — which is the entire point of that feature.
     */
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** The signed-in admin, or null. Re-reads the user so a disabled account fails closed. */
export async function currentAdmin(): Promise<AdminUser | null> {
  const store = await cookies();
  const payload = readSessionToken(store.get(SESSION_COOKIE)?.value);
  if (!payload) return null;

  const admin = await findAdminById(payload.userId);
  if (!admin || admin.disabled) return null;

  return admin;
}

/** For pages: redirect to the login screen when not signed in. */
export async function requireAdmin(): Promise<AdminUser> {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

/**
 * Raised when an authenticated user lacks the permission for an action. Actions
 * catch it and return a form error rather than crashing the page.
 */
export class PermissionError extends Error {
  constructor(permission: Permission) {
    super(`Your role does not allow this action (${permission}).`);
    this.name = "PermissionError";
  }
}

/** For mutations: assert both authentication and authorisation. */
export async function requirePermission(permission: Permission): Promise<AdminUser> {
  const admin = await currentAdmin();
  if (!admin) throw new PermissionError(permission);
  if (!roleHas(admin.role, permission)) throw new PermissionError(permission);
  return admin;
}

/** Convenience for conditionally rendering controls a role cannot use. */
export function can(admin: AdminUser | null, permission: Permission): boolean {
  return admin ? roleHas(admin.role, permission) : false;
}
