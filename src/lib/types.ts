/**
 * Domain model for the storefront.
 *
 * Money is stored as an integer number of minor units (cents) throughout the
 * app. Formatting to a display string happens only at the edge, in
 * `formatMoney`. This avoids floating-point drift in cart and tax maths.
 */

/**
 * Category and collection slugs are plain strings rather than literal unions
 * because both are editable from the admin panel. The seeded taxonomy is in
 * `config.ts`; the live one lives in the store and can be added to at runtime.
 *
 * Where a fixed list is needed for validation — dropping an unknown facet from a
 * query string, for example — the caller passes the current list in rather than
 * relying on a compile-time union.
 */
export type CategorySlug = string;

export type CollectionSlug = string;

export type Department = "women" | "men" | "unisex";

export type SizeSystem = "alpha" | "waist" | "one-size" | "shoe";

export interface Category {
  slug: CategorySlug;
  name: string;
  /** Short editorial line used on category tiles and listing headers. */
  blurb: string;
  /**
   * Photograph for the category tile.
   *
   * Either an uploaded `/uploads/<hash>.<ext>` path or an absolute URL. When absent the
   * tile falls back to generated artwork drawn from the category's lead product, so a
   * category is never a blank box while photography is still being shot.
   */
  imageUrl?: string;
  /**
   * Landscape crop for the two wide tiles.
   *
   * The first two tiles are given double width from `lg`, which turns them from 4:5 into
   * 16:10. `object-cover` on a portrait file at that shape throws away the top and
   * bottom — usually the garment. This is the same photograph recomposed wide, and it is
   * used only from `lg` up, only on those tiles. Absent, they fall back to `imageUrl`
   * and behave as they did before.
   */
  imageUrlWide?: string;
  /**
   * Which silhouette generated product artwork draws for this category.
   *
   * Not merchant-editable, and deliberately so: `silhouetteFor()` in
   * `components/product/garment-art.tsx` resolves this from the static `lib/config`
   * seed rather than from the store, so a value saved here could never have affected
   * what was drawn. It is derived from the slug on create instead of being asked for.
   */
  silhouette: SilhouetteKey;
  /** Display order on the storefront. Lower sorts first. */
  position?: number;
}

export interface Collection {
  slug: CollectionSlug;
  name: string;
  blurb: string;
  /** Long-form copy for the collection landing page. */
  description: string;
  position?: number;
  /** Hidden collections stay reachable by URL but leave the navigation. */
  hidden?: boolean;
}

export type SilhouetteKey =
  | "coat"
  | "sweater"
  | "shirt"
  | "tee"
  | "trouser"
  | "jean"
  | "dress"
  | "accessory"
  | "belt"
  | "scarf"
  | "wallet"
  | "beanie"
  | "bag";

export interface ProductColor {
  /** Human name shown in the swatch tooltip, e.g. "Bone". */
  name: string;
  /** Stable slug used in URLs and cart line ids. */
  id: string;
  /** Swatch fill. Also seeds the generated art direction. */
  hex: string;
  /**
   * Optional real photography. When present the gallery renders these via
   * next/image; when absent it falls back to generated SVG art so the grid is
   * never broken. Order is [front, detail, back, on-figure].
   */
  images?: string[];
}

/**
 * A size the product is offered in.
 *
 * A label and nothing else: **this shop does not track inventory.** Every size is
 * always purchasable and a piece can be ordered any number of times, because
 * fulfilment is manual. There is deliberately no stock count, no sold-out state and no
 * reservation at checkout.
 */
export interface ProductSize {
  /** Display label, e.g. "M" or "32". */
  label: string;
}

export interface Review {
  id: string;
  author: string;
  /** ISO date string. */
  date: string;
  rating: 1 | 2 | 3 | 4 | 5;
  title: string;
  body: string;
  verified: boolean;
  /** Reviewer's own fit feedback, aggregated into the fit meter. */
  fit: "runs-small" | "true-to-size" | "runs-large";
  height?: string;
  sizePurchased?: string;
}

