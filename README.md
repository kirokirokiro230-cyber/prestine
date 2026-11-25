# PRESTINE

A production-shaped e-commerce storefront and admin panel for a premium clothing
brand. Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4. No UI kit, no
state library, no charting library, no component dependencies beyond an icon set.

```bash
npm install
npm run dev                     # http://localhost:3000
# then open http://localhost:3000/admin/setup to create the owner account
```

The storefront reads from the same store the admin panel writes to, so a product
added in the panel appears on the shop on the next request. That is the point: an
admin panel writing to data the storefront ignores is decoration.

---

## What's built

**Browse**

- Home page: hero, category tiles, new arrivals, best-seller rail, two editorial
  bands, testimonials, archive sale
- Listing pages for all clothing, each of 8 categories, and 6 collections
- Faceted filtering — department, category, size, colour, price band, on-sale,
  lower-impact — with removable chips and live result counts
- Sorting (6 orders), windowed pagination, all of it in the URL and server-rendered
- Typeahead search overlay plus a full search results page with relevance ranking

**Product**

- Gallery with thumbnail rail, keyboard paging, mobile paging and a zoom dialog
- Colour and size selection; every size is always purchasable, because there is no
  inventory and fulfilment is manual
- Size guide dialog with measurement tables and fitting advice
- Description / details / care / shipping tabs
- Reviews: rating histogram that filters the list, a fit meter, sorting, paging
- "Pairs well with" cross-sell and a recently-viewed rail
- `Product` JSON-LD for rich results

**Buy**

- Cart drawer and full cart page, with a per-line quantity ceiling
- Promotion codes with minimum-spend rules, free-shipping progress meter
- Single-step checkout — contact and delivery, validated on submit — handing off to
  Cashfree's hosted checkout (card, UPI, netbanking) for payment
- Order confirmation that reconciles a pending payment live, order history with
  tracking, address book with add/edit/delete
- Saved items: drawer plus a full page with inline size selection and add-to-bag

**Administer** — `/admin`

- Dashboard: revenue, orders, AOV and units with period-over-period deltas, a daily
  revenue chart, top products and order status counts
- Banners: the sliding home-page hero — reorder, publish, and schedule a slide to
  appear and expire on set dates, so a sale banner can be queued weeks ahead
- Products: filterable table, bulk publish/archive/delete, duplicate, and a full
  editor covering pricing, cost, weight, repeatable colourways, the size run,
  collections, SEO overrides and publication state
- Orders: filter by status, date and free text; fulfil with carrier and tracking;
  forward-only status transitions; internal notes
- Customers derived from order history, with lifetime value and order counts
- Categories and collections: create, rename, reorder, hide; renaming a slug
  rewrites every product that referenced it
- Discounts: percentage or fixed, minimum spend, with usage figures per code
- Reviews: hide or restore, which moves the rating shown on the product page
- Settings: store identity, currency, locale, tax rate, shipping rates and methods,
  free-shipping threshold, announcements, maintenance mode
- Staff: three roles with server-checked permissions, last-owner protection
- Activity: an audit trail of who changed what, including failed sign-ins
- Reports: revenue by category, margin, and the numbers behind the dashboard

**Everything else**

- Light and dark themes with no flash on load, following the OS by default
- About Us, Contact, FAQ, Size Guide, Shipping & Returns, Privacy, Terms,
  Accessibility, 404, error boundary, maintenance page
- `sitemap.xml`, `robots.txt`, per-page metadata and Open Graph, all driven by
  settings rather than constants

---

## The admin panel

### First run

```bash
npm run dev
```

Open `/admin/setup`. It creates the first **owner** account and then refuses to run
again — once an admin exists the route redirects to `/admin/login`. Passwords are
hashed with scrypt and a per-user salt; the plaintext is never stored or logged.

