/**
 * Asserts the admin panel is structurally separate from the storefront.
 *
 * Two failure modes this guards against:
 *   1. Shop chrome leaking into admin pages, which is what the `(storefront)`
 *      route group exists to prevent. A regression here is easy to reintroduce by
 *      putting anything visual back in the root layout.
 *   2. Admin becoming reachable, indexable or cacheable.
 *
 * Usage: node scripts/check-admin-isolation.mjs [baseUrl]
 */
const base = process.argv[2] ?? "http://localhost:4133";

let failures = 0;

function check(label, condition, detail = "") {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`${ok ? "pass" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

async function fetchPage(path) {
  const response = await fetch(base + path, { redirect: "manual" });
  return {
    status: response.status,
    headers: response.headers,
    body: await response.text(),
  };
}

/** Markers that only ever appear in storefront chrome. */
const CHROME_MARKERS = [
  ["announcement bar", "Complimentary shipping on orders over"],
  // Keyed on the landmark, not a menu label, so renaming a nav item cannot
  // silently turn this assertion into a no-op.
  ["primary nav", 'aria-label="Main"'],
  ["footer legal column", "Terms of sale"],
  ["footer service row", "Repairs for life"],
  ["cart button", 'aria-label="Your bag"'],
  ["wishlist link", 'aria-label="Saved items"'],
  ["skip link", "Skip to content"],
];

console.log("— admin pages carry no storefront chrome —");

for (const path of ["/admin/login", "/admin/setup"]) {
  const page = await fetchPage(path);

  for (const [name, marker] of CHROME_MARKERS) {
    check(
      `${path} has no ${name}`,
      !page.body.includes(marker),
      page.body.includes(marker) ? "found it" : "",
    );
  }
}

console.log("\n— storefront still has its chrome —");

const home = await fetchPage("/");
for (const [name, marker] of CHROME_MARKERS) {
  check(`/ still has ${name}`, home.body.includes(marker));
}

console.log("\n— admin is not indexable or cacheable —");

const login = await fetchPage("/admin/login");
const robotsTag = login.headers.get("x-robots-tag") ?? "";
check("X-Robots-Tag says noindex", robotsTag.includes("noindex"), robotsTag || "absent");
check("X-Robots-Tag says nofollow", robotsTag.includes("nofollow"), robotsTag || "absent");
check(
  "Cache-Control is no-store",
  (login.headers.get("cache-control") ?? "").includes("no-store"),
  login.headers.get("cache-control") ?? "absent",
);

console.log("\n— clickjacking and sniffing defences —");

check(
  "frame-ancestors none",
  (login.headers.get("content-security-policy") ?? "").includes("frame-ancestors 'none'"),
  login.headers.get("content-security-policy") ?? "absent",
);
check(
  "X-Frame-Options DENY",
  login.headers.get("x-frame-options") === "DENY",
  login.headers.get("x-frame-options") ?? "absent",
);
check(
  "nosniff",
  login.headers.get("x-content-type-options") === "nosniff",
  login.headers.get("x-content-type-options") ?? "absent",
);
check("server fingerprint suppressed", !login.headers.get("x-powered-by"));

console.log("\n— guarded routes stay guarded —");

for (const path of ["/admin", "/admin/products", "/admin/settings", "/admin/staff"]) {
  const page = await fetchPage(path);
  check(
    `${path} redirects to login`,
    page.status === 307 && (page.headers.get("location") ?? "").includes("/admin/login"),
    `${page.status} → ${page.headers.get("location")}`,
  );
}

const unknownAdmin = await fetchPage("/admin/definitely-not-a-page");
check(
  "unknown admin path does not 200",
  unknownAdmin.status !== 200,
  `got ${unknownAdmin.status}`,
);

console.log(
  `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`,
);
process.exitCode = failures === 0 ? 0 : 1;