/**
 * A review a real customer submitted, as opposed to the seeded editorial ones.
 *
 * This is the persisted shape. The product page projects it into the display `Review`
 * above so both kinds render through one code path — the difference the shopper sees is
 * only that a submitted review is always a `verified` purchase.
 *
 * The prompt that produces one is rating-first: the shopper picks a star count, taps the
 * canned `reasons` that fit, and writes free text only if they choose "Other". So `body`
 * can be empty when `reasons` carries the whole message; the projection composes a
 * readable sentence from the reasons in that case.
 */
export interface SubmittedReview {
  id: string;
  /** The product reviewed. Not a foreign key: the slug is how the storefront joins. */
  productSlug: string;
  /** The account that wrote it. Every submitted review is authenticated. */
  customerId: string;
  /** The delivered order that entitled the review — the proof behind "verified". */
  orderId: string;
  /** Display name shown on the review, snapshotted so a later rename does not rewrite it. */
  author: string;
  rating: 1 | 2 | 3 | 4 | 5;
  fit: "runs-small" | "true-to-size" | "runs-large";
  /** Tapped preset phrases for the chosen rating. May be empty if the shopper only typed. */
  reasons: string[];
  /** Free text from the "Other" box. Empty when the shopper only tapped presets. */
  body: string;
  createdAt: string;
}

/**
 * Publication state.
 *
 * `active` is the only status the storefront shows. `draft` lets a buyer prepare a
 * product before its drop; `archived` retires it without destroying order history
 * that references it.
 */
export type ProductStatus = "active" | "draft" | "archived";

export interface Product {
  id: string;
  slug: string;
  name: string;
  /** One-line editorial hook shown under the name. */
  tagline: string;
  department: Department;
  category: CategorySlug;
  collections: CollectionSlug[];
  /** Current price in minor units. */
  price: number;
  /** Original price in minor units when the item is marked down. */
  compareAtPrice?: number;
  sizeSystem: SizeSystem;
  colors: ProductColor[];
  sizes: ProductSize[];
  /** Long description, rendered as paragraphs. */
  description: string;
  /** Bulleted construction/spec notes. */
  details: string[];
  composition: string;
  care: string[];
  /** Model + fit note, e.g. "Model is 5'11\" wearing size S." */
  fitNote: string;
  origin: string;
  rating: number;
  reviewCount: number;
  /** ISO date used for "newest" sorting and the New badge. */
  releasedAt: string;
  /** Drives the "trending" sort and best-seller ranking. */
  popularity: number;
  sustainable?: boolean;
  /**
   * Hand-picks this product into the home page "New arrivals" section.
   *
   * When no product carries the flag the section falls back to the `new-arrivals`
   * collection, then to the newest products — so the home page is never empty on a
   * fresh catalogue and a merchant only has to think about this if they want to.
   */
  showOnHome?: boolean;
  /** Slugs of products shown in "Pairs well with". */
  pairsWith?: string[];

  /* ---- Fields owned by the admin panel ---------------------------------- */

