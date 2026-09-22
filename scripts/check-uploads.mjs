/**
 * Verifies uploaded images are actually served, safely.
 *
 * Uploads are not in `public/` — they are merchant content, and `public/` is build
 * input — so a route handler serves them. That route is the part no unit test covers,
 * and the failures are the kind you only find in production: images 404 in the running
 * server, or worse, the route hands out files outside its directory.
 *
 * Writes a real PNG into the uploads directory under the content-hash name the server
 * would give it, then asks the running server for it.
 *
 * Usage: node scripts/check-uploads.mjs [baseUrl]
 */
import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const base = process.argv[2] ?? "http://localhost:4136";
const dir = process.env.PRESTINE_UPLOAD_DIR ?? path.join(process.cwd(), "data", "uploads");

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
const name = `${digest}.png`;

await mkdir(dir, { recursive: true });
await writeFile(path.join(dir, name), png);

// A file the route must never serve, sitting right next to the ones it should.
const decoy = path.join(dir, "secret.txt");
await writeFile(decoy, "should never be served");

try {
  console.log("— a stored image is served —");
  const image = await fetch(`${base}/uploads/${name}`);
  check("200 OK", image.status === 200, `status ${image.status}`);
  check("correct content type", image.headers.get("content-type") === "image/png");
  check(
    "cached permanently",
    /immutable/.test(image.headers.get("cache-control") ?? ""),
    image.headers.get("cache-control") ?? "none",
  );
  // The name is a content hash, so a URL can never point at different bytes — which is
  // what makes permanent caching safe rather than reckless.
  check("sniffing disabled", image.headers.get("x-content-type-options") === "nosniff");
  check("bytes match", Buffer.from(await image.arrayBuffer()).equals(png));

  console.log("\n— nothing else is —");
  // Every one of these is a real attempt someone will make.
  const refused = [
    ["a name that is not a content hash", "secret.txt"],
    ["an SVG extension", `${digest}.svg`],
    ["upper-case hex", `${digest.toUpperCase()}.png`],
    ["a double extension", `${name}.exe`],
    ["a query string smuggled into the name", `${name}%3Fx=1`],
    ["encoded traversal", "..%2Fstore.json"],
    ["double-encoded traversal", "..%252Fstore.json"],
    ["an absolute path", "%2Fetc%2Fpasswd"],
    ["a missing file", "00112233445566aa.png"],
  ];

  for (const [label, segment] of refused) {
    const response = await fetch(`${base}/uploads/${segment}`);
    check(`refuses ${label}`, response.status === 404, `status ${response.status}`);
  }

  /*
   * A literal `..` is handled separately, because it never reaches the route: URL parsing
   * resolves it away before the request is sent, so `/uploads/..` is a request for `/`
   * and answers with the home page. Asserting a 404 there would be asserting a fiction.
   * What matters is that it cannot yield a file, so that is what is checked.
   */
  console.log("\n— a literal `..` resolves away rather than serving anything —");
  const dotdot = await fetch(`${base}/uploads/..`);
  check(
    "not served as an image",
    !(dotdot.headers.get("content-type") ?? "").startsWith("image/"),
    dotdot.headers.get("content-type") ?? "none",
  );

  console.log("\n— the store itself is unreachable through the route —");
  for (const attempt of ["../store.json", "..%2F..%2Fdata%2Fstore.json"]) {
    const response = await fetch(`${base}/uploads/${attempt}`);
    const body = await response.text();
    check(
      `no store contents via ${attempt}`,
      !body.includes("\"products\"") && !body.includes("passwordHash"),
      `status ${response.status}`,
    );
  }
} finally {
  await rm(path.join(dir, name), { force: true });
  await rm(decoy, { force: true });
}

console.log(
  `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`,
);
process.exitCode = failures === 0 ? 0 : 1;
