/**
 * Confirms the rebuilt `globals.css` produces the same design system as before.
 *
 * The file was truncated by a bad in-place edit and reconstructed from the last compiled
 * stylesheet. "It builds" proves nothing here — a dropped colour or a missing semantic
 * alias compiles perfectly and quietly restyles the whole shop. So every token below is
 * asserted against the value recovered from that build.
 *
 * The expected values are transcribed from the pre-loss output; treat this file as the
 * record of what the design system contains. Safe to delete once the site has been
 * looked at in a browser and the recovery is trusted.
 *
 * Usage: node scripts/verify-globals-recovery.mjs [compiled.css]
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const dir = ".next/static/chunks";
const explicit = process.argv[2];

const file =
  explicit ??
  join(
    dir,
    (await readdir(dir)).find((name) => name.endsWith(".css")) ?? "missing.css",
  );

const css = await readFile(file, "utf8");

let failures = 0;

function check(label, condition, detail = "") {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`${ok ? "pass" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

/** Every custom property, minus Tailwind's plumbing and the minifier's markers. */
const properties = new Map();
for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/gi)) {
  const name = match[1];
  if (name.startsWith("--tw-") || name.startsWith("--lightningcss")) continue;
  properties.set(name, match[2].trim().replace(/\s+/g, " "));
}

function token(name, expected) {
  const actual = properties.get(name);
  check(name, actual === expected, actual === undefined ? "missing" : actual);
}

console.log(`stylesheet  ${file}  ${(css.length / 1024).toFixed(1)}KB`);
console.log(`properties  ${properties.size}\n`);

console.log("— type —");
token("--font-sans", 'var(--font-inter), ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif');
token("--font-display", 'var(--font-cormorant), "Cormorant Garamond", "Times New Roman", serif');
token("--text-2xs", ".6875rem");
token("--text-2xs--line-height", "1.35");

console.log("\n— ink —");
const ink = {
  100: "#e8e6e1",
  200: "#cdc9c1",
  300: "#a9a49a",
  400: "#807b71",
  500: "#605c54",
  600: "#4a4741",
  700: "#383530",
  800: "#24221e",
  900: "#171512",
  950: "#0d0c0a",
};
for (const [step, value] of Object.entries(ink)) token(`--color-ink-${step}`, value);

console.log("\n— bone —");
const bone = { 50: "#fdfcfa", 100: "#fbf9f6", 200: "#f5f1ea", 300: "#ede7dd", 400: "#e0d7c9" };
for (const [step, value] of Object.entries(bone)) token(`--color-bone-${step}`, value);

console.log("\n— clay —");
const clay = {
  50: "#faf3ef",
  100: "#f2e2d8",
  200: "#e3c4b2",
  300: "#cfa189",
  500: "#a06a4c",
  600: "#85543c",
  700: "#6a4331",
  900: "#38251d",
};
for (const [step, value] of Object.entries(clay)) token(`--color-clay-${step}`, value);

console.log("\n— moss and status —");
token("--color-moss-100", "#e6e9e0");
token("--color-moss-500", "#6b7758");
token("--color-moss-700", "#46503a");
token("--color-moss-900", "#2b3123");
token("--color-success-100", "#dcf0e4");
token("--color-success-500", "#2f7d54");
token("--color-success-700", "#1f5b3c");
token("--color-warning-100", "#fbeed6");
token("--color-warning-500", "#b07d1f");
token("--color-warning-700", "#7c5713");
token("--color-danger-100", "#f7e0dd");
token("--color-danger-500", "#b4432f");
token("--color-danger-700", "#872f20");

console.log("\n— motion —");
token("--ease-out-quint", "cubic-bezier(.22, 1, .36, 1)");
token("--ease-in-out-quart", "cubic-bezier(.76, 0, .24, 1)");
token("--animate-fade-up", "fade-up .7s var(--ease-out-quint) both");
token("--animate-fade-in", "fade-in .5s ease-out both");
token("--animate-scale-in", "scale-in .35s var(--ease-out-quint) both");
token("--animate-slide-in-right", "slide-in-right .4s var(--ease-out-quint) both");
token("--animate-slide-in-left", "slide-in-left .4s var(--ease-out-quint) both");
token("--animate-slide-up", "slide-up .35s var(--ease-out-quint) both");
token("--animate-marquee", "marquee 42s linear infinite");
token("--animate-shimmer", "shimmer 1.6s ease-in-out infinite");
token("--animate-fade-out-left", "fade-out-left .7s var(--ease-in-out-quart) both");
token("--animate-fade-out-right", "fade-out-right .7s var(--ease-in-out-quart) both");
token("--intro-form", "1.15s");
token("--intro-flight", ".62s");

console.log("\n— layout —");
token("--container-page", "88rem");

console.log("\n— semantic tokens, light —");
// Scoped to the `:root` block so the dark overrides cannot satisfy these by accident.
const lightBlock = css.match(/:root\{[^}]*--sem-canvas[^}]*\}/)?.[0] ?? "";
const darkBlock = css.match(/\.dark\{[^}]*--sem-canvas[^}]*\}/)?.[0] ?? "";

