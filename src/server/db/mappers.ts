import type {
  AdminUser,
  AuditEntry,
  Banner,
  Category,
  Collection,
  CustomerAccount,
  EmailRecord,
  EmailTemplate,
  Order,
  OrderLine,
  PhoneVerification,
  Product,
  ProductColor,
  ProductSize,
  PromoCode,
  StoreSettings,
  SubmittedReview,
} from "@/lib/types";
import { normalisePhone } from "@/lib/phone";
import type {
  admins,
  auditLog,
  banners,
  categories,
  collections,
  customers,
  emailLog,
  emailTemplates,
  orderLines,
  orders,
  phoneVerifications,
  productColors,
  productCollections,
  productSizes,
  products,
  promoCodes,
  settings,
  submittedReviews,
} from "./schema";

/**
 * Translation between database rows and the domain types.
 *
 * The domain model in `src/lib/types.ts` is the contract for everything above the server
 * layer, and it is not going to be reshaped to suit storage. Two differences have to be
 * bridged on every read and write, and doing it in one place is what stops each
 * repository inventing its own slightly different answer:
 *
 * - **Timestamps.** Postgres holds `timestamptz`, the domain holds ISO strings. The
 *   conversion is not merely cosmetic: a `Date` serialised into a React Server Component
 *   payload and a string compared with `<` behave differently, and the app already relies
 *   on lexicographic ISO comparison in several sorts.
 * - **Absent values.** SQL has one kind of absence and TypeScript optionals have another.
 *   A column reads back as `null`; a domain field that is simply not there is `undefined`.
 *   Leaving `null` in place would put it into JSON payloads and into `??` chains that
 *   were written expecting `undefined`.
 *
 * Everything here is a pure function of its arguments, so it is testable without a
 * database — which is the point, because a mapping bug is silent. It does not throw, it
 * quietly drops a field.
 */

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"];
type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

/** `null` becomes `undefined`, so optional domain fields read as absent, not empty. */
function optional<T>(value: T | null): T | undefined {
  return value ?? undefined;
}

/** A timestamp column as the ISO string the domain uses. */
function iso(value: Date): string {
  return value.toISOString();
}

/** A nullable timestamp column, absent when null. */
function isoOptional(value: Date | null): string | undefined {
  return value ? value.toISOString() : undefined;
}

/**
 * An ISO string as a `Date` for writing.
 *
 * Rejects an unparseable value rather than storing `Invalid Date`, which Postgres turns
 * into an error thousands of rows into a bulk insert with no indication of which row was
 * at fault.
 */