Set a session secret before deploying:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
# put it in .env.local as ADMIN_SESSION_SECRET
```

Sessions are stateless HMAC-signed tokens in an httpOnly cookie, valid for twelve
hours. Changing the secret signs everyone out — which is also how you revoke access
if a laptop goes missing. The app refuses to start in production without one.

### Transactional email with Resend

All outbound email has one server-only path: `src/server/email/transport.ts` posts both
HTML and plain-text bodies to Resend, while `src/server/email/dispatch.ts` renders and
logs the outcome to the `email_log` table in Supabase Postgres. It covers:

- order confirmation;
- shipped/out-for-delivery, delivered and cancelled status messages;
- delayed review requests (manual from Admin → Email or scheduled endpoint);
- one-off client-care messages written by staff; and
- the public contact form, delivered to the email in Admin → Settings with the shopper
  as `Reply-To`.

Create a Resend account, add your sending domain under **Domains**, publish the DNS
records Resend gives you, and wait until the domain is verified. Then configure:

```env
RESEND_API_KEY=re_xxxxxxxxx
EMAIL_FROM=Prestine <orders@your-domain.com>
EMAIL_REPLY_TO=hello@your-domain.com
EMAIL_CRON_SECRET=<a-long-random-secret>
```

`RESEND_API_KEY` is server-only — never use a `NEXT_PUBLIC_` prefix. `EMAIL_FROM` must
use the verified domain. Set Admin → Settings → Email to the monitored inbox that should
receive contact-form enquiries. Restart the dev server after editing `.env.local`, and
add the same values in the deployment provider's environment settings.

Without Resend configuration, lifecycle emails are still rendered and recorded as
`logged` at Admin → Email, but they are not delivered. The public contact form reports
an error instead of pretending an undelivered enquiry was received. Lifecycle sends use
provider idempotency keys, so retrying the same invocation does not duplicate mail.

Review requests need a daily scheduler in addition to Resend:

```bash
curl -X POST https://your-domain.com/api/email/review-requests \
  -H "Authorization: Bearer $EMAIL_CRON_SECRET"
