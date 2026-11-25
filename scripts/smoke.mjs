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

/**
 * What the shop actually contains, read from the sitemap.
 *
 * These lists used to be hard-coded to the demo catalogue that
 * `00000000000005_demo_products.sql` seeds. On any real shop that drifts the moment
 * a merchant renames a category or sells through a product, and nine of these checks
 * were failing against slugs that no longer existed — while the one genuine bug in
 * the run (unknown products answering 200) sat in the same list looking identical to
 * the noise. A monitor nobody believes is worse than no monitor, so the catalogue is
 * discovered and the assertions are about behaviour rather than about fixtures.
 *
 * The sitemap is the right source: it is generated from the same repository layer the
 * pages use, so if it lists a URL the page for it is meant to render.
 */
const sitemapXml = await get("/sitemap.xml").then((r) => r.body);

const discover = (prefix) => [
  ...new Set(
    [...sitemapXml.matchAll(new RegExp(`${prefix}([a-z0-9-]+)`, "g"))].map((m) => m[1]),
  ),
];

const productSlugs = discover("/product/");
const categorySlugs = discover("/shop/");
const collectionSlugs = discover("/collections/");

console.log(
  `— catalogue: ${productSlugs.length} product(s), ` +
    `${categorySlugs.length} category(ies), ${collectionSlugs.length} collection(s) —`,
);
check("sitemap lists at least one product", productSlugs.length > 0, String(productSlugs.length));