const light = {
  "--sem-canvas": "var(--color-bone-100)",
  "--sem-surface": "#fff",
  "--sem-surface-raised": "#fff",
  "--sem-surface-sunken": "var(--color-bone-200)",
  "--sem-inverse": "var(--color-ink-950)",
  "--sem-on-inverse": "var(--color-bone-100)",
  "--sem-content": "var(--color-ink-900)",
  "--sem-content-muted": "var(--color-ink-500)",
  "--sem-content-subtle": "var(--color-ink-400)",
  "--sem-line": "#e5dfd5",
  "--sem-line-strong": "var(--color-ink-200)",
  "--sem-accent": "var(--color-clay-600)",
  "--sem-accent-hover": "var(--color-clay-700)",
  "--sem-on-accent": "#fff",
  "--sem-accent-soft": "var(--color-clay-50)",
  "--sem-focus": "var(--color-clay-600)",
  "--sem-overlay": "#0d0c0a8c",
};

for (const [name, value] of Object.entries(light)) {
  check(name, lightBlock.includes(`${name}:${value}`), value);
}

console.log("\n— semantic tokens, dark —");
const dark = {
  "--sem-canvas": "#0d0c0a",
  "--sem-surface": "#171512",
  "--sem-surface-raised": "#1e1c18",
  "--sem-surface-sunken": "#100f0d",
  "--sem-inverse": "var(--color-bone-100)",
  "--sem-on-inverse": "var(--color-ink-950)",
  "--sem-content": "#f1ede6",
  "--sem-content-muted": "#a9a49a",
  "--sem-content-subtle": "#807b71",
  "--sem-line": "#2d2a25",
  "--sem-line-strong": "#423e37",
  "--sem-accent": "var(--color-clay-300)",
  "--sem-accent-hover": "var(--color-clay-200)",
  "--sem-on-accent": "var(--color-ink-950)",
  "--sem-accent-soft": "#241a14",
  "--sem-focus": "var(--color-clay-300)",
};

for (const [name, value] of Object.entries(dark)) {
  check(name, darkBlock.includes(`${name}:${value}`), value);
}
// Rounded by the minifier, so allow either neighbouring byte.
check("--sem-overlay", /--sem-overlay:#050504b[23]/.test(darkBlock));

console.log("\n— shadows reach the utilities —");
// Emitted inline rather than as variables, so they are checked where they land.
check("shadow-xs", css.includes("0 1px 2px var(--tw-shadow-color,#14130f0a)"));
check("shadow-sm", css.includes("0 1px 3px var(--tw-shadow-color,#14130f0f)"));
check("shadow-md", css.includes("0 6px 16px -4px var(--tw-shadow-color,#14130f1a)"));
check("shadow-lg", css.includes("0 18px 40px -12px var(--tw-shadow-color,#14130f29)"));
check("shadow-xl", css.includes("0 32px 70px -20px var(--tw-shadow-color,#14130f3d)"));

console.log("\n— keyframes —");
const frames = new Set([...css.matchAll(/@keyframes\s+([a-z0-9-]+)/gi)].map((m) => m[1]));
for (const name of [
  "fade-up",
  "fade-in",
  "scale-in",
  "slide-in-right",
  "slide-in-left",
  "slide-up",
  "fade-out-left",
  "fade-out-right",
  "marquee",
  "shimmer",
  "intro-veil-out",
  "intro-flyer-out",
  "intro-land",
  "intro-shell",
  "intro-plate",
  "intro-limb",
  "intro-glyph",
  "draw-line",
  "draw-ink",
  "draw-erase",
  "draw-wipe",
]) {
  check(name, frames.has(name));
}

console.log("\n— authored rules —");
check(".page-gutter", css.includes(".page-gutter{padding-inline:1.25rem}"));
check(".page-gutter at sm", /min-width:40rem\)\{\.page-gutter\{padding-inline:2rem/.test(css));
check(".page-gutter at lg", /min-width:64rem\)\{\.page-gutter\{padding-inline:3rem/.test(css));
check(".page-gutter at 2xl", /min-width:96rem\)\{\.page-gutter\{padding-inline:4rem/.test(css));
check(".link-underline", css.includes(".link-underline{position:relative}"));
check(".link-underline wipe", css.includes("transform-origin:0") && css.includes("scaleX(0)"));
check(".link-underline states", css.includes('.link-underline[data-active=true]:after'));
check(".scrollbar-thin", css.includes("scrollbar-color:var(--sem-line-strong) transparent"));
check(".no-scrollbar", css.includes(".no-scrollbar{scrollbar-width:none}"));
check("[data-numeric]", css.includes("[data-numeric]{font-variant-numeric:tabular-nums}"));
check("::selection", css.includes("::selection{background-color:var(--color-clay-200)"));
check("default border colour", css.includes("*{border-color:var(--sem-line)}"));
check("smooth scrolling", css.includes("scroll-behavior:smooth"));
check("body typography", css.includes("text-rendering:optimizelegibility"));

console.log("\n— dark mode still switches —");
// The custom variant is the easiest thing to lose: without it `dark:` utilities compile
// against the OS preference and the theme toggle silently stops working.
check("class-based dark variant", css.includes(":where(.dark,.dark *)"));
check("utilities reference the alias", css.includes("var(--sem-canvas)"));
check("reduced motion honoured", css.includes("prefers-reduced-motion"));

console.log(
  `\n${failures === 0 ? "RECOVERY VERIFIED" : `${failures} CHECK(S) FAILED`}`,
);
process.exitCode = failures === 0 ? 0 : 1;