```

### Separated from the storefront

`/admin` shares nothing visual with the shop — no announcement bar, no header, no
footer, no cart drawer. That separation is structural, not styling: storefront routes
live in an `app/(storefront)/` route group whose layout owns all the chrome, while the
root layout carries only `<html>`, fonts and the two providers both halves need. The
group name is stripped from URLs, so `/shop` is still `/shop`.

The shop's providers — cart, wishlist, recently viewed, search — mount in the
storefront layout too. Admin screens therefore never download that JavaScript or pay
for the settings read behind it.

`npm run check:admin` asserts this holds: it fails if any chrome marker appears on an
admin page, or disappears from the storefront.

### Locking it down

Four overlapping layers, in the order a request meets them:

| Layer | Where | Does |
|---|---|---|
| IP allowlist | `proxy.ts` | Optional. Non-listed addresses get a **404** on all of `/admin`, including the login form |
| Session presence | `proxy.ts` | Redirects to login before any admin page renders |
| `requireAdmin` | every page | Verifies the token signature and re-reads the account, so a disabled user fails closed |
| `requirePermission` | every mutation | Checks the role |

The last two are the actual security boundary — a cookie is trivially forged, so the
proxy is a convenience, not a guarantee. The first two exist so an attacker never gets
far enough to probe the rest.

Set `ADMIN_IP_ALLOWLIST` to switch on the network lock. It returns 404 rather than 403
deliberately: a 403 confirms there is an admin panel at that path worth attacking. It
trusts `x-forwarded-for`, which Vercel sets reliably — if you self-host behind nginx or
Caddy, configure the proxy to set it or the check is decoration.

Also in place: `sameSite: "strict"` on the session cookie, which shuts down cross-site
request forgery outright; `httpOnly`, so an XSS bug cannot read the session; HSTS,
`frame-ancestors 'none'` and `X-Frame-Options: DENY` against clickjacking;
`X-Robots-Tag: noindex` in the response headers as well as the metadata; and
`no-store` so a signed-out session cannot be recovered with the back button.

Still missing, and worth knowing: login throttling is in-process only (5 attempts per
15 minutes), which is weak on serverless where each instance keeps its own counter. A
distributed limiter needs Redis or Upstash.

### Roles

| Role | Can |
|---|---|
| Owner | Everything, including settings and staff |
| Manager | Products, orders, discounts. Not settings or staff |
| Staff | Orders and fulfilment only. Cannot change products or prices |

Permissions are checked on the server inside every action (`requirePermission`), not
just used to hide sidebar links. The route guard in `src/proxy.ts` only checks that
a session cookie is *present* — it runs before any page renders so an unauthenticated
visitor is bounced immediately, but it is a convenience, not the boundary.

### Hosting: read this before deploying

Everything — products, taxonomy, banners, settings, customers, OTP records, orders
and lines, reviews, audit entries, email templates/logs — lives in Supabase Postgres.
Uploaded images live in a Supabase Storage bucket, served from its CDN. There is no
disk state and no writable-filesystem requirement, so the app runs the same way on a
VPS, a container, or a fully serverless host like Vercel or Netlify.

Before first run, apply the SQL in `supabase/migrations/` to your Supabase project
(see `supabase/README.md` for the exact steps — this repo never runs migrations for
you) and create a public Storage bucket matching `SUPABASE_STORAGE_BUCKET`. Then set:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_STORAGE_BUCKET=...
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only and bypasses row-level security — never
prefix it `NEXT_PUBLIC_` and never ship it to the browser. The service role is what
every repository and `storage.ts` use; nothing in the app currently authenticates to
Supabase as an end user.

| Concern | Where it lives |
| --- | --- |
| Products, orders, customers, everything else | Supabase Postgres, via `src/server/repositories/` |
| Images | Supabase Storage, served from its CDN |
| Login rate limit | in-process counter (deliberately not a database table — see below) |
| Maintenance flag | 10-second TTL cache over the `settings` row |

Login throttling stays in-process rather than in Postgres on purpose: it is a soft
speed bump documented as such, not a security boundary, and a database write per
failed keystroke on the login form is worse than the alternative of eventually
reaching for Redis/Upstash if real distributed limiting is ever needed.

---

## Architecture

### One database, two front doors

```
                          ┌─ lib/catalog.ts ──────→ storefront pages  (active products only)
Supabase Postgres  ──────→│
  (src/server/supabase.ts)└─ server/repositories/ → admin pages + server actions
                                                     (everything, including drafts)
