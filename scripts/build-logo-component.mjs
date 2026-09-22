/**
 * Turns the supplied vectorizer output into a structured React component.
 *
 * The source SVG is machine-traced: 25 unnamed paths, coordinates carrying eight
 * decimal places, and a full-canvas white rectangle sitting behind the artwork. It
 * cannot be animated in that state — nothing is grouped, nothing is named, and the
 * shell plates are white shapes painted on top of black rather than holes, so on a
 * dark background they would render as white blocks.
 *
 * This script is the one-time conversion. It keeps the designer's exact outlines —
 * they are the logo, and re-drawing them by hand would change the brand — while
 * fixing everything around them:
 *
 * - drops the background rectangle
 * - rounds coordinates to whole units (0.1% of a 960-unit canvas, invisible even
 *   when the mark is blown up full screen) which is most of the size saving
 * - sorts every path into a named part, so each one can be animated
 * - emits `currentColor` for the ink and a themeable variable for the knockouts
 * - splits the mark from the wordmark and gives each a tight viewBox, so the turtle
 *   can be used on its own as a favicon or a loading indicator
 *
 * Re-runnable: `node scripts/build-logo-component.mjs <source.svg>`
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** The designer's file, kept in the repo so the component can always be regenerated. */
const source = process.argv[2] ?? "assets/brand/kabuda-logo-source.svg";
const target = "src/components/brand/brand-mark.tsx";

/**
 * Which traced path is which, by index in the source file.
 *
 * Identified from each path's fill and bounding box. Hard-coded because the source is a
 * fixed artefact; if the logo is ever re-exported this map has to be checked again,
 * which is why the script verifies the path count before trusting it and refuses to run
 * on a file it does not recognise.
 */
const PARTS = {
  shell: [1],
  plates: [3, 8, 13, 7, 15, 16, 14],
  head: [2],
  flippers: [6, 5, 10, 11],
  tail: [22],
  wordmark: [17, 24, 19, 21, 4, 12, 23, 9, 18, 20],
};

/**
 * The wordmark grouped into letters, left to right.
 *
 * The trace has no concept of a glyph: "K" is two paths, and B's counter is a separate
 * white shape. Staggering the raw paths would animate a letter's hole apart from the
 * letter, so each entry here collects the paths that have to move together. Derived
 * from the x-extents in the inspection output.
 */
const LETTERS = [
  { letter: "K", paths: [17, 24] },
  { letter: "A", paths: [21, 19] },
  { letter: "B", paths: [4, 23] },
  { letter: "U", paths: [12] },
  { letter: "D", paths: [9] },
  { letter: "A", paths: [20, 18] },
];

/** Knockout paths — white in the source, so they must not be painted with the ink. */
const KNOCKOUTS = new Set([3, 7, 8, 13, 14, 15, 16, 23]);

/** Plates, in the order they should animate: centre first, then outward. */
const PLATE_ORDER = ["centre", "top", "upper-right", "bottom", "lower-left", "lower-right", "upper-left"];

/** Flippers, front pair then rear pair. */
const FLIPPER_ORDER = ["front-left", "front-right", "rear-left", "rear-right"];

const svg = await readFile(source, "utf8");

const paths = [...svg.matchAll(/<path\s+d="([^"]+)"([^>]*)>/g)].map((match) => ({
  d: match[1],
  attrs: match[2],
}));

const expected = 25;
if (paths.length !== expected) {
  console.error(
    `Expected ${expected} paths but found ${paths.length}. The source logo has ` +
      `changed, so the index map in this script no longer applies — re-run ` +
      `scripts/inspect-logo-svg.mjs and update PARTS before continuing.`,
  );
  process.exitCode = 2;
  process.exit();
}

/** Apply the path's own translate and round to whole units. */
function normalise(path) {
  const translate = path.attrs.match(/translate\(([^)]+)\)/)?.[1] ?? "0,0";
  const [tx, ty] = translate.split(",").map((value) => Number.parseFloat(value.trim()));

  let axis = 0;
  const d = path.d.replace(/-?\d+(?:\.\d+)?/g, (raw) => {
    const value = Number.parseFloat(raw) + (axis % 2 === 0 ? tx : ty);
    axis += 1;
    return String(Math.round(value));
  });

  // Collapse the whitespace the vectorizer leaves behind, and drop separators that
  // are redundant once numbers can start with a minus sign.
  return d.replace(/\s+/g, " ").replace(/ -/g, "-").trim();
}

const normalised = paths.map(normalise);

/** Extents of a set of paths, used to give each SVG a tight viewBox. */
function viewBox(indices) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const index of indices) {
    const numbers = [...normalised[index].matchAll(/-?\d+/g)].map((match) =>
      Number.parseInt(match[0], 10),
    );
    numbers.forEach((value, position) => {
      if (position % 2 === 0) {
        minX = Math.min(minX, value);
        maxX = Math.max(maxX, value);
      } else {
        minY = Math.min(minY, value);
        maxY = Math.max(maxY, value);
      }
    });
  }

  // A unit of padding absorbs any rounding that pushed ink outside the box.
  return `${minX - 1} ${minY - 1} ${maxX - minX + 2} ${maxY - minY + 2}`;
}

const markIndices = [
  ...PARTS.shell,
  ...PARTS.plates,
  ...PARTS.head,
  ...PARTS.flippers,
  ...PARTS.tail,
];

