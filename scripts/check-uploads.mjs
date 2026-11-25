/**
 * Verifies uploaded images actually reach Supabase Storage and are served, safely.
 *
 * Uploads used to go to a local `data/uploads/` directory served by this app's own
 * route handler — that handler is gone. Every image now goes straight to the
 * Supabase Storage bucket named by `SUPABASE_STORAGE_BUCKET`, served from Supabase's
 * own CDN. This script checks that boundary instead: that a real image upload
 * succeeds, that its public URL actually serves the same bytes back, and that the
 * bucket refuses to serve something that was never uploaded.
 *
 * Usage: node scripts/check-uploads.mjs
 *
 * Reads SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_STORAGE_BUCKET from
 * .env.local/.env.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

for (const file of [".env.local", ".env"]) {
  const path = join(process.cwd(), file);
  if (!existsSync(path)) continue;

  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = trimmed.slice(eq + 1).trim();
  }
}

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET;

if (!url || !serviceRoleKey || !bucket) {
  console.error(
    "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_STORAGE_BUCKET must all be set.",
  );
  process.exit(1);
}

let failures = 0;

function check(label, condition, detail = "") {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`${ok ? "pass" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

/** A real 1x1 PNG. */
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);

const digest = createHash("sha256").update(png).digest("hex").slice(0, 16);
const name = `check-uploads/${digest}.png`;

const storageUrl = `${url}/storage/v1`;
const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
};

try {
  console.log("— uploading a real image to the bucket —");
  const upload = await fetch(`${storageUrl}/object/${bucket}/${name}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "image/png", "x-upsert": "true" },
    body: png,
  });
  check("upload accepted", upload.ok, `status ${upload.status}`);

  console.log("\n— the public URL serves the same bytes —");
  const publicUrl = `${storageUrl}/object/public/${bucket}/${name}`;
  const served = await fetch(publicUrl);
  check("200 OK", served.status === 200, `status ${served.status}`);
  check(
    "correct content type",
    (served.headers.get("content-type") ?? "").startsWith("image/png"),
    served.headers.get("content-type") ?? "none",
  );
  check("bytes match", Buffer.from(await served.arrayBuffer()).equals(png));

  console.log("\n— a name that was never uploaded is not served —");
  const missing = await fetch(`${storageUrl}/object/public/${bucket}/check-uploads/nonexistent.png`);
  check("404 for a missing object", missing.status === 404 || missing.status === 400, `status ${missing.status}`);

  console.log("\n— bucket rejects an SVG under the app's own upload path (defence in depth) —");
  /*
   * Supabase Storage itself does not sniff content — `saveImage()`
   * (src/server/uploads.ts) is what refuses SVG and forges bytes against the
   * declared type before anything reaches the bucket. This check exists to remind
   * whoever edits that function that the bucket will happily store whatever it is
   * told to, so the sniffing has to stay in application code — there is nothing
   * here to catch a regression there.
   */
  console.log("  (skipped: the bucket has no content sniffing of its own by design — see saveImage())");
} finally {
  console.log("\n— cleaning up —");
  await fetch(`${storageUrl}/object/${bucket}/${name}`, { method: "DELETE", headers });
}

console.log(
  `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`,
);
process.exitCode = failures === 0 ? 0 : 1;