```

`lib/catalog.ts` is the storefront's read layer and every function in it is async.
It returns `active` products exclusively — drafts and archived items are invisible
there by construction, not by a filter each caller has to remember.

Every table lives behind `src/server/supabase.ts`, the single module that imports
`@supabase/supabase-js`. No page or component talks to Supabase directly.

### Data narrows at the client boundary

```
Product  →  server components  →  ProductSummary  →  client components
(full)       (pages, grids)        (projection)       (cards, panels)
```

`Product` carries everything: description, construction notes, care, origin. That
record never reaches the browser. Server components narrow it to `ProductSummary`
(`lib/product-utils.ts`) before handing it to any `"use client"` component, because
every prop of a client component is serialised into the page.

This is measurable, and it is enforced:

```bash
npm run check:bundle    # fails if catalogue or review text is found in client JS
npm run measure         # per-route HTML, RSC payload and SVG counts
```

Two consequences worth knowing about:

- **Review prose is separate from products.** `data/review-stats.ts` produces the
  numeric shape of a review set (that is what the catalogue imports, to compute
  star averages); `data/reviews.ts` attaches the text and is imported only by the
  product page. Both read the same seeded sequence, so a card's rating can never
  contradict the reviews on the page. Before this split, listing pages shipped 67
  full review bodies each.
- **Browser-held state resolves over an API.** Saved items and recently-viewed
  store only ids, so they fetch summaries from `/api/products` rather than
  importing the catalogue. Prices are therefore always current, not frozen at the
  moment something was saved.

### Settings reach the client through one provider

Currency, locale, tax rate, shipping rates and promotion codes are settings, but a
client component cannot read the store. The root layout resolves them per request
and passes them to `StoreProvider`, which is what `Price`, the filter rail, the
active-filter chips, the bag and checkout all format money through.

Change the currency in Settings and every price on the site changes — product cards
included. Nothing formats money from a compile-time constant any more, which is the
only way "editable in admin" stays true rather than half-true.

### Checkout is the trust boundary

The browser sends what the shopper wants — product id, colourway, size, quantity —
and nothing about what it costs. `placeOrder` (`app/actions/checkout.ts`) looks up
the prices, recomputes discount, shipping and tax from live settings, opens a
Cashfree payment session against that recomputed total, and writes the order as
`pending`. Whatever the client believed about the total is ignored — it is also the
figure Cashfree is told to collect, so a tampered request cannot buy a coat for a
rupee either on this app's own record or on the amount actually charged.

There is no inventory, so nothing is reserved: every size is always purchasable and the
same piece can be ordered any number of times, because fulfilment is manual. A test
fires five concurrent orders for one piece and asserts all five succeed — inverted from
what it used to check, and commented so that reintroducing inventory fails loudly here
rather than quietly overselling.

The maths itself is not duplicated. `orderSummary` takes an optional `PricingRules`
argument: the cart omits it and gets the seeded values from `config.ts`, which keeps
the drawer instant with no round trip; the server passes rules read from the store.
One implementation, so the quote and the charge cannot drift apart.

### Payment: Cashfree

`placeOrder` records the order and opens a Cashfree order/payment session in the same
call, but never takes money itself — the shopper is redirected to Cashfree's own
hosted checkout (card, UPI, netbanking) immediately after, and the order sits
`paymentStatus: "pending"` until that resolves. Card details never reach this
codebase, so there is no PCI SAQ-D scope to carry.

```env
CASHFREE_ENVIRONMENT=sandbox            # "production" once you are live
CASHFREE_APP_ID=
CASHFREE_SECRET_KEY=
CASHFREE_WEBHOOK_SECRET=
```

Get the App ID and Secret Key from the Cashfree Merchant Dashboard → Developers →
API Keys, and point a webhook at `/api/payments/cashfree/webhook` under Developers →
Webhooks, subscribed to Payment Success, Payment Failed, Payment User Dropped and
**Refund Status** (so a refund that fails days later is noticed; without it, the admin
page's "Check status" button still works).
`CASHFREE_WEBHOOK_SECRET` is the same Secret Key by default — see the comment in
`.env.example` for why it is its own variable.

The webhook (`src/app/api/payments/cashfree/webhook/route.ts`) is what actually marks
an order `paid` — verified against Cashfree's HMAC signature over the raw request body,
then reconciled by fetching the order straight from Cashfree's API rather than trusting
fields embedded in the webhook payload. The confirmation page also reconciles on its
own if the shopper lands back before the webhook does, so a slow or dropped delivery
never leaves someone staring at a stuck page. Only once an order is `paid` does the
confirmation email go out and the cart get cleared.

Without Cashfree configured, `placeOrder` refuses every request outright with "Payment
is not available right now" rather than recording an order that could never be paid
for — there is no degraded "log it locally" mode here the way there is for email or SMS,
because there is no honest way to log a payment.

### Guests hold a claim ticket, not their orders

Orders live on the server, so order history and the confirmation page fetch them
rather than rendering a local copy. Status and tracking shown to a customer are
therefore the same records the fulfilment team edits in admin: mark an order shipped
in the panel and it reads "In transit" on the customer's next visit.

Since there is no customer login, the browser keeps a reference plus the email the
order was placed with, and `lookupOrders` returns an order only when **both** match.
That matters because references are short and enumerable; an email pairing is not.
Admin-only fields (internal notes) are stripped before the record leaves the server.
When real accounts arrive, swap the claim tickets for a session customer id and
delete the email check — nothing above that function changes shape.

### The hero carousel treats reduced motion as a hard rule

Slides are merchant-managed and advance automatically — except they never do for
anyone who has asked their device to reduce motion. Not slower, not shorter: off.
Content that moves on its own is precisely what that setting is asking us not to do.

The rest follows from the same position. There is a real pause button, because a
keyboard or screen reader user cannot hover to stop it. Auto-advance halts on hover
*and* on focus inside, so it cannot pull content away mid-tab. Off-screen slides are
`inert`, so a three-slide carousel does not put six invisible links in the tab order —
`npm run check:banners` asserts exactly two of three slides are inert, because that is
the kind of thing that regresses without anyone noticing.

A slide with no image URL draws a gradient from its accent colour rather than a broken
image, which is the same rule the product artwork follows: the page should look
deliberate before the photography exists.

### The header has one dropdown, and every link appears once

Five top-level items — New In, Shop, Collections, Sale, About Us — and a dropdown on
Shop alone.

An earlier version had three mega menus which between them listed every category twice
and every collection twice, under two headings both reading "Categories" and two more
reading "More" and "More edits". Roughly one header link per product in a thirty-three
piece range. The cause was a helper that split lists in half to fill a hardcoded
four-column grid, so the layout was dictating the information architecture instead of
the reverse.

Now: a dropdown exists only where a shopper arrives wanting to choose between several
destinations. New In goes straight to the collection. Collections goes to
`/collections`, a visual index with imagery and piece counts, which does that job
better than a text list repeating what the page already shows. The mega menu derives
its grid tracks from how many panels it was given, so nothing needs halving.

`npm run audit:nav` prints the live navigation and fails loudly on a repeated heading
or a link that appears twice — the class of problem that is invisible while reading the
builder and obvious once counted.

### Filter state lives in the URL

`lib/search-params.ts` is the only place a query string is read or written. Every
filtered view is shareable, bookmarkable, back-button correct and server-rendered.
Changing any filter resets pagination; the default sort and page 1 are omitted so
URLs stay clean.

### Persistence goes through observable stores

`lib/browser-store.ts` wraps `localStorage` in small stores consumed with
`useSyncExternalStore`. This is deliberate rather than `useState` + an effect:

- the value is read during render, so no cascading re-render on mount
- `getServerSnapshot` returns the fallback, so hydration markup matches
- every consumer of a key stays in step, including across browser tabs

Stores are declared in `lib/stores.ts` with versioned keys, so a schema change can
ship without corrupting anyone's bag.

### Money is integers

All prices are integer minor units (cents). Formatting happens once, in
`lib/format.ts`. Discount and tax are each rounded a single time, at the point they
are calculated, so the lines shown in a summary always reconcile to the total — a
test asserts exactly that.

### Design tokens are three-layered

`app/globals.css` defines primitives (`--color-clay-600`), maps them to semantic
tokens (`--sem-accent`), and exposes those to Tailwind via `@theme inline`. Only
the semantic layer changes between light and dark, so components never branch on
theme.

---

## Product imagery

The catalogue ships with generated SVG art direction rather than stock photos, so
the storefront never renders a broken image and needs no network at build time.
It is deterministic: the same variant always produces the same artwork.

**To use real photography**, put URLs on the colourway:

```ts
colors: [
  {
    id: "camel",
    name: "Camel",
    hex: "#B08D63",
    images: [
      "https://cdn.example.com/coat-camel-front.jpg",   // front
      "https://cdn.example.com/coat-camel-detail.jpg",  // detail
      "https://cdn.example.com/coat-camel-back.jpg",    // back
      "https://cdn.example.com/coat-camel-model.jpg",   // on figure
    ],
  },
]
```

`ProductImage` switches to `next/image` automatically. Add the CDN host to
`images.remotePatterns` in `next.config.ts`. No component changes needed.

---

## Accessibility

Built in, not retrofitted:

- Skip link first in the tab order on every page
- Dialogs and drawers trap focus, close on Escape, and restore focus on close
- Focus indicators are never removed; `:focus-visible` is styled globally
- Body text ≥ 4.5:1 and secondary text ≥ 3:1 in **both** themes, checked separately
- Colour is never the only signal — sale badges carry text, selected sizes and swatches
  are outlined as well as filled, errors carry an icon and text
- Bag and saved-item changes announce through polite live regions
- Every animation respects `prefers-reduced-motion`
- Touch targets ≥ 44px, including icon-only controls
- Native `<select>` for sorting, real `<table>` markup for size guides

Full conformance can't be verified by tooling alone — it needs manual testing with
assistive technology and specialist review. `/accessibility` states the position
honestly, including known gaps.

---

## Testing

```bash
npm test          # unit tests — no network, no database, runs everywhere
npm run check     # typecheck → lint → test → build → bundle guard
npm start         # then, in another shell:
npm run smoke        # HTTP checks against the running server
npm run check:admin  # checks that admin stays separate and locked down
```

Two kinds of test live side by side under `src/**/__tests__/`, and `npm test` runs
both — the split is in what each one needs, not in how you invoke them.

**Unit tests** are pure logic: no network, no environment variable, no database.
These run in CI and on every machine with no setup.

| Suite | What it protects |
|---|---|
| `login-throttle.test.ts` | The sliding window locks on the fifth failure and frees itself as failures age out; the decisive attempt is the fifth-newest, so an expiring outlier cannot report an unlock that has not happened; retries during a lockout keep it alive |
| `login-attempts.test.ts` | Attempts accumulate per key, so one attacker cannot lock out another admin by guessing their address; a success clears the history; keys are case-insensitive |
| `ttl-cache.test.ts` | Concurrent callers share one load rather than stampeding a cold instance; a failed load is not cached; a late failure cannot evict the value that replaced it |
| `auth.test.ts` | Passwords are unrecoverable and per-user salted; tampered payloads and signatures rejected; expired sessions refused; role permissions hold |
| `cart-math.test.ts` | Totals reconcile; promo minimums; discounts never exceed subtotal; all money stays integral |
| `validation.test.ts` | Luhn checks, expiry in the past, input masks, brand detection |
| `search-params.test.ts` | Unknown values dropped rather than emptying results; pagination resets on filter change; round-trip through parse and build |
| `email.test.ts` | HTML-escaping in rendered order emails; token substitution never drops a block silently |
| `banners.test.ts` (lib) | Slide state and carousel transition logic |

**Integration tests** exercise the repository layer against a real Postgres
database and, for uploads, a real Supabase Storage bucket — the things a mock
query builder cannot faithfully stand in for: unique constraints, cascading
deletes, and the transaction semantics inside the `security definer` RPCs in
`supabase/migrations/00000000000003_functions.sql`. Each one calls
`checkSupabaseDatabase()`/`checkSupabaseStorage()`
(`src/server/__tests__/supabase-test-helpers.ts`) and reports as **skipped, with
a clear reason** — not a failure — when `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`
(and `SUPABASE_STORAGE_BUCKET` for uploads) are not set, which is why `npm test`
exits cleanly with no Supabase project configured at all.

| Suite | What it protects |
|---|---|
| `place-order.test.ts` | Prices come from the store not the request; live tax rate and free-shipping threshold; unknown promo codes ignored rather than recorded; concurrent orders for the same piece all succeed (there is no inventory, and this test fails loudly if any is reintroduced); drafts cannot be bought; fractional quantities rejected; only four card digits stored, normalised |
| `repositories.test.ts` | Drafts stay off the storefront; slugs never collide; `updatedAt` moves on edit; duplicates start unrated; forward-only order transitions; renaming a category rewrites its products; in-use categories cannot be deleted; promo validation; partial settings updates preserve nested keys |
| `email-queue.test.ts` | Review requests fire once per order, only after the configured delay, only for delivered orders with an email on file; templates round-trip through an edit and a restore without losing the enabled/disabled switch |
| `reviews.test.ts` | A review can only be written for a delivered order the account actually placed; one review per account per product, enforced by the database, not just by application code; a reason never offered for a rating is rejected |
| `customers.test.ts` | Signup and password reset via a hashed one-time code; a code cannot be replayed; phone numbers are matched however they were typed |
| `uploads.test.ts` | Magic-byte sniffing (SVG refused, declared type ignored) runs everywhere as a unit test; the actual upload to Supabase Storage and reading the bytes back is the integration half |
| `catalog.test.ts` | Catalogue integrity on a small fixture set built by the test itself (there is no seeded demo catalogue) — unique slugs, valid references, no broken cross-sells, sale tags match prices; only active products exposed; filter AND/OR semantics; sort stability; search behaviour; facet counts; summaries drop server-only fields |

Run the integration half for real by pointing `.env.local` at a **disposable
test** Supabase project (never production — these tests create and delete real
rows) with the migrations in `supabase/migrations/` already applied.

`scripts/smoke.mjs` covers what unit tests can't: every route returns 200, unknown
slugs return a real **404** (not a soft one), filters actually narrow the result set,
an impossible combination shows the empty state, an unknown facet value is ignored
rather than emptying the page, JSON-LD is present, both API endpoints return
summaries with no long-form fields, every admin route redirects to login while
remembering where the visitor was headed, admin responses are `no-store`, and neither
the sitemap nor `robots.txt` exposes `/admin`.

One thing it caught worth calling out: a root `app/loading.tsx` starts streaming
before the page runs, which commits a 200 status — so `notFound()` rendered the
404 page but every missing product was served as HTTP 200
([vercel/next.js#75543](https://github.com/vercel/next.js/issues/75543)). There is
now a comment in `not-found.tsx` explaining why that file must not come back.

---

## Not wired up

Deliberate, and visible in the UI rather than hidden:

- **Refunds.** A prepaid order is refunded from the admin order page (Refunds panel, or
  the Return panel once the items are back), through Cashfree's Refunds API to whatever
  the customer paid with. The amount is staff's to set, up to what was paid, so a
  deduction is simply a smaller refund. Every refund is recorded in `order_refunds`
  (migration 20), and the limit is enforced in the database under a lock. Refunds
  made directly in the Cashfree dashboard are not tracked here. A cash-on-delivery
  return has nothing to refund to, so the customer gives a UPI ID and staff pay it by
  hand; that is the only case where a UPI ID is collected, and it is erased once the
  return is closed. Anyone with `orders:write` can refund; split that out into its own
  permission if the team grows.
- **First-order discount.** A percentage off a customer's first order (Admin → Settings,
  "First-order discount (%)", default 10, zero turns it off), applied automatically to a
  signed-in customer and not combined with a promotion code: the larger of the two
  applies. It is once per person, enforced in the database under a lock
  (`supabase/migrations/00000000000021_first_order_discount.sql`), not in the page. "Same
  person" means sharing any of: the account, the email (Gmail dots and `+tags` ignored),
  or a phone number (account or delivery). That will occasionally refuse a genuine new
  customer who shares an email or number with someone who already ordered; it is the
  cheaper mistake. Cancelling the order, a failed payment, or a prepaid order left unpaid
  for 24 hours gives the discount back; anything else, including a return, keeps it
  used. Customers who already have a paid or cash-on-delivery order are not first-time
  customers. Any failure to check is treated as "no discount". A promotion code that is
  reusable, like a "10% off your first order" one, defeats this and should be deleted.
- **Marketing subscriptions.** There is deliberately no newsletter signup or bulk-send
  path. Resend is used only for transactional and direct client-care email; adding
  marketing mail also requires consent capture, unsubscribe handling and suppression
  lists, not merely another send button.
- **Security headers and rate limiting.** No HSTS, no CSP, and `/api/search` and
  `/api/products` are unthrottled. Add them in `next.config.ts` and `src/proxy.ts`
  before opening to traffic.
- **Legal copy.** `/privacy` and `/terms` are templates and say so on the page. Have
  a lawyer review them for every market you sell into.

---

## Layout

```
src/
├── proxy.ts                  # IP allowlist, admin guard, maintenance mode
├── app/
│   ├── layout.tsx            # root: html, fonts, theme — no chrome, so /admin is clean
│   ├── not-found.tsx         # chrome-free 404 for unmatched URLs, incl. /admin/*
│   ├── (storefront)/
│   │   ├── layout.tsx        # ALL shop chrome + cart/wishlist/search providers
│   │   └── (routes)          # home, shop, collections, product, search, cart,
│   │                         # checkout, account, wishlist, content, maintenance
│   ├── admin/
│   │   ├── actions/          # server actions: auth, products, orders, catalog,
│   │   │                     # settings — every mutation validates + audits
│   │   └── (18 screens)      # dashboard, banners, products, orders, customers,
│   │                         # categories, collections, discounts, reviews,
│   │                         # settings, staff, activity, reports, login, setup
│   ├── actions/
│   │   ├── checkout.ts       # placeOrder — the trust boundary
│   │   └── orders.ts         # customer-facing order lookup
│   ├── api/
│   │   ├── products/         # summaries by id or slug (client lookups)
│   │   ├── search/           # typeahead
│   │   └── payments/cashfree/webhook/  # marks an order paid; verifies HMAC signature
│   ├── globals.css           # design tokens, base layer, component primitives
│   └── robots.ts  sitemap.ts
├── server/                   # server-only. Never imported by a client component.
│   ├── store.ts              # the JSON document: atomic writes, cache, seed
│   ├── repositories/         # products, orders, taxonomy, settings, banners
│   ├── cashfree.ts           # payment session creation, order fetch, webhook HMAC
│   ├── storage.ts            # disk or Supabase Storage, chosen at runtime
│   ├── uploads.ts            # sniffing, size cap, content-hash naming
│   ├── login-attempts.ts     # rate limiting: in-process counter
│   ├── auth.ts  session.ts   # scrypt hashing, signed sessions, permissions
│   ├── audit.ts  metrics.ts  # activity trail, dashboard aggregation
├── components/
│   ├── admin/                # shell, tables, editors, hand-drawn SVG charts
│   ├── account/  cart/  checkout/  contact/  home/  layout/
│   ├── product/  providers/  shop/  ui/  wishlist/
├── hooks/                    # store access, hydration, focus trap, scroll lock
└── lib/                      # shared by both, safe on the client
    ├── data/                 # seed catalogue, review stats, review prose
    ├── catalog.ts            # storefront reads (async, active products only)
    ├── product-utils.ts      # data-free predicates + the client projection
    ├── cart-math.ts  format.ts  validation.ts  search-params.ts
    ├── browser-store.ts  stores.ts  orders.ts
    └── config.ts  navigation.ts  types.ts
```

Scripts:

| Command | Does |
|---|---|
| `npm run measure` | Per-route HTML size, RSC payload and SVG node counts |
| `npm run check:bundle` | Fails if catalogue or review text appears in client JS |
| `npm run smoke` | HTTP checks against a running server |
| `npm run check:admin` | Asserts admin carries no shop chrome and stays locked down |
| `npm run audit:nav` | Prints the live header nav and flags repeated headings or links |
| `npm run check:banners` | Asserts the hero carousel renders and stays keyboard accessible |
| `node scripts/toggle-maintenance.mjs on\|off` | Flip maintenance mode without the panel |
