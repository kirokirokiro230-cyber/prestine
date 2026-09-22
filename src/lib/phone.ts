/**
 * Mobile numbers, normalised.
 *
 * A phone number is the login identifier for a customer account, which makes its
 * canonical form load-bearing in a way a display string never is. `+919876543210`,
 * `09876543210`, `98765 43210` and `+91 98765-43210` are one person, and if any two of
 * them can both be stored then the unique index is decoration and the same human ends
 * up with two accounts — one of which holds their orders and the other of which they
 * can actually sign in to.
 *
 * So everything that touches a number runs it through `normalisePhone` first: the
 * signup form, the sign-in action, the OTP issuer and the password reset. There is one
 * spelling in storage, E.164, and it is the only spelling any lookup uses.
 *
 * Deliberately not `libphonenumber-js`. It is the right answer for a checkout that has
 * to validate numbers in ninety countries and tell a Brazilian that they are missing a
 * digit — and it is roughly half a megabyte of metadata for a project with six runtime
 * dependencies and a bundle check in CI. What is needed here is narrower: reject
 * anything that is not plausibly dialable, and agree with itself every single time. A
 * regex does that. The cost of being loose is a customer who mistypes their own number,
 * discovers it at the OTP step thirty seconds later, and goes back — which the
 * two-step signup flow already makes cheap.
 */

/**
 * Country code assumed when a number is typed without one.
 *
 * Shoppers type their own number the way they say it out loud, which in most of the
 * world is the national form with no country code. Refusing that is technically
 * correct and commercially stupid, so a bare number gets this prefix.
 *
 * `NEXT_PUBLIC_` because both sides need the same answer: the form validates as you
 * type and the server action re-validates before it writes anything, and if those two
 * disagreed the form would accept a number the server then rejected. Next inlines the
 * value at build time, so it is a constant in the browser bundle rather than a lookup.
 *
 * Set it to wherever most of your customers are. It is not a restriction — anyone can
 * type a full `+<code>` number and that always wins.
 */
export const DEFAULT_COUNTRY_CODE =
  process.env.NEXT_PUBLIC_DEFAULT_COUNTRY_CODE?.trim() || "+91";

/**
 * E.164: a plus, a country code that cannot start with zero, and fifteen digits at the
 * very most including that country code.
 *
 * The lower bound is eight rather than the theoretical minimum, because every shorter
 * string that reaches this point in practice is a half-typed number rather than a real
 * subscriber on a very small numbering plan.
 */
const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * A number as it will be stored, or null when it is not plausibly a mobile number.
 *
 * Handles the three things people actually type:
 * - punctuation and spaces, which are stripped
 * - `00` as the international prefix, which becomes `+`
 * - a national trunk `0`, which is dropped when a country code is being added
 *
 * That last one is the only subtle case. `07700 900123` and `+447700900123` are the
 * same UK number, and the leading zero is a domestic dialling instruction rather than
 * part of the number — prefixing the country code without removing it produces
 * `+4407700900123`, which is not a phone number anywhere.
 */
export function normalisePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // `00` and `+` are the same instruction. Normalise to `+` before anything else.
  const international = trimmed.startsWith("00") ? `+${trimmed.slice(2)}` : trimmed;
  const explicit = international.startsWith("+");

  const digits = international.replace(/\D/g, "");
  if (!digits) return null;

  const candidate = explicit
    ? `+${digits}`
    : `${DEFAULT_COUNTRY_CODE}${digits.replace(/^0+/, "")}`;

  return E164.test(candidate) ? candidate : null;
}

/**
 * Validation message for a form, or null when the number is fine.
 *
 * Separate from `normalisePhone` because a form needs a sentence and a lookup needs a
 * value, and a function that returns either depending on how you call it is the kind of
 * convenience that gets a message written into a database column.
 */
export function phoneError(input: string): string | null {
  if (!input.trim()) return "Mobile number is required.";
  return normalisePhone(input)
    ? null
    : `Enter a valid mobile number, with or without the country code (${DEFAULT_COUNTRY_CODE}).`;
}

/**
 * True when two numbers are the same person.
 *
 * Exists so no caller is ever tempted to compare raw input with a stored value. Both
 * sides are normalised; anything unparseable matches nothing, including itself.
 */
export function samePhone(a: string, b: string): boolean {
  const left = normalisePhone(a);
  const right = normalisePhone(b);
  return Boolean(left && right && left === right);
}
