/**
 * Verifies the home-page hero carousel renders correctly and accessibly.
 *
 * Carousels are the component most often shipped broken for keyboard and screen
 * reader users, and none of that is visible by looking at the page. These assertions
 * are the ones that regress silently.
 *
 * Usage: node scripts/check-banners.mjs [baseUrl]
 */
const base = process.argv[2] ?? "http://localhost:4136";

let failures = 0;

function check(label, condition, detail = "") {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`${ok ? "pass" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

const home = await fetch(base).then((response) => response.text());

console.log("— carousel is present and labelled —");
check('has a carousel region', home.includes('aria-roledescription="carousel"'));
check("the region is named", home.includes('aria-label="Featured"'));

/**
 * One slide per banner, and no more. The slides are stacked and the one leaving is
 * animated out, so there is no sliding track and therefore no duplicate slide needed
 * to stop the loop rewinding. A fourth slide here means that workaround is back.
 */
const slides = (home.match(/aria-roledescription="slide"/g) ?? []).length;
check("one slide per banner", slides === 3, `${slides} slides`);

const firstLabel = (home.match(/aria-label="1 of 3"/g) ?? []).length;
check("no banner is rendered twice", firstLabel === 1, `${firstLabel} labelled "1 of 3"`);

console.log("\n— slide copy comes from the store —");
check("first heading rendered", home.includes("Clothing made to outlast the season."));
check("second heading rendered", home.includes("Twelve pieces that carry a whole wardrobe."));
check("third heading rendered", home.includes("Free repairs, for as long as you own it."));
check("eyebrow rendered", home.includes("Autumn / Winter 2026"));
check("call to action rendered", home.includes("Shop new arrivals"));

console.log("\n— slides are individually identified —");
check('slide numbered "1 of 3"', home.includes('aria-label="1 of 3"'));
check('slide numbered "3 of 3"', home.includes('aria-label="3 of 3"'));

console.log("\n— inactive slides are removed from the tab order —");
// Exactly one slide is interactive. Every other slide must be inert and aria-hidden,
// including the one currently sliding out — a keyboard user should not be able to Tab
// into a banner that is on its way off screen.
const inert = (home.match(/inert=""/g) ?? []).length;
check("exactly one slide is interactive", inert === slides - 1, `${inert} of ${slides} inert`);

console.log("\n— slides are stacked, not laid out in a row —");
// Stacking is what makes the wrap-around safe, so it is worth pinning down. The stack
// carries the height because absolutely positioned children cannot.
check("the stack owns the height", home.includes("relative min-h-[26rem]"));
check("slides are layered on top of each other", home.includes("absolute inset-0"));
check("the visible slide is above the hidden ones", home.includes("z-10"));
check("hidden slides are transparent rather than unmounted", home.includes("opacity-0"));

console.log("\n— controls exist and are labelled —");
check("previous button", home.includes('aria-label="Previous slide"'));
check("next button", home.includes('aria-label="Next slide"'));
// Removed on request. Auto-advance still stops on hover and on focus inside the
// carousel, and never starts at all under prefers-reduced-motion.
check("no pause control", !home.includes("slideshow"));
check(
  "dots name their destination",
  home.includes("Go to slide 2: Twelve pieces that carry a whole wardrobe."),
);
check("current dot marked", home.includes('aria-current="true"'));

console.log("\n— no broken images before photography exists —");
check(
  "renders a gradient, not an <img>",
  home.includes("linear-gradient(135deg, #B08D63"),
);

/**
 * The desktop treatment is a short wide cinematic band rather than a tall hero.
 *
 * Every class below is responsive or arbitrary, which means it only reaches the
 * stylesheet if Tailwind saw the literal string in a source file. A refactor that
 * assembles a class name by concatenation drops the rule silently — no error, no
 * failing type — and the banner just reverts to the tall mobile hero on desktop.
 * Asserting against the built CSS as well as the markup is the only way to see it.
 */
console.log("\n— desktop is a wide cinematic band —");
check("16/5 band at lg", home.includes("lg:aspect-16/5"));
check("mobile min-height released at lg", home.includes("lg:min-h-0"));
check("band capped so it cannot fill a short window", home.includes("lg:max-h-[28rem]"));
check("heading steps down at lg", home.includes("lg:text-4xl"));
check("copy padding released at lg", home.includes("lg:py-0"));
check("compact call to action at lg", home.includes("lg:h-11"));

console.log("\n— arrows stay off the photograph until needed —");
check("carousel is a hover group", home.includes('class="group relative'));
check("hidden at lg by default", home.includes("lg:opacity-0"));
check("returns on hover", home.includes("lg:group-hover:opacity-100"));
check("returns on focus inside the carousel", home.includes("lg:group-focus-within:opacity-100"));
// Without this a keyboard user tabs to a button that is still invisible.
check("returns on its own focus", home.includes("focus-visible:opacity-100"));

console.log("\n— each banner arrives with motion of its own —");
// The image settles out of a slight zoom and the copy rises in behind it. Both are
// inline-transition classes, so they only exist if Tailwind saw the literal string.
check("image settles from a zoom", home.includes("scale-[1.06]"));
check("image zoom is slow", home.includes("duration-[1400ms]"));
check("copy rises in", home.includes("translate-y-4"));
check("copy lands just behind the image", home.includes("delay-200"));

console.log("\n— scrim is directional only for left-aligned copy —");
// A left-to-right gradient under centred text darkens the wrong half, so centred
// slides get a flat wash instead. The seeded slides are left-aligned.
check("gradient present", home.includes("bg-gradient-to-r"));
check("gradient clears the far side at lg", home.includes("lg:to-transparent"));

console.log("\n— mobile was left alone —");
check("tall hero is still the mobile default", home.includes("min-h-[26rem]"));
check("mobile step-up intact", home.includes("sm:min-h-[32rem]"));
check("mobile heading scale intact", home.includes("sm:text-5xl"));

console.log("\n— the rules survived into the built CSS —");
const hrefs = [...home.matchAll(/href="(\/_next\/static\/[^"]+\.css)"/g)].map(
  (match) => match[1],
);
const css = (
  await Promise.all(
    hrefs.map((href) => fetch(new URL(href, base)).then((response) => response.text())),
  )
).join("\n");

check("a stylesheet was linked", hrefs.length > 0, `${hrefs.length} file(s)`);
// Tailwind escapes the selectors, so match the declarations instead.
check("aspect-ratio rule generated", /aspect-ratio:\s*16\s*\/\s*5/.test(css));
check("28rem cap generated", /max-height:\s*28rem/.test(css));
check("a min-width:1024px block exists", /min-width:\s*(1024px|64rem)/.test(css));
check("hover reveal generated", css.includes("group-hover") || css.includes(":is(:hover"));

/**
 * The exit animation cannot be asserted from the markup: nothing is leaving on first
 * paint, so the class is never in the server-rendered HTML. It has to be checked in
 * the stylesheet — and it only reaches the stylesheet if Tailwind saw the literal
 * class name in a source file, which is exactly the failure worth catching.
 */
console.log("\n— the departing banner has somewhere to go —");
check("fade-out-left keyframes defined", css.includes("@keyframes fade-out-left"));
check("fade-out-right keyframes defined", css.includes("@keyframes fade-out-right"));
check("leftward exit utility generated", css.includes("animate-fade-out-left"));
check("rightward exit utility generated", css.includes("animate-fade-out-right"));
// It must travel the full width, not merely fade on the spot. The minifier rewrites
// `translate3d(-100%, 0, 0)` to `translate(-100%)`, so accept either spelling.
check(
  "the exit slides fully off",
  /transform:\s*translate(3d)?\(-100%(,\s*0,\s*0)?\)/.test(css),
);
check(
  "the backward exit slides the other way",
  /transform:\s*translate(3d)?\(100%(,\s*0,\s*0)?\)/.test(css),
);
// Opacity is held until 30% so the photograph moves before it dissolves.
check("the fade is held back at first", /30%\s*\{\s*opacity:\s*1/.test(css));
// `both` holds the end frame, or the banner snaps back to centre on the last frame.
check("the end state is held", /fade-out-left[^;}]*both/.test(css));

console.log(
  `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`,
);
process.exitCode = failures === 0 ? 0 : 1;
