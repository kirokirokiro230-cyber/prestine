import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import seedProducts from "@/lib/data/products";
import {
  categories as seedCategories,
  collections as seedCollections,
  emailTemplates as seedEmailTemplates,
  promoCodes as seedPromoCodes,
  site,
} from "@/lib/config";
import { demoOrders } from "@/lib/orders";
import type {
  Banner,
  EmailTemplate,
  Product,
  StoreData,
  StoreSettings,
} from "@/lib/types";

/**
 * Server-side persistence.
 *
 * One JSON document, read once into memory and written atomically. Every read and
 * mutation in the app funnels through `readStore` and `mutateStore`.
 *
 * ---------------------------------------------------------------------------
 * IMPORTANT — hosting, and the limits of this file
 *
 * A file-backed store works locally and on a single-process host with a persistent
 * disk (a VPS, a container, Render, Railway, Fly). It does **not** work on Vercel or
 * any other serverless platform: the filesystem there is read-only and
 * per-invocation, so writes either fail or vanish between requests.
 *
 * It also assumes **one process**. The in-memory cache and the write queue below
 * serialise concurrent requests within this process; two processes would each hold
 * their own cache and last-write-wins would silently lose data. Do not run this
 * behind more than one instance, and do not enable clustering.
 *
 * Migrating to a database
 *
 * Nine modules read this file directly: the four repositories in
 * `src/server/repositories/`, plus `auth.ts`, `audit.ts` and `metrics.ts`. Nothing
 * above that layer touches it, and every one of those functions is already async, so
 * the port is contained to `src/server/` — no page, action or component changes.
 *
 * Two ways to do it, in increasing order of effort and payoff:
 *
 * 1. Keep the document shape and store it as a single row (or a KV value), swapping
 *    `load`/`persist` for a query. Smallest change, and it fixes serverless. Still
 *    rewrites the whole document per write, so it stops being sensible somewhere in
 *    the low thousands of products or orders.
 * 2. Give each collection a table and rewrite the repository bodies as queries.
 *    More work, but it lets the admin tables filter, sort and paginate in SQL instead
 *    of loading every product and order into memory to do it.
 *
 * Postgres (Neon, Supabase) or SQLite over HTTP (Turso) both fit either approach.
 * ---------------------------------------------------------------------------
 */

const STORE_VERSION = 1;

/**
 * Where the document lives.
 *
 * Resolved on each access rather than at import time so a test can point at its
 * own scratch file in `beforeAll` without having to dynamically import this
 * module afterwards. `PRESTINE_STORE_PATH` is relative to the project root.
 */
function storePath(): string {
  const override = process.env.PRESTINE_STORE_PATH;
  if (!override) return join(process.cwd(), "data", "store.json");

  /*
   * The override exists for the test suite and the reseed script, neither of which
   * runs through the bundler. `turbopackIgnore` stops the build treating this as
   * dynamic filesystem access — without it, Turbopack traces the entire project
   * into the server output because it cannot prove which paths are reachable.
   */
  return join(/* turbopackIgnore: true */ process.cwd(), override);
}

/**
 * In-process cache.
 *
 * Held as a promise so concurrent requests during a cold start share one read
 * instead of each seeding their own copy.
 */
let cache: Promise<StoreData> | null = null;

/** Serialises writes so two concurrent mutations cannot clobber each other. */
let writeQueue: Promise<unknown> = Promise.resolve();

/* ------------------------------------------------------------------ */
/* Seeding                                                             */
/* ------------------------------------------------------------------ */

