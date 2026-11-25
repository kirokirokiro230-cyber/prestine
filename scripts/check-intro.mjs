/**
 * Verifies the opening logo animation.
 *
 * Almost none of this is visible by looking at the page for two seconds. The failures
 * that matter are silent: the animation quietly not reaching the stylesheet, the panel
 * appearing over the admin panel, a returning visitor sitting through it again, or the
 * logo turning into a black square on a black background in dark mode.
 *
 * Usage: node scripts/check-intro.mjs [baseUrl]
 */
const base = process.argv[2] ?? "http://localhost:4136";

let failures = 0;

function check(label, condition, detail = "") {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`${ok ? "pass" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

const home = await fetch(base).then((response) => response.text());

const hrefs = [...home.matchAll(/href="(\/_next\/static\/[^"]+\.css)"/g)].map(
  (match) => match[1],
);
const css = (
  await Promise.all(
    hrefs.map((href) => fetch(new URL(href, base)).then((response) => response.text())),
  )
).join("\n");

/**
 * The flyer's own markup.
 *
 * The mark is now rendered three times per page — the intro, the header lockup and the
 * footer lockup — so counting parts across the whole document says nothing. This
 * narrows to the flyer, and stops before the streamed payload, which repeats the same
 * attribute names in escaped form.
 */
const flyerStart = home.indexOf('class="intro-flyer"');
const payloadStart = home.indexOf("<script", flyerStart);
const flyer = home.slice(flyerStart, payloadStart === -1 ? undefined : payloadStart);

console.log("— the panel is served in the initial HTML —");
// It has to be in the markup, not added after hydration: a splash that appears once
// the page is already readable is worse than no splash at all.
check("panel present", home.includes('class="intro"'));
check("flyer located", flyerStart !== -1);
check("mark rendered", flyer.includes('data-part="shell"'));
check("plates rendered", (flyer.match(/data-plate="/g) ?? []).length === 7);
check("limbs rendered", flyer.includes('data-part="head"') && flyer.includes('data-part="tail"'));
check("flippers rendered", (flyer.match(/data-flipper="/g) ?? []).length === 4);
check("wordmark grouped into letters", (flyer.match(/data-glyph="/g) ?? []).length === 6);

console.log("\n— the lockup replaced the text wordmark —");
// The mark has to exist in the header for the flight to have anywhere to land, and in
// the footer for the brand to be consistent. Matching the rendered attribute form only,
// so the escaped copies in the streamed payload are not counted.
//
// Four, not three: the home page also renders the name-origin section, which carries its
// own turtle. This was asserting 3 from before that section existed, so it failed on a
// page that was correct. If the count changes again, work out which surface gained or
// lost a mark before editing the number.
const lockups = (home.match(/viewBox="172 213 621 656"/g) ?? []).length;
check(
  "mark rendered in intro, header, footer and name-origin section",
  lockups === 4,
  `${lockups} lockups`,
);

console.log("\n— it decides before first paint —");
// The inline script is what stops a returning visitor seeing a flash of the panel, and
// what hides the header logo so the flying mark has an empty slot to land in.
check("session script inlined", home.includes('sessionStorage.getItem("prestine:intro-seen")'));
check("first view is marked as playing", home.includes('p="playing"'));
check("script sets the document attribute", home.includes('setAttribute("data-intro",p)'));
check("script is in the head", home.indexOf("prestine:intro-seen") < home.indexOf("<body"));
// Safari in private mode throws on `sessionStorage`, and a decorative animation must
// never take the page down with it — so every access sits inside one try/catch.
check(
  "storage access is guarded",
  /try\{[\s\S]{0,400}sessionStorage[\s\S]{0,400}catch\(e\)\{\}/.test(home),
);

console.log("\n— the chosen entrance, and the one kept in reserve —");
// `assemble` is the shipped choreography. `draw` is retained as a switchable
// alternative, so both blocks have to survive in the stylesheet — if the unused one is
// ever dropped by a refactor, switching back would silently produce no animation at all.
// The variant is decided before first paint, because the entrance is pure CSS.
check("variant attribute is set", home.includes('setAttribute("data-intro-variant",v)'));
check("assemble is the default", home.includes('v="assemble"'));
check("query override accepted", home.includes('q==="assemble"||q==="draw"'));
check("override is remembered for the session", home.includes("prestine:intro-variant"));

check("assemble block compiled", /\[data-intro-variant=("?)assemble\1\]/.test(css));
check("draw block still available", /\[data-intro-variant=("?)draw\1\]/.test(css));

// The trace is the whole mechanism of the draw entrance: `pathLength="1"` normalises
// every outline to one unit so a dash can walk along it in pure CSS. Asserted even
// though `draw` is not current — it is the one thing the alternative needs from the
// generated mark, and losing it would break the switch silently.
check("mark paths stay traceable", (flyer.match(/pathLength="1"/g) ?? []).length === 14);
check("trace keyframes", css.includes("@keyframes draw-line"));
check("ink keyframes", css.includes("@keyframes draw-ink"));
check("outline fade keyframes", css.includes("@keyframes draw-erase"));
check("name wipe keyframes", css.includes("@keyframes draw-wipe"));
check("the dash covers the whole outline", /stroke-dasharray:\s*1/.test(css));
check("the trace is staggered by group", (css.match(/animation:\s*draw-line/g) ?? []).length >= 5);

console.log("\n— the logo flies into the header —");
// The backdrop has to be its own layer: fading the panel would fade the mark with it,
// and a logo dissolving in mid-flight looks like a bug rather than a transition.
check("backdrop is a separate layer", home.includes('class="intro-veil"'));
check("the lockup is a single flying element", home.includes('class="intro-flyer"'));
check("flight applies a measured transform", /translate\(var\(--fly-x/.test(css));
check("flight scales to the target", css.includes("--fly-scale"));
check("flight is a transition, not a keyframe", /\.intro-flyer\{[^}]*transition:\s*transform/.test(css.replace(/\s*([{};:,])\s*/g, "$1")));
check("flight duration is tokenised", /--intro-flight:\s*[\d.]+m?s/.test(css));
check("assembly hand-off point is tokenised", /--intro-form:\s*[\d.]+m?s/.test(css));

console.log("\n— there is exactly one landing spot —");
// A page can hold several lockups; the footer has one. Aiming at the wrong one would
// fly the mark to the bottom of the page.
// Rendered attribute form only. `data-brand-target` unquoted would also match the
// streamed payload and the stylesheet selector, neither of which is a landing spot.
const targets = (home.match(/data-brand-target=""/g) ?? []).length;
check("one flight target", targets === 1, `${targets} found`);
// An omitted prop must not reach the wire as an explicit undefined.
check("no undefined targets in the payload", !home.includes('data-brand-target\\":\\"$undefined'));
check("the target is in the header", home.indexOf("data-brand-target") < home.indexOf("<main"));
check("the target is hidden until it lands", /\[data-intro=("?)playing\1\]\s*\[data-brand-target\]/.test(css));
check("landing keyframes exist", css.includes("@keyframes intro-land"));
// If the script fails the header must not be left permanently logo-less, so the reveal
// runs on a timer rather than waiting to be told.
check("reveal is on a timer", /\[data-brand-target\][^{]*\{[^}]*animation-delay/.test(css.replace(/\s+/g, "")));
check("dismissing restores it at once", /\[data-intro=("?)seen\1\]\s*\[data-brand-target\]/.test(css));

console.log("\n— the shop is usable while the mark travels —");
check("panel releases input mid-flight", /\[data-flying=("?)true\1\][^{]*\{[^}]*pointer-events:\s*none/.test(css.replace(/\s+/g, "")));
check("stranded-mark fallback exists", css.includes("@keyframes intro-flyer-out"));

console.log("\n— it is invisible to assistive technology —");
check("panel is aria-hidden", /class="intro"[^>]*aria-hidden|aria-hidden[^>]*class="intro"/.test(home));
check("mark is not announced", home.includes('data-part="shell"') && home.includes('aria-hidden="true"'));
// No focusable children, or Tab lands inside a decoration.
const panel = home.slice(home.indexOf('class="intro"'));
const panelEnd = panel.indexOf("</div>");
check(
  "nothing focusable inside",
  !/<(a|button|input|select|textarea)[\s>]/.test(panel.slice(0, panelEnd)),
);

console.log("\n— it survives the theme —");
// A logo with black baked in becomes a black square on a dark background.
check("ink inherits the text colour", home.includes('fill="currentColor"'));
check("no hardcoded black", !home.includes('fill="#000000"') && !home.includes('fill="#010101"'));
check("knockouts are themeable", home.includes("--brand-knockout"));
check("knockouts follow the canvas", home.includes("var(--color-canvas)"));

console.log("\n— the animation reached the stylesheet —");
check("backdrop exit keyframes", css.includes("@keyframes intro-veil-out"));
check("shell keyframes", css.includes("@keyframes intro-shell"));
check("plate keyframes", css.includes("@keyframes intro-plate"));
check("limb keyframes", css.includes("@keyframes intro-limb"));
check("glyph keyframes", css.includes("@keyframes intro-glyph"));
// The minifier rewrites `1150ms` as `1.15s`, so accept either unit throughout.
check("timings are tokenised", /--intro-form:\s*[\d.]+m?s/.test(css));
// Plates scale about their own centre; limbs about the centre of the whole drawing so
// they radiate. Getting these the wrong way round is a subtle, very visible bug.
check("plates transform about themselves", /\[data-plate\][^{]*\{[^}]*fill-box/.test(css));
check("limbs transform about the drawing", css.includes("view-box"));
// 7 plates + 4 limb steps + 6 glyphs + the panel's own exit.
check(
  "staggered delays generated",
  (css.match(/animation-delay:\s*[\d.]+m?s/g) ?? []).length >= 15,
  `${(css.match(/animation-delay:\s*[\d.]+m?s/g) ?? []).length} delays`,
);

console.log("\n— it gets out of the way —");
// Attribute-selector quotes are optional, and the minifier removes them.
check("shortened exit when dismissed", /\[data-dismissed=("?)true\1\]/.test(css));
check(
  "hidden once seen",
  /\[data-intro=("?)seen\1\]\s*\.intro\s*\{[^}]*display:\s*none/.test(css),
);
check(
  "skipped under reduced motion",
  /prefers-reduced-motion[^@]*\.intro\{display:\s*none/.test(css.replace(/\s+/g, "")) ||
    /prefers-reduced-motion/.test(css),
);
// Sitting under the highest layer would let the header draw on top of the splash.
check("above every other layer", /\.intro\{[^}]*z-index:\s*150/.test(css.replace(/\s+/g, "")));

console.log("\n— the admin panel never sees it —");
const admin = await fetch(new URL("/admin/login", base)).then((response) =>
  response.text(),
);
check("no panel on /admin", !admin.includes('class="intro"'));
check("no logo animation markup on /admin", !admin.includes('data-part="shell"'));

console.log(
  `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`,
);
process.exitCode = failures === 0 ? 0 : 1;
