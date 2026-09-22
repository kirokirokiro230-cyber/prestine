import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless signed tokens.
 *
 * Extracted from `auth.ts` when customer sessions arrived and needed exactly the same
 * construction with a different secret and a different payload. Two copies of a signature
 * check is the kind of duplication that stays in step for about a month: the first time
 * one of them gains a length guard before `timingSafeEqual` and the other does not, one of
 * the two starts throwing on malformed input instead of rejecting it.
 *
 * The shape is `base64url(json).base64url(hmacSha256(body))`. There is no server-side
 * record of an issued token, which is the tradeoff worth understanding: verification costs
 * one HMAC and no query, and in exchange a token cannot be revoked before it expires.
 * Both callers close that gap the same way — they re-read the account on every request and
 * fail closed if it is missing or disabled — so a disabled account stops working
 * immediately even though its token is still cryptographically valid.
 *
 * Deliberately not JWT. A JWT library brings an algorithm field the verifier has to be
 * careful not to trust, and this needs one algorithm with one secret. HS256 without the
 * envelope is the whole requirement.
 */

/** Every payload carries its own expiry, inside the signature where it cannot be edited. */
export interface ExpiringPayload {
  /** Unix seconds. */
  expiresAt: number;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64url(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(body: string, secret: string): string {
  return base64url(createHmac("sha256", secret).update(body).digest());
}

export function signPayload<T extends ExpiringPayload>(
  payload: T,
  secret: string,
): string {
  const body = base64url(JSON.stringify(payload));
  return `${body}.${sign(body, secret)}`;
}

/**
 * Verify and decode a token.
 *
 * Returns null for anything that is not a valid, unexpired, correctly signed payload.
 * Callers treat null as "not signed in" and never inspect why — a verifier that explains
 * its refusal is a verifier that tells an attacker which half of the token to work on.
 *
 * The length comparison before `timingSafeEqual` is not optional: that function throws on
 * mismatched lengths, so without it a truncated token would raise an exception rather than
 * being rejected.
 */
export function readPayload<T extends ExpiringPayload>(
  token: string | undefined,
  secret: string,
): T | null {
  if (!token) return null;

  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = sign(body, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(fromBase64url(body).toString("utf8")) as T;
    if (typeof payload.expiresAt !== "number") return null;
    if (payload.expiresAt * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * A signing secret from the environment, with a development fallback.
 *
 * Shared by both session kinds because the policy is identical and worth stating once: in
 * production a missing secret is fatal, with the message naming the variable and the
 * command that generates a value. In development a fixed string is used instead, so a
 * fresh clone runs with no setup and restarting the dev server does not sign everyone out.
 *
 * The fallback is never reachable in production, and the minimum length is enforced rather
 * than suggested — a sixteen-character secret on an HMAC is a secret an attacker can
 * search for offline given one valid token.
 */
export function secretFromEnv(variable: string, purpose: string): string {
  const fromEnv = process.env[variable];
  if (fromEnv && fromEnv.length >= 32) return fromEnv;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `${variable} must be set to at least 32 characters in production. ` +
        "Generate one with: node -e \"console.log(require('node:crypto').randomBytes(32).toString('hex'))\"",
    );
  }

  return `development-only-insecure-${purpose}-secret-do-not-ship`;
}