function defaultSettings(): StoreSettings {
  return {
    name: site.name,
    legalName: site.legalName,
    tagline: site.tagline,
    description: site.description,
    url: process.env.NEXT_PUBLIC_SITE_URL ?? site.url,
    email: site.email,
    phone: site.phone,
    address: site.address,
    currency: site.currency,
    locale: site.locale,
    freeShippingThreshold: site.freeShippingThreshold,
    standardShippingRate: 900,
    taxRate: site.taxRate,
    returnWindowDays: site.returnWindowDays,
    deliveryDaysMin: 3,
    deliveryDaysMax: 5,
    /*
     * Five days: long enough that the garment has been worn, short enough that the
     * purchase is still recent enough to have an opinion about.
     */
    reviewRequestDelayDays: 5,
    social: { ...site.social },
    announcements: [
      "Complimentary shipping on orders over $200",
      "30-day returns, collected from your door",
      "Free monogramming on knitwear and leather goods",
    ],
    /*
     * These three lists were hardcoded in the components that render them — the
     * marquee in `page.tsx`, the service promises in the footer *and* the product
     * panel, the shipping copy in the product page tabs. A merchant could not change
     * a delivery promise without a deploy, and the same sentence existed in three
     * files that could drift apart.
     */
    marqueeItems: [
      "Italian double-faced wool",
      "Grade-A Mongolian cashmere",
      "Okayama selvedge denim",
      "European flax linen",
      "Northampton bridle leather",
      "GOTS organic cotton",
    ],
    homeNewArrivalsCount: 4,
    servicePromises: [
      {
        title: "Complimentary shipping",
        body: "On all orders over $200, carbon-neutral by default.",
      },
      {
        title: "30-day returns",
        body: "Collected from your door, refunded within three working days.",
      },
      {
        title: "Repairs for life",
        body: "Free repairs on every piece we make, for as long as you own it.",
      },
    ],
    shippingReturnsCopy: [
      "Standard delivery is complimentary on orders over $200 and arrives in 3–5 business days, tracked and carbon-neutral. Express and nominated-day options are offered at checkout.",
      "Returns are free within 30 days. Book a collection from your door in your account, or use any drop-off point. Refunds are issued within three working days of the parcel reaching us.",
    ],
    maintenanceMode: false,

  };
}

/** Give a seeded product the fields the admin panel expects. */
function withAdminDefaults(product: Product): Product {
  const created = new Date(product.releasedAt).toISOString();
  return {
    ...product,
    status: product.status ?? "active",
    sku: product.sku ?? skuFor(product),
    // Seeded margins are illustrative; a merchant sets real cost on the product.
    costPrice: product.costPrice ?? Math.round(product.price * 0.38),
    weightGrams: product.weightGrams ?? weightFor(product),
    taxable: product.taxable ?? true,
    createdAt: product.createdAt ?? created,
    updatedAt: product.updatedAt ?? created,
  };
}

/** PRS-OUT-001 style reference derived from the category and id. */
function skuFor(product: Product): string {
  const prefix = product.category.slice(0, 3).toUpperCase();
  const number = product.id.replace(/\D/g, "").padStart(3, "0");
  return `PRS-${prefix}-${number}`;
}

/** Rough shipping weights by category, so rate calculation has something real. */
function weightFor(product: Product): number {
  const byCategory: Record<string, number> = {
    outerwear: 1800,
    knitwear: 600,
    shirts: 320,
    tees: 220,
    trousers: 520,
    denim: 700,
    dresses: 400,
    accessories: 260,
  };
  return byCategory[product.category] ?? 400;
}

/**
 * Starter hero slides.
 *
 * No image URLs, so they render as generated gradients — the same "never show a
 * broken image" rule as the product artwork. Replace the copy and add photography
 * from Admin → Banners; these exist so the home page is not empty on a fresh
 * install.
 */