  /** Only `active` products appear on the storefront. Defaults to active. */
  status?: ProductStatus;
  /** Merchant stock reference. Variant SKUs are derived from this. */
  sku?: string;
  /**
   * Unit cost in minor units. Never exposed to the storefront — it powers the
   * margin column in admin reporting.
   */
  costPrice?: number;
  /** Shipping weight in grams, for carrier rate calculation. */
  weightGrams?: number;
  /** Whether sales tax applies. Defaults to true. */
  taxable?: boolean;
  /** SEO overrides. Falls back to the product name and tagline. */
  seoTitle?: string;
  seoDescription?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * The projection of a product that client components receive.
 *
 * Everything a card, swatch, size picker or add-to-bag button needs, and nothing
 * else — no long description, construction notes, care instructions or review
 * prose. Listing pages hand these to `<ProductCard>` so a grid of thirty items
 * does not serialise thirty full product records into the page.
 */
export type ProductSummary = Pick<
  Product,
  | "id"
  | "slug"
  | "name"
  | "tagline"
  | "department"
  | "category"
  | "price"
  | "compareAtPrice"
  | "sizeSystem"
  | "colors"
  | "sizes"
  | "rating"
  | "reviewCount"
  | "releasedAt"
  | "sustainable"
>;

/** The minimum needed to render generated product artwork. */
export type ArtSubject = Pick<Product, "id" | "slug" | "name" | "category">;

export interface CartLine {
  /** `${productId}:${colorId}:${size}` — stable identity for a variant. */
  id: string;
  productId: string;
  slug: string;
  name: string;
  colorId: string;
  colorName: string;
  colorHex: string;
  size: string;
  unitPrice: number;
  compareAtPrice?: number;
  quantity: number;
  /** Snapshot so the cart renders without re-querying the catalogue. */
  category: CategorySlug;
}

export interface WishlistEntry {
  productId: string;
  colorId: string;
  addedAt: number;
}

/*
 * `ShippingMethod` used to live here — three selectable options with their own prices
 * and ETA strings. Removed: the shop has one shipping arrangement, so the shopper is
 * told how long delivery takes rather than asked to pick. The cost comes from
 * `freeShippingThreshold`/`standardShippingRate` and the promise from
 * `deliveryDaysMin`/`deliveryDaysMax`, both on `StoreSettings`.
 */

export interface PromoCode {
  code: string;
  /** Percentage off the merchandise subtotal, 0–100. */
  percentOff?: number;
  /** Flat amount off in minor units. */
  amountOff?: number;
  /** Minimum merchandise subtotal in minor units. */
  minSubtotal?: number;
  description: string;
}

export interface OrderSummary {
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
}

/**
 * A delivery address.
 *
 * Checkout collects five fields: name, address, phone, city and state. The fields
 * below them are **legacy** — orders placed before the form was reduced still carry
 * a split name, a postcode and a country, and they are persisted whole in the
 * `orders.shipping_address` jsonb column.
 *
 * They are kept optional rather than migrated away because rewriting historical
 * orders would discard information a merchant may still need to answer a delivery
 * question, and `formatAddress` in `src/lib/format.ts` reads both shapes. Nothing
 * writes them any more.
 */
export interface Address {
  /** Full name, as one field. */
  name: string;
  line1: string;
  city: string;
  region: string;
  /** Required since the form was reduced — it is the only contact route on the parcel. */
  phone: string;

  /* ---- Legacy, written by orders placed before the form was reduced ------ */