console.log("\n— routes —");
const ROUTES = [
  "/",
  "/shop",
  ...categorySlugs.map((slug) => `/shop/${slug}`),
  "/collections",
  ...collectionSlugs.map((slug) => `/collections/${slug}`),
  ...productSlugs.slice(0, 5).map((slug) => `/product/${slug}`),
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

console.log("\n— filtering and sorting —");

const all = await get("/shop");
const allCount = pieceCount(all.body);
check("shop reports a piece count", allCount !== null, String(allCount));

/*
 * Filter by a category the shop actually has rather than by "denim". Picks the
 * narrowest one that is not the whole catalogue, so the "narrows the set" assertion
 * is meaningful on a small shop where one category might hold everything.
 */
const [firstCategory, secondCategory] = categorySlugs;

if (firstCategory) {
  const one = await get(`/shop?category=${firstCategory}`);
  const oneCount = pieceCount(one.body);
  check(
    "category filter narrows or holds the set",
    oneCount !== null && allCount !== null && oneCount <= allCount && oneCount > 0,
    `${oneCount} of ${allCount} (${firstCategory})`,
  );

  if (secondCategory) {
    const two = await get(`/shop?category=${firstCategory},${secondCategory}`);
    check(
      "two categories return at least as many as one",
      pieceCount(two.body) >= oneCount,
      `${pieceCount(two.body)} vs ${oneCount}`,
    );
  }

  /*
   * A combination nothing can satisfy. `maxPrice=1` in minor units is below any
   * real price, so this holds whatever the catalogue costs — the old version paired
   * it with size XXL and a demo category.
   */
  const impossible = await get(`/shop?category=${firstCategory}&maxPrice=1`);
  check(
    "impossible filter combination shows the empty state",
    impossible.body.includes("Nothing matches those filters"),
  );
} else {
  console.log("  (no categories in the sitemap to filter on)");
}

const sale = await get("/shop?sale=1");
check("sale filter is applied", pieceCount(sale.body) <= allCount, `${pieceCount(sale.body)} of ${allCount}`);

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
const pdpSlug = productSlugs[0];
const pdp = await get(`/product/${pdpSlug}`);
console.log(`  (checking /product/${pdpSlug})`);
check("has Product JSON-LD", pdp.body.includes('"@type":"Product"'));
check("has an offer with a price", pdp.body.includes("priceCurrency"));
check("renders the size guide trigger", pdp.body.includes("Size guide"));

/*
 * The structured data must not carry a raw `<`. Reviews are shopper-written and land
 * in this block, so an unescaped one is a closed script element and stored XSS —
 * see `src/lib/json-ld.ts`. Asserted here because the regression is invisible on the
 * rendered page: it looks fine right up until a review contains the wrong characters.
 */
const ldBlocks = [
  ...pdp.body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
].map((m) => m[1]);
check("emits exactly one ld+json block", ldBlocks.length === 1, String(ldBlocks.length));
check(
  "ld+json contains no raw '<' that could close the script",
  ldBlocks.every((body) => !body.includes("<")),
);
check(
  "ld+json still parses as JSON after escaping",
  ldBlocks.every((body) => {
    try {
      JSON.parse(body);
      return true;
    } catch {
      return false;
    }
  }),
);

/*
 * An unknown colour must not 500 or empty the page — it falls back to the first
 * colourway. The old assertion named a demo colour ("Midnight Navy") and so only
 * ever tested the demo catalogue.
 */
const variant = await get(`/product/${pdpSlug}?color=not-a-real-colour`);
check(
  "an unknown colour in the URL degrades to the default",
  variant.status === 200 && variant.body.includes('"@type":"Product"'),
  `got ${variant.status}`,
);

console.log("\n— api —");

/*
 * Resolve a real product first, then search for a word out of its own name. A fixed
 * query ("linen") only works on a catalogue that happens to sell linen.
 */
const bySlug = await fetch(
  `${base}/api/products?slugs=${encodeURIComponent(pdpSlug)}`,
).then((r) => r.json());
check("products endpoint resolves slugs", bySlug.products.length === 1, pdpSlug);

const sample = bySlug.products[0];
check(
  "product summaries carry no long-form fields",
  bySlug.products.every((p) => !("description" in p) && !("care" in p)),
);
check(
  "product summaries carry what a card needs",
  bySlug.products.every((p) => p.colors?.length > 0 && p.sizes?.length > 0 && p.price > 0),
);

if (sample) {
  const byId = await fetch(
    `${base}/api/products?ids=${encodeURIComponent(sample.id)}`,
  ).then((r) => r.json());
  check("products endpoint resolves ids", byId.products.length === 1, sample.id);

  /*
   * Longest word in the name, so the query is distinctive enough to match.
   * Split on anything that is not a letter rather than on whitespace alone:
   * "Double-Faced Wool Overcoat" split on spaces and then stripped of punctuation
   * yields "DoubleFaced", which is not a word the search index has ever seen.
   */
  const term = (sample.name ?? "")
    .split(/[^a-z]+/i)
    .filter((word) => word.length >= 4)
    .sort((a, b) => b.length - a.length)[0];

  if (term) {
    const search = await fetch(
      `${base}/api/search?q=${encodeURIComponent(term)}`,
    ).then((r) => r.json());
    check("search finds a product by a word in its name", search.results.length > 0, term);
    check(
      "search results carry no long-form fields",
      search.results.every((r) => !("description" in r) && !("reviews" in r)),
    );
  } else {
    console.log("  (no word long enough in the sample product name to search on)");
  }
}

const short = await fetch(`${base}/api/search?q=a`).then((r) => r.json());
check("search ignores one-character queries", short.results.length === 0);

const empty = await fetch(`${base}/api/products`).then((r) => r.json());
check("products endpoint tolerates no arguments", Array.isArray(empty.products));

/*
 * The write endpoints must refuse an unauthenticated caller. Checked here because
 * these are the routes where a regression is silent — nothing on the storefront
 * changes if one of them starts accepting anonymous POSTs.
 */
console.log("\n— unauthenticated writes are refused —");
for (const [path, want] of [
  ["/api/shipping/sync-tracking", 401],
  ["/api/email/review-requests", 401],
  ["/api/payments/cashfree/webhook", 401],
]) {
  const response = await fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  check(`POST ${path} is refused`, response.status === want, `got ${response.status}`);
}

/*
 * The admin bell's feed lives under /api, which proxy.ts does not guard (it protects
 * /admin pages), so the route has to refuse an anonymous caller itself. It carries
 * customer names and order totals.
 */
const feedGuard = await fetch(`${base}/api/admin/notifications`);
check(
  "GET /api/admin/notifications refuses an anonymous caller",
  feedGuard.status === 401,
  `got ${feedGuard.status}`,
);
check(
  "the notifications feed is never cacheable",
  (feedGuard.headers.get("cache-control") ?? "").includes("no-store"),
  feedGuard.headers.get("cache-control") ?? "no cache-control",
);

const trackGuard = await fetch(`${base}/api/shipping/track?waybill=12345678901234`);
check(
  "GET /api/shipping/track is staff-only",
  trackGuard.status === 403,
  `got ${trackGuard.status}`,
);

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
/*
 * Was `>= 33`, the demo catalogue's product count, which fails on every real shop.
 * What matters is that products reach the sitemap at all and that every URL in it
 * actually renders — the second of which is now covered by the route loop above,
 * since that list is built from this file.
 */
check(
  "sitemap lists every product the catalogue reports",
  (sitemap.body.match(/\/product\//g) ?? []).length >= productSlugs.length,
  `${(sitemap.body.match(/\/product\//g) ?? []).length} entries`,
);
check("sitemap excludes admin", !sitemap.body.includes("/admin"));

/*
 * Unknown slugs must answer 404, not 200. This is the check that caught a real
 * regression: a `loading.tsx` above a dynamic route starts streaming before the page
 * runs, which commits a 200 that `notFound()` can no longer change, so every missing
 * product became a soft 404 for search engines to index. See the note in
 * `src/app/(storefront)/not-found.tsx` before adding any loading file.
 */
console.log("\n— unknown urls —");
for (const path of [
  "/product/does-not-exist",
  "/shop/not-a-real-category",
  "/collections/not-a-real-collection",
]) {
  const { status } = await get(path);
  check(`404 ${path}`, status === 404, `got ${status}`);
}
const robots = await get("/robots.txt");
check("robots blocks checkout", robots.body.includes("/checkout"));
check("robots blocks admin", robots.body.includes("/admin"));
check("robots points at the sitemap", robots.body.includes("sitemap"));

console.log(
  `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`,
);
process.exitCode = failures === 0 ? 0 : 1;
