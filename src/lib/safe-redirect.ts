/**
 * A redirect target that is guaranteed to stay on this site.
 *
 * `next` arrives from a query string or a form field, so it is attacker-controlled: a
 * link to `/signin?next=https://evil.example` that bounces the shopper off-site straight
 * after they type their password is a phishing gift, because that is the moment a
 * lookalike sign-in page is most convincing.
 *
 * `startsWith("/") && !startsWith("//")` is the check people write, and it is not enough:
 *
 * - Browsers read a backslash as a slash in a URL's authority, so `/\evil.example` is
 *   `//evil.example`.
 * - The URL parser strips tabs and newlines, so `/\t/evil.example` is `//evil.example`.
 * - Percent-encoded and Unicode variants exist that a string prefix test never sees.
 *
 * So instead of enumerating tricks, the value is resolved against a throwaway origin and
 * accepted only if the result is still that origin. Anything the parser would treat as
 * pointing elsewhere changes the origin and is refused.
 */
const PROBE_ORIGIN = "http://internal.invalid";

export function safeInternalPath(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith("/")) return fallback;

  // Control characters and backslashes have no business in a path we generated, and are
  // the raw material of the parser-differential tricks above.
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return fallback;

  try {
    const probe = new URL(next, PROBE_ORIGIN);
    if (probe.origin !== PROBE_ORIGIN) return fallback;

    const normalised = probe.pathname + probe.search + probe.hash;

    /*
     * Check what is actually returned, not only where the probe landed. The parser
     * resolves dot segments, so `/.//evil.example` stays on the probe origin and
     * normalises to the pathname `//evil.example` — which, handed back as a redirect
     * target, is protocol-relative and leaves the site. The origin test above passes
     * for it; this is the test that does not.
     */
    if (!normalised.startsWith("/") || normalised.startsWith("//")) return fallback;

    return normalised;
  } catch {
    return fallback;
  }
}
