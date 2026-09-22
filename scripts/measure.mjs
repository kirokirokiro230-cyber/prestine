/**
 * Ad-hoc payload measurement against a running production server.
 *
 * Usage: node scripts/measure.mjs [baseUrl]
 *
 * Reports, per route: raw HTML, brotli-compressed HTML, SVG element count and
 * how much of the HTML is the inline RSC flight payload — the number that grows
 * when too much data is handed to client components.
 */
import { brotliCompressSync } from "node:zlib";

const base = process.argv[2] ?? "http://localhost:4124";

const ROUTES = [
  "/",
  "/shop",
  "/shop/knitwear",
  "/collections",
  "/product/grade-a-cashmere-crew",
  "/cart",
];

const kb = (bytes) => `${(bytes / 1024).toFixed(0)}KB`;

const scriptSources = new Set();

for (const route of ROUTES) {
  const response = await fetch(base + route);
  const html = await response.text();

  for (const match of html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)) {
    scriptSources.add(match[1]);
  }

  const inlineOnly = html.length - html.replace(/<script>[\s\S]*?<\/script>/g, "").length;
  const svgCount = (html.match(/<svg/g) ?? []).length;
  const turbulence = (html.match(/feTurbulence/g) ?? []).length;
  // A phrase that only appears in review bodies — if it shows up on a listing
  // page, full product records are leaking into the client payload.
  const reviewLeak = (html.match(/Worth the wait/g) ?? []).length;

  console.log(
    [
      route.padEnd(34),
      `raw=${kb(html.length).padStart(6)}`,
      `br=${kb(brotliCompressSync(Buffer.from(html)).length).padStart(5)}`,
      `rsc=${kb(inlineOnly).padStart(6)}`,
      `svg=${String(svgCount).padStart(3)}`,
      `grain=${String(turbulence).padStart(2)}`,
      `reviewLeak=${reviewLeak}`,
    ].join("  "),
  );
}

let jsTotal = 0;
for (const source of scriptSources) {
  const response = await fetch(base + source);
  jsTotal += (await response.arrayBuffer()).byteLength;
}

console.log(
  `\nclient JS across those routes: ${scriptSources.size} files, ${kb(jsTotal)} uncompressed`,
);