function date(value: string, field: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${field} is not a valid date: ${JSON.stringify(value)}`);
  }
  return parsed;
}

function dateOptional(value: string | undefined, field: string): Date | null {
  return value ? date(value, field) : null;
}

/* ------------------------------------------------------------------ */
/* Taxonomy                                                            */
/* ------------------------------------------------------------------ */

export function toCategory(row: Row<typeof categories>): Category {
  return {
    slug: row.slug,
    name: row.name,
    blurb: row.blurb,
    imageUrl: optional(row.imageUrl),
    imageUrlWide: optional(row.imageUrlWide),
    silhouette: row.silhouette,
    position: row.position,
  };
}

export function fromCategory(
  category: Category,
  position = category.position ?? 0,
): Insert<typeof categories> {
  return {
    slug: category.slug,
    name: category.name,
    blurb: category.blurb,
    imageUrl: category.imageUrl ?? null,
    imageUrlWide: category.imageUrlWide ?? null,
    silhouette: category.silhouette,
    position,
  };
}

export function toCollection(row: Row<typeof collections>): Collection {
  return {
    slug: row.slug,
    name: row.name,
    blurb: row.blurb,
    description: row.description,
    position: row.position,
    hidden: row.hidden,
  };
}

export function fromCollection(
  collection: Collection,
  position = collection.position ?? 0,
): Insert<typeof collections> {
  return {
    slug: collection.slug,
    name: collection.name,
    blurb: collection.blurb,
    description: collection.description,
    position,
    hidden: collection.hidden ?? false,
  };
}

/* ------------------------------------------------------------------ */
/* Products                                                            */
/* ------------------------------------------------------------------ */

/**
 * Assemble a product from its own row plus its children.
 *
 * The children are expected already filtered to this product. Sorting by `position`
 * happens here anyway: a size run is S, M, L rather than alphabetical, and colourway
 * order decides which swatch is selected by default, so neither can be left to whatever
 * order the query returned.
 */
export function toProduct(
  row: Row<typeof products>,
  colors: Row<typeof productColors>[],
  sizes: Row<typeof productSizes>[],
  memberships: Row<typeof productCollections>[],
): Product {
  const byPosition = <T extends { position: number }>(a: T, b: T) =>
    a.position - b.position;

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    department: row.department,
    category: row.category,
    collections: [...memberships]
      .sort(byPosition)
      .map((membership) => membership.collectionSlug),
    price: row.price,
    compareAtPrice: optional(row.compareAtPrice),
    sizeSystem: row.sizeSystem,
    colors: [...colors].sort(byPosition).map(toProductColor),
    sizes: [...sizes].sort(byPosition).map(toProductSize),
    description: row.description,
    details: row.details,
    composition: row.composition,
    care: row.care,
    fitNote: row.fitNote,
    origin: row.origin,
    rating: row.rating,
    reviewCount: row.reviewCount,
    releasedAt: iso(row.releasedAt),
    popularity: row.popularity,
    sustainable: row.sustainable,
    showOnHome: row.showOnHome,
    pairsWith: row.pairsWith,
    status: row.status,
    sku: optional(row.sku),
    costPrice: optional(row.costPrice),
    weightGrams: optional(row.weightGrams),
    taxable: row.taxable,
    seoTitle: optional(row.seoTitle),
    seoDescription: optional(row.seoDescription),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toProductColor(row: Row<typeof productColors>): ProductColor {
  return {
    id: row.colorId,
    name: row.name,
    hex: row.hex,
    /*
     * An empty array is normalised away. The storefront branches on whether photography
     * exists at all, and `images: []` is truthy — it would take the "has photography"
     * path and render nothing.
     */
    images: row.images.length > 0 ? row.images : undefined,
  };
}

function toProductSize(row: Row<typeof productSizes>): ProductSize {
  return { label: row.label };
}

/**
 * Split a product into the four rows that persist it.
 *
 * Returned as one object rather than four functions because the child rows all need the
 * product's id, and a caller that has to remember to thread it through is a caller that
 * will eventually forget.
 */
export interface ProductRows {
  product: Insert<typeof products>;
  colors: Insert<typeof productColors>[];
  sizes: Insert<typeof productSizes>[];
  memberships: Insert<typeof productCollections>[];
}

export function fromProduct(product: Product): ProductRows {
  const now = new Date();

  return {
    product: {
      id: product.id,
      slug: product.slug,
      name: product.name,
      tagline: product.tagline,
      department: product.department,
      category: product.category,
      price: product.price,
      compareAtPrice: product.compareAtPrice ?? null,
      sizeSystem: product.sizeSystem,
      description: product.description,
      details: product.details,
      composition: product.composition,
      care: product.care,
      fitNote: product.fitNote,
      origin: product.origin,
      rating: product.rating,
      reviewCount: product.reviewCount,
      releasedAt: date(product.releasedAt, "releasedAt"),
      popularity: product.popularity,
      sustainable: product.sustainable ?? false,
      showOnHome: product.showOnHome ?? false,
      pairsWith: product.pairsWith ?? [],
      // A product with no explicit status is a seeded one from before the field existed.
      status: product.status ?? "active",
      sku: product.sku ?? null,
      costPrice: product.costPrice ?? null,
      weightGrams: product.weightGrams ?? null,
      taxable: product.taxable ?? true,
      seoTitle: product.seoTitle ?? null,
      seoDescription: product.seoDescription ?? null,
      createdAt: product.createdAt ? date(product.createdAt, "createdAt") : now,
      updatedAt: product.updatedAt ? date(product.updatedAt, "updatedAt") : now,
    },
    colors: product.colors.map((color, position) => ({
      productId: product.id,
      colorId: color.id,
      name: color.name,
      hex: color.hex,
      images: color.images ?? [],
      position,
    })),
    sizes: product.sizes.map((size, position) => ({
      productId: product.id,
      label: size.label,
      position,
    })),
    memberships: product.collections.map((collectionSlug, position) => ({
      productId: product.id,
      collectionSlug,
      position,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

export function toOrder(
  row: Row<typeof orders>,
  lines: Row<typeof orderLines>[],
): Order {
  return {
    id: row.id,
    placedAt: iso(row.placedAt),
    status: row.status,
    lines: [...lines].sort((a, b) => a.position - b.position).map(toOrderLine),
    totals: row.totals,
    shippingAddress: row.shippingAddress,
    customerId: optional(row.customerId),
    email: optional(row.email),
    promoCode: optional(row.promoCode),
    cardLast4: optional(row.cardLast4),
    trackingNumber: optional(row.trackingNumber),
    carrier: optional(row.carrier),
    shippedAt: isoOptional(row.shippedAt),
    deliveredAt: isoOptional(row.deliveredAt),
    cancelledAt: isoOptional(row.cancelledAt),
    cancellationReason: optional(row.cancellationReason),
    reviewRequestedAt: isoOptional(row.reviewRequestedAt),
    notes: row.notes,
  };
}

function toOrderLine(row: Row<typeof orderLines>): OrderLine {
  return {
    productId: optional(row.productId),
    slug: row.slug,
    name: row.name,
    colorId: optional(row.colorId),
    colorName: row.colorName,
    colorHex: row.colorHex,
    size: row.size,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    category: row.category,
  };
}

export interface OrderRows {
  order: Insert<typeof orders>;
  lines: Insert<typeof orderLines>[];
}

export function fromOrder(order: Order): OrderRows {
  return {
    order: {
      id: order.id,
      placedAt: date(order.placedAt, "placedAt"),
      status: order.status,
      totals: order.totals,
      shippingAddress: order.shippingAddress,
      customerId: order.customerId ?? null,
      email: order.email ?? null,
      promoCode: order.promoCode ?? null,
      cardLast4: order.cardLast4 ?? null,
      trackingNumber: order.trackingNumber ?? null,
      carrier: order.carrier ?? null,
      shippedAt: dateOptional(order.shippedAt, "shippedAt"),
      deliveredAt: dateOptional(order.deliveredAt, "deliveredAt"),
      cancelledAt: dateOptional(order.cancelledAt, "cancelledAt"),
      cancellationReason: order.cancellationReason ?? null,
      reviewRequestedAt: dateOptional(order.reviewRequestedAt, "reviewRequestedAt"),
      notes: order.notes ?? [],
    },
    /*
     * `position` is the line's index and is part of the primary key. It exists so a
     * receipt lists its lines in the order they were bought rather than in whatever
     * order the rows come back — an order with two colourways of the same piece would
     * otherwise shuffle between renders.
     */
    lines: order.lines.map((line, position) => ({
      orderId: order.id,
      position,
      productId: line.productId ?? null,
      slug: line.slug,
      name: line.name,
      colorId: line.colorId ?? null,
      colorName: line.colorName,
      colorHex: line.colorHex,
      size: line.size,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      category: line.category,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Merchandising                                                       */
/* ------------------------------------------------------------------ */

export function toBanner(row: Row<typeof banners>): Banner {
  return {
    id: row.id,
    eyebrow: optional(row.eyebrow),
    heading: row.heading,
    body: optional(row.body),
    ctaLabel: optional(row.ctaLabel),
    ctaHref: optional(row.ctaHref),
    imageUrl: optional(row.imageUrl),
    imageUrlMobile: optional(row.imageUrlMobile),
    imageUrlTablet: optional(row.imageUrlTablet),
    imageAlt: optional(row.imageAlt),
    accentHex: optional(row.accentHex),
    textTone: row.textTone,
    align: row.align,
    active: row.active,
    position: row.position,
    startsAt: isoOptional(row.startsAt),
    endsAt: isoOptional(row.endsAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function fromBanner(banner: Banner): Insert<typeof banners> {
  return {
    id: banner.id,
    eyebrow: banner.eyebrow ?? null,
    heading: banner.heading,
    body: banner.body ?? null,
    ctaLabel: banner.ctaLabel ?? null,
    ctaHref: banner.ctaHref ?? null,
    imageUrl: banner.imageUrl ?? null,
    imageUrlMobile: banner.imageUrlMobile ?? null,
    imageUrlTablet: banner.imageUrlTablet ?? null,
    imageAlt: banner.imageAlt ?? null,
    accentHex: banner.accentHex ?? null,
    textTone: banner.textTone,
    align: banner.align,
    active: banner.active,
    position: banner.position,
    startsAt: dateOptional(banner.startsAt, "startsAt"),
    endsAt: dateOptional(banner.endsAt, "endsAt"),
    createdAt: date(banner.createdAt, "createdAt"),
    updatedAt: date(banner.updatedAt, "updatedAt"),
  };
}

export function toPromoCode(row: Row<typeof promoCodes>): PromoCode {
  return {
    code: row.code,
    percentOff: optional(row.percentOff),
    amountOff: optional(row.amountOff),
    minSubtotal: optional(row.minSubtotal),
    description: row.description,
  };
}

export function fromPromoCode(promo: PromoCode): Insert<typeof promoCodes> {
  return {
    code: promo.code,
    percentOff: promo.percentOff ?? null,
    amountOff: promo.amountOff ?? null,
    minSubtotal: promo.minSubtotal ?? null,
    description: promo.description,
  };
}

/* ------------------------------------------------------------------ */
/* Settings, staff, audit                                              */
/* ------------------------------------------------------------------ */

export function toSettings(row: Row<typeof settings>): StoreSettings {
  return {
    name: row.name,
    legalName: row.legalName,
    tagline: row.tagline,
    description: row.description,
    url: row.url,
    email: row.email,
    phone: row.phone,
    address: row.address,
    currency: row.currency,
    locale: row.locale,
    freeShippingThreshold: row.freeShippingThreshold,
    standardShippingRate: row.standardShippingRate,
    taxRate: row.taxRate,
    returnWindowDays: row.returnWindowDays,
    deliveryDaysMin: row.deliveryDaysMin,
    deliveryDaysMax: row.deliveryDaysMax,
    reviewRequestDelayDays: row.reviewRequestDelayDays,
    social: row.social,
    announcements: row.announcements,
    marqueeItems: row.marqueeItems,
    homeNewArrivalsCount: row.homeNewArrivalsCount,
    servicePromises: row.servicePromises,
    shippingReturnsCopy: row.shippingReturnsCopy,
    maintenanceMode: row.maintenanceMode,
  };
}

export function fromSettings(value: StoreSettings): Insert<typeof settings> {
  return {
    // Pinned by a check constraint. Spelled out so an insert cannot land on a second row.
    id: 1,
    name: value.name,
    legalName: value.legalName,
    tagline: value.tagline,
    description: value.description,
    url: value.url,
    email: value.email,
    phone: value.phone,
    address: value.address,
    currency: value.currency,
    locale: value.locale,
    freeShippingThreshold: value.freeShippingThreshold,
    standardShippingRate: value.standardShippingRate,
    taxRate: value.taxRate,
    returnWindowDays: value.returnWindowDays,
    deliveryDaysMin: value.deliveryDaysMin,
    deliveryDaysMax: value.deliveryDaysMax,
    reviewRequestDelayDays: value.reviewRequestDelayDays,
    social: value.social,
    announcements: value.announcements,
    marqueeItems: value.marqueeItems,
    homeNewArrivalsCount: value.homeNewArrivalsCount,
    servicePromises: value.servicePromises,
    shippingReturnsCopy: value.shippingReturnsCopy,
    maintenanceMode: value.maintenanceMode,
  };
}

export function toAdmin(row: Row<typeof admins>): AdminUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    passwordHash: row.passwordHash,
    passwordSalt: row.passwordSalt,
    createdAt: iso(row.createdAt),
    lastLoginAt: isoOptional(row.lastLoginAt),
    disabled: row.disabled,
  };
}

export function fromAdmin(admin: AdminUser): Insert<typeof admins> {
  return {
    id: admin.id,
    // Lower-cased here as well as at the call site: the unique index is only a
    // uniqueness guarantee if every writer normalises the same way.
    email: admin.email.trim().toLowerCase(),
    name: admin.name,
    role: admin.role,
    passwordHash: admin.passwordHash,
    passwordSalt: admin.passwordSalt,
    createdAt: date(admin.createdAt, "createdAt"),
    lastLoginAt: dateOptional(admin.lastLoginAt, "lastLoginAt"),
    disabled: admin.disabled ?? false,
  };
}

/* ------------------------------------------------------------------ */
/* Customer accounts                                                   */
/* ------------------------------------------------------------------ */

export function toCustomer(row: Row<typeof customers>): CustomerAccount {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    email: optional(row.email),
    passwordHash: row.passwordHash,
    passwordSalt: row.passwordSalt,
    authUserId: optional(row.authUserId),
    phoneVerifiedAt: iso(row.phoneVerifiedAt),
    createdAt: iso(row.createdAt),
    lastLoginAt: isoOptional(row.lastLoginAt),
    disabled: row.disabled,
  };
}

export function fromCustomer(customer: CustomerAccount): Insert<typeof customers> {
  return {
    id: customer.id,
    /*
     * Normalised here as well as at the call site, for the reason `fromAdmin`
     * lower-cases an email: a unique index only guarantees uniqueness if every writer
     * agrees on the spelling. An unparseable number would defeat that silently, so it
     * is refused rather than stored as typed — this is a write path, and a row that
     * cannot be looked up again is worse than a failed insert.
     */
    phone: requirePhone(customer.phone),
    name: customer.name.trim(),
    email: customer.email?.trim().toLowerCase() || null,
    passwordHash: customer.passwordHash,
    passwordSalt: customer.passwordSalt,
    authUserId: customer.authUserId ?? null,
    phoneVerifiedAt: date(customer.phoneVerifiedAt, "phoneVerifiedAt"),
    createdAt: date(customer.createdAt, "createdAt"),
    lastLoginAt: dateOptional(customer.lastLoginAt, "lastLoginAt"),
    disabled: customer.disabled ?? false,
  };
}

/**
 * A number in its canonical form, or a thrown error naming the field.
 *
 * The same shape as `date` above and for the same reason: a value that cannot be
 * normalised must not reach Postgres, because the column would accept it happily and
 * the account would simply never be found again.
 */
function requirePhone(value: string): string {
  const normalised = normalisePhone(value);
  if (!normalised) {
    throw new Error(`phone is not a valid mobile number: ${JSON.stringify(value)}`);
  }
  return normalised;
}

export function toPhoneVerification(
  row: Row<typeof phoneVerifications>,
): PhoneVerification {
  return {
    id: row.id,
    phone: row.phone,
    purpose: row.purpose,
    provider: row.provider,
    codeHash: optional(row.codeHash),
    codeSalt: optional(row.codeSalt),
    expiresAt: iso(row.expiresAt),
    attempts: row.attempts,
    createdAt: iso(row.createdAt),
    pendingName: optional(row.pendingName),
    pendingPasswordHash: optional(row.pendingPasswordHash),
    pendingPasswordSalt: optional(row.pendingPasswordSalt),
    pendingEmail: optional(row.pendingEmail),
  };
}

export function fromPhoneVerification(
  verification: PhoneVerification,
): Insert<typeof phoneVerifications> {
  return {
    id: verification.id,
    phone: requirePhone(verification.phone),
    purpose: verification.purpose,
    provider: verification.provider,
    codeHash: verification.codeHash ?? null,
    codeSalt: verification.codeSalt ?? null,
    expiresAt: date(verification.expiresAt, "expiresAt"),
    attempts: verification.attempts,
    createdAt: date(verification.createdAt, "createdAt"),
    pendingName: verification.pendingName ?? null,
    pendingPasswordHash: verification.pendingPasswordHash ?? null,
    pendingPasswordSalt: verification.pendingPasswordSalt ?? null,
    pendingEmail: verification.pendingEmail ?? null,
  };
}

export function toSubmittedReview(
  row: Row<typeof submittedReviews>,
): SubmittedReview {
  return {
    id: row.id,
    productSlug: row.productSlug,
    customerId: row.customerId,
    orderId: row.orderId,
    author: row.author,
    rating: row.rating,
    fit: row.fit,
    reasons: row.reasons,
    body: row.body,
    createdAt: iso(row.createdAt),
  };
}

export function fromSubmittedReview(
  review: SubmittedReview,
): Insert<typeof submittedReviews> {
  return {
    id: review.id,
    productSlug: review.productSlug,
    customerId: review.customerId,
    orderId: review.orderId,
    author: review.author,
    rating: review.rating,
    fit: review.fit,
    reasons: review.reasons,
    body: review.body,
    createdAt: date(review.createdAt, "createdAt"),
  };
}

export function toAuditEntry(row: Row<typeof auditLog>): AuditEntry {
  return {
    id: row.id,
    at: iso(row.at),
    actorId: row.actorId,
    actorEmail: row.actorEmail,
    action: row.action,
    entity: row.entity,
    entityId: row.entityId,
    summary: row.summary,
  };
}

export function fromAuditEntry(entry: AuditEntry): Insert<typeof auditLog> {
  return {
    id: entry.id,
    at: date(entry.at, "at"),
    actorId: entry.actorId,
    actorEmail: entry.actorEmail,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    summary: entry.summary,
  };
}

/* ------------------------------------------------------------------ */
/* Email                                                               */
/* ------------------------------------------------------------------ */

export function toEmailTemplate(row: Row<typeof emailTemplates>): EmailTemplate {
  return {
    key: row.key,
    enabled: row.enabled,
    subject: row.subject,
    heading: row.heading,
    body: row.body,
  };
}

export function fromEmailTemplate(
  template: EmailTemplate,
): Insert<typeof emailTemplates> {
  return {
    key: template.key,
    enabled: template.enabled,
    subject: template.subject,
    heading: template.heading,
    body: template.body,
  };
}

export function toEmailRecord(row: Row<typeof emailLog>): EmailRecord {
  return {
    id: row.id,
    at: iso(row.at),
    to: row.to,
    subject: row.subject,
    /*
     * Null, not undefined. A one-off admin message genuinely has no template, and
     * `optional()` would collapse that into an absent key — which reads as "unknown"
     * rather than "there was never one".
     */
    templateKey: row.templateKey ?? null,
    orderId: optional(row.orderId),
    status: row.status,
    error: optional(row.error),
  };
}

export function fromEmailRecord(record: EmailRecord): Insert<typeof emailLog> {
  return {
    id: record.id,
    at: date(record.at, "at"),
    to: record.to,
    subject: record.subject,
    templateKey: record.templateKey,
    orderId: record.orderId ?? null,
    status: record.status,
    error: record.error ?? null,
  };
}