const markBox = viewBox(markIndices);
const wordBox = viewBox(PARTS.wordmark);

/**
 * `pathLength="1"` normalises every path to a length of one unit.
 *
 * That is what lets the mark draw itself in pure CSS: `stroke-dasharray: 1` becomes a
 * single dash covering the whole outline whatever its real length, so animating
 * `stroke-dashoffset` from 1 to 0 traces it. Without it each path would need its length
 * measured at runtime with `getTotalLength()`.
 *
 * Applied to the mark only. The wordmark is revealed with a wipe, not a trace.
 */
function path(index, extra = "", traceable = false) {
  const fill = KNOCKOUTS.has(index) ? "var(--brand-knockout)" : "currentColor";
  const length = traceable ? ' pathLength="1"' : "";
  return `      <path${extra}${length} fill="${fill}" d="${normalised[index]}" />`;
}

const plates = PARTS.plates
  .map((index, position) => path(index, ` data-plate="${PLATE_ORDER[position]}"`, true))
  .join("\n");

const flippers = PARTS.flippers
  .map((index, position) => path(index, ` data-flipper="${FLIPPER_ORDER[position]}"`, true))
  .join("\n");

const covered = LETTERS.flatMap((entry) => entry.paths).sort((a, b) => a - b);
const listed = [...PARTS.wordmark].sort((a, b) => a - b);
if (covered.join() !== listed.join()) {
  console.error(
    `LETTERS covers [${covered}] but the wordmark is [${listed}] — every glyph path ` +
      `must belong to exactly one letter or it will not animate.`,
  );
  process.exitCode = 2;
  process.exit();
}

const glyphs = LETTERS.map(
  (entry, position) =>
    `        <g data-glyph="${position}" data-letter="${entry.letter}">\n` +
    entry.paths.map((index) => `  ${path(index)}`).join("\n") +
    `\n        </g>`,
).join("\n");

const component = `/**
 * Brand mark — GENERATED. Do not hand-edit.
 *
 * Produced by \`node scripts/build-logo-component.mjs\` from the supplied logo SVG.
 * Re-run that script rather than changing paths here; the outlines are the designer's
 * and the script is what keeps them intact while making them usable.
 *
 * Two exports, because the turtle and the wordmark are needed apart as often as
 * together: \`TurtleMark\` alone works as a favicon, a loading indicator and the
 * header mark, while \`Wordmark\` carries the name.
 *
 * ## Colour
 *
 * The ink is \`currentColor\`, so the mark inherits the text colour and flips with the
 * theme for free. The shell plates are holes in the original artwork, but traced as
 * opaque white shapes — painting them white would put white blocks on the mark in
 * dark mode. They are filled with \`--brand-knockout\` instead, which defaults to the
 * page background. Set it if the mark is placed on anything other than the canvas.
 *
 * ## Animation
 *
 * Every animatable part carries a data attribute — \`data-part\`, \`data-plate\` and
 * \`data-flipper\` — so motion is attached with CSS selectors instead of by threading
 * class names through this generated file.
 */

/**
 * Anything valid on an \`<svg>\`, plus \`title\`.
 *
 * Passing arbitrary attributes through matters for one reason: the opening animation
 * finds its landing spot with \`data-brand-target\`, and it has to be possible to set
 * that from the call site rather than baking it into generated code. React's SVG props
 * have no \`title\` attribute — it is a child element — so it is replaced here, and
 * supplying it is what turns the mark from decoration into a labelled image.
 */
type BrandSvgProps = Omit<React.SVGProps<SVGSVGElement>, "title"> & {
  title?: string;
};

export function TurtleMark({
  className,
  title,
  ...props
}: BrandSvgProps) {
  return (
    <svg
      {...props}
      viewBox="${markBox}"
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ ["--brand-knockout" as string]: "var(--color-canvas)" }}
    >
      {title ? <title>{title}</title> : null}

      {/* Shell body first: the plates are knockouts painted over it. */}
      <g data-part="shell">
${path(PARTS.shell[0], "", true)}
      </g>

      {/* Plates, ordered centre outwards so a stagger reads as the pattern forming. */}
      <g data-part="plates">
${plates}
      </g>

      <g data-part="head">
${path(PARTS.head[0], "", true)}
      </g>

      <g data-part="flippers">
${flippers}
      </g>

      <g data-part="tail">
${path(PARTS.tail[0], "", true)}
      </g>
    </svg>
  );
}

export function Wordmark({
  className,
  title,
  ...props
}: BrandSvgProps) {
  return (
    <svg
      {...props}
      viewBox="${wordBox}"
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ ["--brand-knockout" as string]: "var(--color-canvas)" }}
    >
      {title ? <title>{title}</title> : null}
      <g data-part="wordmark">
${glyphs}
      </g>
    </svg>
  );
}
`;

await mkdir(dirname(target), { recursive: true });
await writeFile(target, component, "utf8");

const before = svg.length;
const after = component.length;

console.log(`source     ${source}  ${(before / 1024).toFixed(1)}KB`);
console.log(`generated  ${target}  ${(after / 1024).toFixed(1)}KB`);
console.log(`saving     ${(100 - (after / before) * 100).toFixed(0)}%`);
console.log(`mark       viewBox ${markBox}`);
console.log(`wordmark   viewBox ${wordBox}`);
console.log(`parts      ${markIndices.length} in the mark, ${PARTS.wordmark.length} glyphs`);
