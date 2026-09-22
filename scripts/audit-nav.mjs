/**
 * Reports what the primary navigation actually contains.
 *
 * Written because the old menu's problems — the same heading twice, every category
 * listed under two different top-level items — were invisible when reading the
 * builder and obvious the moment the links were counted. Run it after any nav change.
 *
 * Usage: node scripts/audit-nav.mjs [baseUrl]
 */
const base = process.argv[2] ?? "http://localhost:4130";

const html = await fetch(base).then((response) => response.text());

/** The primary nav landmark, up to its closing tag. */
const navMatch = html.match(/<nav aria-label="Main"[\s\S]*?<\/nav>/);
if (!navMatch) {
  console.error("Could not find the primary nav in the page.");
  process.exit(1);
}

// Top-level items are the direct anchors inside the nav landmark.
const topLevel = [...navMatch[0].matchAll(/href="([^"]+)"[^>]*>([^<]+)</g)].map(
  ([, href, label]) => ({ label: label.trim(), href }),
);

// Mega panels sit after the nav, one per expandable item.
const panels = [...html.matchAll(/<div id="mega-([a-z0-9-]+)"[\s\S]*?(?=<div id="mega-|<main )/g)];

console.log("— top level —");
for (const item of topLevel) console.log(`  ${item.label.padEnd(14)} ${item.href}`);

console.log("\n— dropdowns —");
if (panels.length === 0) console.log("  (none)");

const allLinks = [];
const headings = [];

for (const [panel, name] of panels) {
  /*
   * Any element carrying the `eyebrow` class, whatever else is on it.
   *
   * This was pinned to the literal `class="eyebrow mb-4"`, which meant changing the
   * heading's margin silently reduced the column count to zero — and because the
   * duplicate check below compares a list against itself, an empty list reported "no
   * repeated headings" and passed. A monitoring script that fails open is worse than no
   * script, so the class match is now tolerant and a headingless panel is called out.
   */
  const panelHeadings = [
    ...panel.matchAll(/class="eyebrow(?:\s[^"]*)?"[^>]*>([^<]+)</g),
  ].map(([, text]) => text.trim());
  // Attribute order is not guaranteed, so match any anchor and read its href.
  const links = [...panel.matchAll(/<a\b[^>]*>([^<]+)<\/a>/g)]
    .map(([tag, label]) => ({
      label: label.trim(),
      href: tag.match(/href="([^"]+)"/)?.[1] ?? "",
    }))
    .filter((link) => link.href);

  headings.push(...panelHeadings);
  allLinks.push(...links);

  console.log(`  ${name}: ${panelHeadings.length} columns, ${links.length} links`);
  for (const heading of panelHeadings) console.log(`     · ${heading}`);

  // A panel with links but no headings means the selector has drifted, not that the
  // menu is unlabelled. Say so rather than reporting a clean run.
  if (links.length > 0 && panelHeadings.length === 0) {
    console.log(
      `     WARNING: ${links.length} links but no column headings found — the heading selector may be out of date`,
    );
  }
}

console.log("\n— duplication —");

const duplicateHeadings = headings.filter(
  (heading, index) => headings.indexOf(heading) !== index,
);
console.log(
  duplicateHeadings.length === 0
    ? "  no repeated column headings"
    : `  REPEATED HEADINGS: ${[...new Set(duplicateHeadings)].join(", ")}`,
);

const hrefs = allLinks.map((link) => link.href);
const duplicateHrefs = [...new Set(hrefs.filter((href, i) => hrefs.indexOf(href) !== i))];
console.log(
  duplicateHrefs.length === 0
    ? "  no link appears twice in the dropdowns"
    : `  REPEATED LINKS: ${duplicateHrefs.join(", ")}`,
);

console.log(
  `\ntotals: ${topLevel.length} top-level, ${panels.length} dropdown(s), ` +
    `${allLinks.length} dropdown links`,
);
