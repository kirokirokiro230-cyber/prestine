/**
 * Guard against server-only data leaking into client JavaScript.
 *
 * Scans the built client chunks for phrases that only exist in the catalogue and
 * in review prose. If any of them appear, a client component has imported the
 * product data directly and the whole catalogue is being shipped to the browser.
 *
 * Usage: node scripts/check-bundle.mjs
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const CHUNK_DIR = join(process.cwd(), ".next", "static", "chunks");

/** Distinctive strings from data that must never reach the browser bundle. */
const FORBIDDEN = [
  ["review prose", "Worth the wait"],
  ["product description", "double-faced coat needs no lining"],
  ["care instructions", "pH-neutral wool wash"],
  ["mill detail", "shuttle looms in Okayama"],
];

async function collect(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(path)));
    else if (entry.name.endsWith(".js")) files.push(path);
  }
  return files;
}

const files = await collect(CHUNK_DIR);

let totalBytes = 0;
const hits = [];

for (const file of files) {
  totalBytes += (await stat(file)).size;
  const source = await readFile(file, "utf8");
  for (const [label, needle] of FORBIDDEN) {
    if (source.includes(needle)) {
      hits.push({ label, file: file.replace(process.cwd(), "") });
    }
  }
}

console.log(
  `scanned ${files.length} client chunks, ${(totalBytes / 1024).toFixed(0)}KB uncompressed`,
);

if (hits.length === 0) {
  console.log("PASS — no catalogue or review data found in client chunks");
} else {
  console.log("FAIL — server-only data found in client chunks:");
  for (const hit of hits) console.log(`  ${hit.label} → ${hit.file}`);
  process.exitCode = 1;
}
