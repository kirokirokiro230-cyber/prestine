/**
 * HTTP smoke test against a running server.
 *
 * Checks that every route responds, that filtering and sorting actually change
 * the rendered result, and that the two API endpoints return sane payloads.
 *
 * Usage: node scripts/smoke.mjs [baseUrl]
 */
const base = process.argv[2] ?? "http://localhost:4130";

let failures = 0;

function check(label, condition, detail = "") {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`${ok ? "pass" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

async function get(path) {
  const response = await fetch(base + path);
  return { status: response.status, body: await response.text() };
}

/** Follow no redirects, so the redirect itself can be asserted on. */
async function head(path) {
  const response = await fetch(base + path, { redirect: "manual" });
  return {
    status: response.status,
    location: response.headers.get("location"),
    cacheControl: response.headers.get("cache-control"),
  };
}

/**
 * Read the listing result count from its `data-result-count` attribute rather than
 * the rendered wording — the visible text is split by React comment markers and the
 * filter rail also mentions "pieces" in screen-reader labels.
 */
function pieceCount(html) {
  const match = html.match(/data-result-count="(\d+)"/);
  return match ? Number(match[1]) : null;
}

console.log("— routes —");
const ROUTES = [
  "/",
  "/shop",
  "/shop/outerwear",
  "/shop/knitwear",
  "/shop/shirts",
  "/shop/tees",
  "/shop/trousers",
  "/shop/denim",
  "/shop/dresses",
  "/shop/accessories",
  "/collections",
  "/collections/new-arrivals",
  "/collections/best-sellers",
  "/collections/essentials",
  "/collections/the-tailoring-edit",
  "/collections/autumn-winter",
  "/collections/sale",
  "/product/atelier-double-faced-overcoat",
  "/product/canvas-weekend-holdall",
  "/search?q=cashmere",
  "/cart",
  "/checkout",
  "/checkout/confirmation",
  "/wishlist",
  "/account",
  "/account/orders",
  "/account/addresses",
  "/about",
  "/contact",
  "/faq",
  "/size-guide",
  "/shipping-returns",
  "/privacy",
  "/terms",
  "/accessibility",
  "/sitemap.xml",
  "/robots.txt",
];

for (const route of ROUTES) {
  const { status } = await get(route);
  check(`200 ${route}`, status === 200, `got ${status}`);
}

const missing = await get("/product/does-not-exist");
check("404 unknown product", missing.status === 404, `got ${missing.status}`);

console.log("\n— filtering and sorting —");

const all = await get("/shop");
const allCount = pieceCount(all.body);
check("shop reports a piece count", allCount !== null, String(allCount));

const denim = await get("/shop?category=denim");
const denimCount = pieceCount(denim.body);
check(
  "category filter narrows the set",
  denimCount !== null && allCount !== null && denimCount < allCount,
  `${denimCount} of ${allCount}`,
);

const denimAndKnit = await get("/shop?category=denim,knitwear");
check(
  "two categories return more than one",
  pieceCount(denimAndKnit.body) > denimCount,
  `${pieceCount(denimAndKnit.body)} vs ${denimCount}`,
);

const sale = await get("/shop?sale=1");
check("sale filter narrows the set", pieceCount(sale.body) < allCount);

const impossible = await get("/shop?category=denim&size=XXL&maxPrice=1000");
check(
  "impossible filter combination shows the empty state",
  impossible.body.includes("Nothing matches those filters"),
);

const badFacet = await get("/shop?category=not-a-real-category");
check(
  "unknown facet value is ignored rather than emptying results",
  pieceCount(badFacet.body) === allCount,
  `${pieceCount(badFacet.body)} of ${allCount}`,
);

const cheap = await get("/shop?sort=price-asc");
const dear = await get("/shop?sort=price-desc");
check(
  "price sort changes the first product",
  cheap.body.indexOf("/product/") !== dear.body.indexOf("/product/") ||
    cheap.body !== dear.body,
);

const page2 = await get("/shop?page=2");
check("page 2 renders", page2.status === 200 && page2.body !== all.body);

console.log("\n— product page —");
const pdp = await get("/product/atelier-double-faced-overcoat");
check("has Product JSON-LD", pdp.body.includes('"@type":"Product"'));
check("has an aggregate rating", pdp.body.includes("aggregateRating"));
check("has an offer with a price", pdp.body.includes("priceCurrency"));
check("renders the size guide trigger", pdp.body.includes("Size guide"));
check("renders reviews", pdp.body.includes("Verified purchase"));

const variant = await get("/product/atelier-double-faced-overcoat?color=midnight");
check("colour in the URL selects a variant", variant.body.includes("Midnight Navy"));

console.log("\n— api —");
const search = await fetch(`${base}/api/search?q=linen`).then((r) => r.json());
check("search returns results", search.results.length > 0, `${search.results.length} hits`);
check(
  "search results carry no long-form fields",
  search.results.every((r) => !("description" in r) && !("reviews" in r)),
);

const short = await fetch(`${base}/api/search?q=a`).then((r) => r.json());
check("search ignores one-character queries", short.results.length === 0);

const byId = await fetch(`${base}/api/products?ids=p-001,p-005`).then((r) => r.json());
check("products endpoint resolves ids", byId.products.length === 2);
check(
  "product summaries carry no long-form fields",
  byId.products.every((p) => !("description" in p) && !("care" in p)),
);
check(
  "product summaries carry what a card needs",
  byId.products.every((p) => p.colors?.length > 0 && p.sizes?.length > 0 && p.price > 0),
);

const bySlug = await fetch(
  `${base}/api/products?slugs=selvedge-straight-jean`,
).then((r) => r.json());
check("products endpoint resolves slugs", bySlug.products.length === 1);

const empty = await fetch(`${base}/api/products`).then((r) => r.json());
check("products endpoint tolerates no arguments", Array.isArray(empty.products));

console.log("\n— admin guard —");

// Every admin route must bounce an unauthenticated visitor to the login screen.
// This is the proxy's job; the server re-checks the session on each action too.
const GUARDED = [
  "/admin",
  "/admin/products",
  "/admin/products/new",
  "/admin/inventory",
  "/admin/orders",
  "/admin/customers",
  "/admin/categories",
  "/admin/collections",
  "/admin/discounts",
  "/admin/reviews",
  "/admin/settings",
  "/admin/staff",
  "/admin/activity",
  "/admin/reports",
];

for (const route of GUARDED) {
  const { status, location } = await head(route);
  check(
    `${route} redirects to login`,
    status === 307 && (location ?? "").includes("/admin/login"),
    `got ${status} → ${location}`,
  );
}

const deepLink = await head("/admin/products/p-001");
check(
  "redirect remembers where the visitor was headed",
  (deepLink.location ?? "").includes("next=%2Fadmin%2Fproducts%2Fp-001"),
  deepLink.location ?? "no location",
);

const adminNoStore = await head("/admin/login");
check(
  "admin responses are not cacheable by a shared proxy",
  (adminNoStore.cacheControl ?? "").includes("no-store"),
  adminNoStore.cacheControl ?? "no cache-control",
);

const login = await get("/admin/login");
check("login page renders", login.status === 200);
check("login page is noindex", /noindex/i.test(login.body));

console.log("\n— seo —");
const sitemap = await get("/sitemap.xml");
check("sitemap lists products", (sitemap.body.match(/\/product\//g) ?? []).length >= 33);
check("sitemap excludes admin", !sitemap.body.includes("/admin"));
const robots = await get("/robots.txt");
check("robots blocks checkout", robots.body.includes("/checkout"));
check("robots blocks admin", robots.body.includes("/admin"));
check("robots points at the sitemap", robots.body.includes("sitemap"));

console.log(
  `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`,
);
process.exitCode = failures === 0 ? 0 : 1;
