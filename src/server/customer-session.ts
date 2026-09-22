import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { CustomerAccount } from "@/lib/types";
import { findCustomerById } from "./customers";
import { readPayload, secretFromEnv, signPayload } from "./tokens";

/**
 * Customer session lifecycle.
 *
 * The shopper-facing counterpart to `session.ts`. Same construction — a stateless
 * HMAC-signed token in an httpOnly cookie, re-reading the account on every request so a
 * disabled account fails closed immediately — but its own cookie name and its own
 * secret, so a customer token can never be replayed as a staff session or vice versa.
 */

export const CUSTOMER_SESSION_COOKIE = "prestine_customer_session";
/** A shopper should not be asked to sign in again mid-browse. Two weeks. */
export const CUSTOMER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

function customerSessionSecret(): string {
  return secretFromEnv("CUSTOMER_SESSION_SECRET", "customer-session");
}

export interface CustomerSessionPayload {
  customerId: string;
  phone: string;
  /** Unix seconds. */
  expiresAt: number;
}

export async function startCustomerSession(customer: CustomerAccount): Promise<void> {
  const payload: CustomerSessionPayload = {
    customerId: customer.id,
    phone: customer.phone,
    expiresAt: Math.floor(Date.now() / 1000) + CUSTOMER_SESSION_MAX_AGE_SECONDS,
  };

  const store = await cookies();
  store.set(
    CUSTOMER_SESSION_COOKIE,
    signPayload(payload, customerSessionSecret()),
    {
      // Unreadable from JavaScript, so an XSS bug cannot exfiltrate the session.
      httpOnly: true,
      /**
       * `lax` rather than `strict`, unlike the admin cookie. A shopper following a link
       * from an email or a search result should land signed in, not on a sign-in wall —
       * there is no admin-style privileged action reachable on a plain navigation, so
       * the CSRF exposure `strict` closes on the admin side does not apply here.
       */
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: CUSTOMER_SESSION_MAX_AGE_SECONDS,
    },
  );
}

export async function endCustomerSession(): Promise<void> {
  const store = await cookies();
  store.delete(CUSTOMER_SESSION_COOKIE);
}

/** The signed-in shopper, or null. Re-reads the account so a disabled one fails closed. */
export async function currentCustomer(): Promise<CustomerAccount | null> {
  const store = await cookies();
  const payload = readPayload<CustomerSessionPayload>(
    store.get(CUSTOMER_SESSION_COOKIE)?.value,
    customerSessionSecret(),
  );
  if (!payload) return null;

  const customer = await findCustomerById(payload.customerId);
  if (!customer || customer.disabled) return null;

  return customer;
}

/** For pages: redirect to sign-in when no shopper is signed in. */
export async function requireCustomer(next?: string): Promise<CustomerAccount> {
  const customer = await currentCustomer();
  if (!customer) {
    const target = next ? `/signin?next=${encodeURIComponent(next)}` : "/signin";
    redirect(target);
  }
  return customer;
}