  firstName?: string;
  lastName?: string;
  line2?: string;
  postalCode?: string;
  country?: string;
}

export interface OrderLine {
  /**
   * Kept so reporting can attribute units sold to a product. Optional because a
   * deleted product must not make the order unreadable — every field needed to render
   * the line is copied alongside.
   */
  productId?: string;
  slug: string;
  name: string;
  colorId?: string;
  colorName: string;
  colorHex: string;
  size: string;
  quantity: number;
  unitPrice: number;
  category: CategorySlug;
}

export interface OrderNote {
  at: string;
  body: string;
}

/**
 * What the browser keeps after a checkout.
 *
 * The order itself is server-side. This is the claim ticket: a guest has no
 * account, so possession of both the reference and the email address is what
 * entitles them to read the record back.
 */
export interface OrderRef {
  id: string;
  email: string;
  /** Kept locally so the list can be ordered before the server responds. */
  placedAt: string;
}

export interface Order {
  id: string;
  placedAt: string;
  status: "processing" | "shipped" | "delivered" | "cancelled";
  lines: OrderLine[];
  totals: OrderSummary;
  shippingAddress: Address;
  /**
   * The account that placed it, when checkout was authenticated.
   *
   * Absent on legacy orders and guest orders. This is what ties a delivered order to the
   * shopper who can be asked to review its pieces — email match alone is looser, since
   * two people can share one address's email. Not a hard foreign key at the type level so
   * that deleting a customer never makes their order history unreadable.
   */
  customerId?: string;
  /** Captured at checkout; absent on legacy orders. */
  email?: string;
  /** Promotion code applied, if any. */
  promoCode?: string;
  /** Last four digits only — never the full number. */
  cardLast4?: string;
  trackingNumber?: string;
  carrier?: string;
  shippedAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  /**
   * Why the order was cancelled.
   *
   * A dedicated field rather than an entry in `notes`, because notes are internal —
   * `forCustomer()` strips them before the account area sees an order. The reason has
   * to survive that: a customer who cancels needs to see what they said, and one whose
   * order a merchant cancelled needs to be told why.
   */
  cancellationReason?: string;
  /**
   * When the review-request email was sent.
   *
   * Stored on the order rather than inferred from the email log, because the log is
   * capped and eventually forgets. Losing this would mean asking a customer for the same
   * review a second time months later, which reads as a shop that is not paying
   * attention. Its presence is the idempotency guard for the queue.
   */
  reviewRequestedAt?: string;
  /** Internal notes, visible only in the admin panel. */
  notes?: OrderNote[];
}

/* ------------------------------------------------------------------ */
/* Listing / filtering                                                */
/* ------------------------------------------------------------------ */

export type SortKey =
  | "featured"
  | "newest"
  | "price-asc"
  | "price-desc"
  | "rating"
  | "name-asc";

export interface ProductFilters {
  categories: CategorySlug[];
  departments: Department[];
  colors: string[];
  sizes: string[];
  /** Minor units. */
  minPrice?: number;
  maxPrice?: number;
  onSale?: boolean;
  sustainable?: boolean;
  search?: string;
}

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

/**
 * Store settings that the admin panel owns.
 *
 * `config.ts` holds the seed values; once the store is initialised this record is
 * the source of truth, so a merchant can change their tax rate or free-shipping
 * threshold without a deploy.
 */
export interface StoreSettings {
  name: string;
  legalName: string;
  tagline: string;
  description: string;
  /** Public origin, used for canonical URLs, the sitemap and Open Graph. */
  url: string;
  email: string;
  phone: string;
  address: string;
  /** ISO 4217. */
  currency: string;
  locale: string;
  /** Minor units. Orders at or above this get complimentary standard shipping. */
  freeShippingThreshold: number;
  /** Charged when below the threshold, in minor units. */
  standardShippingRate: number;
  /** Fractional rate, e.g. 0.08 for 8%. */
  taxRate: number;
  returnWindowDays: number;
  /**
   * How long delivery takes, in business days.
   *
   * There is one shipping option, so this is the promise the whole site makes — the
   * product page pincode check, the cart, checkout and the confirmation all read it.
   * A range rather than a single number because couriers quote ranges, and a shop that
   * promises "3 days" is wrong more often than one that promises "3–5".
   *
   * Not sourced from the courier: Delhivery's serviceability API reports whether a
   * pincode is served, not how long it takes, so the estimate is the merchant's.
   */
  deliveryDaysMin: number;
  deliveryDaysMax: number;
  /**
   * How long to wait after delivery before asking for a review.
   *
   * A review request that arrives while the parcel is still on the doormat asks about a
   * garment nobody has worn. Zero sends it immediately on the delivered transition, which
   * is supported but not recommended.
   */
  reviewRequestDelayDays: number;
  social: {
    instagram: string;
    pinterest: string;
    youtube: string;
  };
  /** Rotating messages in the storefront announcement bar. */
  announcements: string[];
  /** Phrases in the scrolling marquee under the home page hero. */
  marqueeItems: string[];
  /** How many products the home page "New arrivals" section shows. */
  homeNewArrivalsCount: number;
  /**
   * The three-up service reassurance shown in the footer and on every product page.
   *
   * One list rather than six loose fields: the surfaces that render it iterate, so a
   * merchant who wants two promises or four does not need a schema change.
   */
  servicePromises: ServicePromise[];
  /** Paragraphs for the "Shipping & returns" tab on the product page. */
  shippingReturnsCopy: string[];
  /** Takes the storefront offline for everyone except signed-in admins. */
  maintenanceMode: boolean;
}

/**
 * One service promise.
 *
 * `{title, body}` rather than a single string so the storefront keeps control of
 * typography — the title is uppercase tracked small caps, the body is not.
 */
export interface ServicePromise {
  title: string;
  body: string;
}

/**
 * A home-page hero slide, managed from the admin panel.
 *
 * Text lives in fields rather than one blob of HTML on purpose: a merchant editing
 * copy cannot break the layout or inject markup, and the storefront keeps full
 * control of typography and contrast.
 *
 * `imageUrl` is optional. Without it the slide renders a generated gradient from
 * `accentHex`, so a banner is never a broken image — the same principle as the
 * product artwork.
 */
export interface Banner {
  id: string;
  /** Small label above the heading, e.g. "Autumn / Winter". */
  eyebrow?: string;
  heading: string;
  body?: string;
  /** Both or neither — a button with no destination is worse than no button. */
  ctaLabel?: string;
  ctaHref?: string;
  /**
   * Desktop artwork, and the default every other breakpoint falls back to.
   *
   * Absolute URL or an uploaded `/uploads/<hash>.<ext>` path.
   */
  imageUrl?: string;
  /**
   * Optional art-directed crops.
   *
   * The hero is a wide cinematic strip on desktop and a tall block on a phone, so one
   * file cannot serve both — `object-cover` has to discard most of the width to fill a
   * portrait slot, which is what makes a banner look badly cut. These let a merchant
   * supply a crop composed for each shape.
   *
   * Both optional and resolved upward: mobile falls back to tablet, tablet to desktop,
   * desktop to the generated gradient. One upload still produces a working banner.
   */
  imageUrlMobile?: string;
  imageUrlTablet?: string;
  /** Describes the image for screen readers. Empty when the image is decorative. */
  imageAlt?: string;
  /** Seeds the gradient when there is no image. */
  accentHex?: string;
  /** Which way the text contrasts against the art behind it. */
  textTone: "light" | "dark";
  align: "left" | "center";
  /** Inactive slides stay in admin but never render. */
  active: boolean;
  /** Display order. Lower shows first. */
  position: number;
  /** Optional schedule, ISO dates. Lets a sale banner be queued in advance. */
  startsAt?: string;
  endsAt?: string;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Customer accounts                                                   */
/* ------------------------------------------------------------------ */

/**
 * A shopper's account.
 *
 * Identified by mobile number rather than email, which is the one decision here that
 * everything else follows from. A number is the thing a customer can always receive a
 * one-time code on, it is already required on every order so the courier can call, and
 * it is harder to mistype twice than an address is.
 *
 * Email stays optional. It is how a receipt gets sent, not how anyone signs in, so an
 * account with no email is a perfectly good account and the schema says so.
 *
 * Separate from `AdminUser` on purpose. The two have the same shape in places and
 * nothing else in common: staff have roles and permissions, shoppers have neither, and
 * a single table with a nullable role column is how a customer eventually ends up
 * holding `settings:write`.
 */
export interface CustomerAccount {
  id: string;
  /** E.164. The login identifier, so it is unique and always normalised on write. */
  phone: string;
  name: string;
  /** For receipts. Not a credential, not unique, and not required. */
  email?: string;
  /** scrypt derived key, hex encoded. Never the password itself. */
  passwordHash: string;
  /** Per-account random salt, hex encoded. */
  passwordSalt: string;
  /**
   * The Supabase Auth identity this account is bridged to, once one exists.
   *
   * Populated on the first successful OTP verification after the Supabase Auth bridge
   * landed — this app's own OTP flow still decides whether a code is correct, and a
   * success then creates or finds the matching `auth.users` row and records its id here.
   * Absent for accounts that predate the bridge and have not signed in since, which is
   * why it is optional. `id` stays the stable key every order and review references, so
   * this is purely the auth/session link.
   */
  authUserId?: string;
  /**
   * When the signup code was confirmed.
   *
   * Always set, because an account is only written after the code is confirmed — there
   * is no unverified state to represent. Kept as a timestamp rather than a boolean
   * because "when did this person prove they hold this number" is the question support
   * actually asks.
   */
  phoneVerifiedAt: string;
  createdAt: string;
  lastLoginAt?: string;
  /** Set by staff. A disabled account fails sign-in without saying why. */
  disabled?: boolean;
}

/**
 * What a one-time code is for.
 *
 * Exactly two moments need one: proving a new number belongs to the person claiming it,
 * and re-proving it when the password behind it has been forgotten. Ordinary sign-in
 * does not, and adding a third purpose here should require an argument for why the
 * password is not already sufficient.
 */
export type OtpPurpose = "signup" | "password-reset";

/**
 * An outstanding one-time code.
 *
 * Two things about this record are worth stating plainly, because both are easy to get
 * wrong and neither is visible from the outside:
 *
 * **The code is hashed, not stored.** A six-digit code is a secret with a million
 * possible values, which is only safe because `attempts` is capped and `expiresAt` is
 * close. Storing it in the clear would mean anyone who could read this row — a leaked
 * backup, an over-broad admin query — could sign in as the person it was sent to. It is
 * hashed with the same scrypt parameters as a password, which is slow enough that
 * grinding a million candidates against the hash is not a shortcut.
 *
 * **The pending signup rides along.** During signup the account does not exist yet, and
 * it must not: an unverified row in `customers` would occupy the phone number, so
 * anyone could lock a stranger out of registering by typing their number in. So the
 * name and the already-hashed password wait here instead, and the account is written in
 * the same step that confirms the code. The plaintext password is hashed before it is
 * ever stored, so this record never holds a recoverable credential either.
 */
export interface PhoneVerification {
  id: string;
  /** E.164, normalised. Not a foreign key: signup codes precede the account. */
  phone: string;
  purpose: OtpPurpose;
  /**
   * Who is holding the code.
   *
   * `local` means this application generated it, so `codeHash`/`codeSalt`/`attempts`
   * are what a guess is checked against. `twilio-verify` means a Verify Service did —
   * the code, its expiry and its attempt cap all live on Twilio's side, and this row
   * exists only to carry the pending signup payload between "a code was sent" and "the
   * code was confirmed". A row can never be checked by the wrong path: `otp.ts` reads
   * this field before it decides whether to compare a hash or call Twilio.
   */
  provider: "local" | "twilio-verify";
  /** scrypt derived key of the six-digit code, hex encoded. Absent for `twilio-verify`. */
  codeHash?: string;
  /** Absent for `twilio-verify`. */
  codeSalt?: string;
  /** When the code stops being accepted. */
  expiresAt: string;
  /** Wrong guesses so far. The code is burned once this reaches the cap. Twilio keeps its own count for `twilio-verify`; this stays 0. */
  attempts: number;
  /** Also the resend cooldown's reference point. */
  createdAt: string;
  /** Pending account name, held until the code is confirmed. Signup only. */
  pendingName?: string;
  /** Pending credential, already hashed. Signup only. */
  pendingPasswordHash?: string;
  pendingPasswordSalt?: string;
  /** Pending email, if the shopper gave one. Signup only. */
  pendingEmail?: string;
}

export type AdminRole = "owner" | "manager" | "staff";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  /** scrypt derived key, hex encoded. Never the password itself. */
  passwordHash: string;
  /** Per-user random salt, hex encoded. */
  passwordSalt: string;
  createdAt: string;
  lastLoginAt?: string;
  disabled?: boolean;
}

/** What an admin is allowed to do. Checked on the server for every mutation. */
export type Permission =
  | "products:write"
  | "orders:write"
  | "discounts:write"
  | "settings:write"
  | "staff:write";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "login"
  | "login:failed"
  | "logout"
  | "status";

export interface AuditEntry {
  id: string;
  at: string;
  /** Null for failed logins, where there is no authenticated actor. */
  actorId: string | null;
  actorEmail: string;
  action: AuditAction;
  /** What kind of thing changed, e.g. "product", "order", "settings". */
  entity: string;
  /** Identifier of the thing that changed. */
  entityId: string;
  /** Human-readable summary shown in the activity feed. */
  summary: string;
}

/* ------------------------------------------------------------------ */
/* Email                                                               */
/* ------------------------------------------------------------------ */

/**
 * Which transactional email a template is for.
 *
 * Deliberately tied to order lifecycle events the merchant already causes, rather than
 * to a wishlist of moments. `"out-for-delivery"` fires when an order is marked
 * **shipped** — there is no courier webhook, so a separate "out for delivery" status
 * would be a button someone has to remember to press at exactly the right hour, which in
 * practice means the email never gets sent at all.
 *
 * `"review-request"` is the exception: it is not sent on a transition. It is queued when
 * an order is delivered and becomes due after `settings.reviewRequestDelayDays`, because
 * asking for a review the second a parcel lands asks about something nobody has opened.
 */
export type EmailTemplateKey =
  | "order-confirmation"
  | "out-for-delivery"
  | "delivered"
  | "review-request"
  | "order-cancelled";

/**
 * A merchant-editable transactional email.
 *
 * Subject, heading and body are stored separately rather than as one blob of HTML. A
 * merchant editing raw markup is how you get an email that renders as a blank white
 * rectangle in Outlook; the layout, inlined styles and plain-text alternative are all
 * generated, and the merchant supplies words.
 *
 * `body` is plain text — blank lines separate paragraphs. Placeholders like
 * `{{orderId}}` are substituted at send time and everything is HTML-escaped first, so a
 * customer named `<script>` cannot inject anything into their own confirmation.
 */
export interface EmailTemplate {
  key: EmailTemplateKey;
  /** Off means the event happens silently. Nothing is queued and nothing is logged. */
  enabled: boolean;
  subject: string;
  /** Large line at the top of the message body. */
  heading: string;
  body: string;
}

/**
 * One send attempt.
 *
 * Kept for two reasons that are both load-bearing. A merchant needs to see whether the
 * confirmation for order PR-260830-0007 actually went out, because "did the customer get
 * an email" is the first question every support conversation starts with. And a failure
 * has to be visible: email fails silently by nature, so an unlogged failure is
 * indistinguishable from a success.
 *
 * `templateKey` is null for a one-off message composed in the admin panel.
 */
export interface EmailRecord {
  id: string;
  at: string;
  to: string;
  subject: string;
  templateKey: EmailTemplateKey | null;
  /** Set when the message was about a specific order. */
  orderId?: string;
  /**
   * `"logged"` means no provider is configured, so the message was recorded but not
   * delivered. A distinct state from `"sent"` on purpose — reporting an unconfigured
   * store as having sent email is the kind of lie that gets found out by a customer.
   */
  status: "sent" | "failed" | "logged";
  /** Provider or network error, present only on failure. */
  error?: string;
}

/** Everything persisted by the server. One JSON document. */
export interface StoreData {
  /** Bumped when the shape changes, so a migration can be applied on load. */
  version: number;
  products: Product[];
  categories: Category[];
  collections: Collection[];
  banners: Banner[];
  promoCodes: PromoCode[];
  settings: StoreSettings;
  orders: Order[];
  admins: AdminUser[];
  /** Shopper accounts, identified by mobile number. */
  customers: CustomerAccount[];
  /**
   * Outstanding one-time codes.
   *
   * Short-lived by nature, and pruned whenever a code is issued or confirmed rather
   * than on a schedule — the same reasoning as `login_attempts`, and for the same
   * reason: a cleanup job someone has to remember exists is a cleanup job that stops
   * running.
   */
  phoneVerifications: PhoneVerification[];
  /** Review ids hidden by a moderator. */
  hiddenReviewIds: string[];
  /** Reviews real customers have written, newest first. */
  submittedReviews: SubmittedReview[];
  audit: AuditEntry[];
  /** Merchant-editable transactional email copy, one per event. */
  emailTemplates: EmailTemplate[];
  /** Recent send attempts, newest first. Capped like the audit trail. */
  emailLog: EmailRecord[];
}

/* ------------------------------------------------------------------ */
/* Reporting                                                           */
/* ------------------------------------------------------------------ */

export interface MetricPoint {
  /** ISO date, day granularity. */
  date: string;
  revenue: number;
  orders: number;
  units: number;
}

export interface DashboardMetrics {
  /** Totals for the selected window. */
  revenue: number;
  orders: number;
  units: number;
  averageOrderValue: number;
  /** Percentage change against the immediately preceding window. */
  revenueChange: number | null;
  ordersChange: number | null;
  aovChange: number | null;
  series: MetricPoint[];
  topProducts: Array<{
    slug: string;
    name: string;
    units: number;
    revenue: number;
  }>;
  statusCounts: Record<Order["status"], number>;
}