function seedBanners(): Banner[] {
  const now = new Date().toISOString();

  return [
    {
      id: "ban_seed0001",
      eyebrow: "Autumn / Winter 2026",
      heading: "Clothing made to outlast the season.",
      body: "Small-batch pieces in natural fibres, cut in London and made in family-run European mills.",
      ctaLabel: "Shop new arrivals",
      ctaHref: "/collections/new-arrivals",
      accentHex: "#B08D63",
      textTone: "light",
      align: "left",
      active: true,
      position: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "ban_seed0002",
      eyebrow: "The Essentials",
      heading: "Twelve pieces that carry a whole wardrobe.",
      body: "Never discounted, never discontinued, restocked in the same colours season after season.",
      ctaLabel: "Shop the Essentials",
      ctaHref: "/collections/essentials",
      accentHex: "#3C4A3C",
      textTone: "light",
      align: "left",
      active: true,
      position: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "ban_seed0003",
      eyebrow: "Repairs for life",
      heading: "Free repairs, for as long as you own it.",
      body: "A seam, a button, a moth. Send it back and we will put it right.",
      ctaLabel: "More about us",
      ctaHref: "/about",
      accentHex: "#2C3A55",
      textTone: "light",
      align: "center",
      active: true,
      position: 2,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function seed(): StoreData {
  return {
    version: STORE_VERSION,
    products: seedProducts.map(withAdminDefaults),
    banners: seedBanners(),
    categories: seedCategories.map((category, index) => ({
      ...category,
      position: index,
    })),
    collections: seedCollections.map((collection, index) => ({
      ...collection,
      position: index,
    })),
    promoCodes: [...seedPromoCodes],
    settings: defaultSettings(),
    // Sample history so the dashboard and order screens have real content on a
    // fresh install. Delete these from the admin panel once live orders arrive.
    orders: [...demoOrders],
    admins: [],
    /*
     * No seeded shoppers, for the same reason there is no seeded admin: an account
     * whose password is in the repository is an account nobody changes. Customers
     * arrive through `/signup`, which is the only thing that writes here.
     */
    customers: [],
    phoneVerifications: [],
    hiddenReviewIds: [],
    submittedReviews: [],
    audit: [],
    emailTemplates: seedEmailTemplates.map((template) => ({ ...template })),
    emailLog: [],
  };
}

/* ------------------------------------------------------------------ */
/* Read / write                                                        */
/* ------------------------------------------------------------------ */

async function load(): Promise<StoreData> {
  try {
    // See `storePath` for why these calls are marked ignored for tracing.
    const raw = await readFile(/* turbopackIgnore: true */ storePath(), "utf8");
    const parsed = JSON.parse(raw) as StoreData;

    if (parsed.version !== STORE_VERSION) return migrate(parsed);

    // Merge in any settings key added since the file was written, so a new
    // release never reads `undefined` for a field it expects.
    return {
      ...seed(),
      ...parsed,
      settings: { ...defaultSettings(), ...parsed.settings },
      /*
       * Same reasoning as the settings merge, one level deeper. A release that adds an
       * email template key would otherwise never surface it: the stored array is present,
       * so it wins the spread wholesale and the new event silently has no copy and never
       * sends. Merging by key keeps whatever the merchant has edited and fills the gap.
       */
      emailTemplates: mergeEmailTemplates(parsed.emailTemplates),
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      // A corrupt or unreadable store is worth shouting about rather than
      // silently resetting someone's catalogue.
      console.error("[store] could not read store file, seeding fresh:", error);
    }

    const fresh = seed();
    await persist(fresh);
    return fresh;
  }
}

/**
 * Stored templates, plus any seeded key the stored set has never heard of.
 *
 * Merchant edits always win. Order follows the seed so the admin panel lists the events
 * in lifecycle order rather than in whatever order they happened to be written.
 */
function mergeEmailTemplates(stored: EmailTemplate[] | undefined): EmailTemplate[] {
  if (!stored?.length) return seedEmailTemplates.map((template) => ({ ...template }));

  const byKey = new Map(stored.map((template) => [template.key, template]));
  return seedEmailTemplates.map((seeded) => byKey.get(seeded.key) ?? { ...seeded });
}

/** Forward-migrate an older document. Only one version so far. */
function migrate(data: StoreData): StoreData {
  return { ...seed(), ...data, version: STORE_VERSION };
}

/**
 * Write to a temporary file and rename over the target.
 *
 * Rename is atomic on the same filesystem, so a crash mid-write leaves the
 * previous store intact rather than a truncated file.
 */
async function persist(data: StoreData): Promise<void> {
  const target = storePath();
  await mkdir(/* turbopackIgnore: true */ dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(/* turbopackIgnore: true */ temporary, JSON.stringify(data, null, 2), "utf8");
  await rename(/* turbopackIgnore: true */ temporary, target);
}

/** Read the whole store. Cached for the lifetime of the process. */
export async function readStore(): Promise<StoreData> {
  cache ??= load();
  return cache;
}

/**
 * Apply a mutation and persist the result.
 *
 * Mutations are queued so concurrent admin requests serialise, and the mutator
 * receives a deep copy — a thrown error therefore leaves the cached store
 * untouched rather than half-modified.
 */
export async function mutateStore<T>(
  mutator: (data: StoreData) => T | Promise<T>,
): Promise<T> {
  const run = async (): Promise<T> => {
    const current = await readStore();
    const draft = structuredClone(current);

    const result = await mutator(draft);

    cache = Promise.resolve(draft);
    await persist(draft);
    return result;
  };

  const queued = writeQueue.then(run, run);
  // Keep the chain alive even if this mutation rejects.
  writeQueue = queued.catch(() => undefined);
  return queued;
}

/** Drop the in-process cache. Used by tests and the reseed script. */
export function resetStoreCache(): void {
  cache = null;
}

/** Replace the entire document. Used by the reseed script only. */
export async function overwriteStore(data: StoreData): Promise<void> {
  cache = Promise.resolve(data);
  await persist(data);
}

export { STORE_VERSION, seed, storePath };
