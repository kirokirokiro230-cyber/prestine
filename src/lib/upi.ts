/**
 * UPI IDs (virtual payment addresses).
 *
 * A UPI ID is `name@handle`: a name the customer chose or their phone number, and the
 * handle of the app or bank that issued it (`ybl`, `okaxis`, `paytm`, `oksbi` and so on).
 *
 * ## Why this is checked strictly
 *
 * The ID is where a refund is sent. A typo does not produce an error — it produces a
 * payment to a stranger — so the format check is as tight as the format allows, and the
 * form asks for the ID twice. The same strictness keeps the value safe wherever it ends
 * up: it can only contain letters, digits and `. - _` before the `@`, so it cannot carry
 * markup, a URL or a `upi://` parameter into a page or a link.
 *
 * ## What this cannot do
 *
 * A well-formed ID is not a real one, and a real one is not necessarily the customer's.
 * Confirming that an ID exists means asking the payment network, which is a separate
 * service. This only rules out what could not possibly be an ID.
 */

/** Longest ID accepted. The database column allows 100. */
export const MAX_UPI_LENGTH = 100;

/**
 * `name@handle`.
 *
 * - name: starts with a letter or digit, then letters, digits, `.`, `-`, `_`; 2 to 50
 *   characters. A phone number (`9876543210@ybl`) fits.
 * - handle: starts with a letter, then letters or digits; 2 to 32 characters. Handles are
 *   words in practice, and digits are allowed only so a real one is not refused.
 */
const UPI_PATTERN = /^[a-z0-9][a-z0-9._-]{1,49}@[a-z][a-z0-9]{1,31}$/;

/**
 * The ID as it should be stored: trimmed and lower-cased.
 *
 * UPI handles are not case-sensitive, so `Asha.K@OKAXIS` and `asha.k@okaxis` are one
 * address; storing a single form means the two entries in the form compare equal and a
 * refund is never held up by capitalisation.
 */
export function normaliseUpiId(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Why an ID is not acceptable, or `null` when it is. Takes the raw value. */
export function upiError(raw: string): string | null {
  const value = normaliseUpiId(raw);

  if (!value) return "Enter your UPI ID.";

  if (value.length > MAX_UPI_LENGTH) return "That UPI ID is too long.";

  if (!value.includes("@")) {
    return "A UPI ID looks like name@bank, for example asha@okaxis.";
  }

  if (!UPI_PATTERN.test(value)) {
    return "That does not look like a valid UPI ID. Check for spaces or a mistyped bank name after the @.";
  }

  return null;
}

/**
 * A copy that is safe to show back to the customer and to keep on file.
 *
 * Keeps the first two characters of the name and the whole handle, with the rest hidden:
 * `ashakapoor@okaxis` becomes `as••••@okaxis`. Enough that the customer recognises their
 * own ID, not enough for someone looking over a shoulder, or a leaked screenshot, to use
 * it.
 *
 * The hidden part is a fixed length rather than one dot per character. Showing the real
 * length would tell an observer how long the name is, which is most of what is needed to
 * guess a phone-number ID (always ten digits).
 */
export function maskUpiId(raw: string): string {
  const value = normaliseUpiId(raw);
  const at = value.lastIndexOf("@");
  if (at <= 0) return "••••";

  const name = value.slice(0, at);
  const handle = value.slice(at + 1);

  const visible = name.length >= 4 ? 2 : 1;
  return `${name.slice(0, visible)}••••@${handle}`;
}
