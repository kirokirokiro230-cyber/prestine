import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Product, ProductStatus } from "@/lib/types";
import { slugify } from "@/lib/utils";
import { getDb, isDatabaseConfigured } from "../db/client";
import { fromProduct, toProduct } from "../db/mappers";
import {
  productColors,
  productCollections,
  products as productsTable,
  productSizes,
} from "../db/schema";
import { mutateStore, readStore } from "../store";

/**
 * Product persistence.
 *
 * Every write goes through here so invariants hold in one place: slugs stay
 * unique and timestamps are maintained.
 *
 * There is no inventory. The shop does not track stock, so nothing here reserves,
 * releases or counts units — a size is a label a customer can always choose.
 *
 * Two backends, chosen by whether a database is configured — see `login-attempts.ts`
 * for the precedent. Against Postgres, a product's colours/sizes/collection
 * memberships live in child tables (see `schema.ts`), assembled via `toProduct` and
 * split via `fromProduct` (see `mappers.ts`) — every write to those children happens
 * inside a transaction so a product and its rows change atomically, the same
 * guarantee the JSON store gets for free from its write queue.
 */

export interface AdminProductQuery {
  search?: string;
  status?: ProductStatus | "all";
  category?: string;
  collection?: string;
  sort?: "updated-desc" | "created-desc" | "name-asc" | "price-asc" | "price-desc";
  page?: number;
  perPage?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

/** Load every child row for a set of product ids and assemble full `Product`s. */
async function assembleProducts(
  db: ReturnType<typeof getDb>,
  rows: (typeof productsTable.$inferSelect)[],
): Promise<Product[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);

  const [colors, sizes, memberships] = await Promise.all([
    db.select().from(productColors).where(inArray(productColors.productId, ids)),
    db.select().from(productSizes).where(inArray(productSizes.productId, ids)),
    db.select().from(productCollections).where(inArray(productCollections.productId, ids)),
  ]);

  return rows.map((row) =>
    toProduct(
      row,
      colors.filter((c) => c.productId === row.id),
      sizes.filter((s) => s.productId === row.id),
      memberships.filter((m) => m.productId === row.id),
    ),
  );
}

export async function listProducts(): Promise<Product[]> {
  if (!isDatabaseConfigured()) {
    return (await readStore()).products;
  }

  const db = getDb();
  const rows = await db.select().from(productsTable);
  return assembleProducts(db, rows);
}

/** Products the storefront may show. */
export async function listActiveProducts(): Promise<Product[]> {
  if (!isDatabaseConfigured()) {
    const { products } = await readStore();
    // A missing status means a seeded product from before the field existed.
    return products.filter((product) => (product.status ?? "active") === "active");
  }

  const db = getDb();
  const rows = await db.select().from(productsTable).where(eq(productsTable.status, "active"));
  return assembleProducts(db, rows);
}

export async function getProduct(id: string): Promise<Product | undefined> {
  if (!isDatabaseConfigured()) {
    return (await readStore()).products.find((product) => product.id === id);
  }

  const db = getDb();
  const [row] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!row) return undefined;
  const [assembled] = await assembleProducts(db, [row]);
  return assembled;
}

export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  if (!isDatabaseConfigured()) {
    return (await readStore()).products.find((product) => product.slug === slug);
  }

  const db = getDb();
  const [row] = await db.select().from(productsTable).where(eq(productsTable.slug, slug));
  if (!row) return undefined;
  const [assembled] = await assembleProducts(db, [row]);
  return assembled;
}

/** Filtered, sorted and paginated list for the admin table. */
export async function queryProducts(
  query: AdminProductQuery = {},
): Promise<Paginated<Product>> {
  const {
    search,
    status = "all",
    category,
    collection,
    sort = "updated-desc",
    page = 1,
    perPage = 20,
  } = query;

  const needle = search?.trim().toLowerCase();

  // Both backends filter/sort/paginate in application code over the full set. The
  // catalogue is small enough (low thousands at most) that this stays fast, and it
  // keeps the search behaviour — a haystack across name/slug/sku/tagline/category/
  // colour names — identical on both backends rather than re-deriving it in SQL.
  const all = !isDatabaseConfigured() ? (await readStore()).products : await listProducts();

  let items = all.filter((product) => {
    if (status !== "all" && (product.status ?? "active") !== status) return false;
    if (category && product.category !== category) return false;
    if (collection && !product.collections.includes(collection)) return false;
    if (needle) {
      const haystack = [
        product.name,
        product.slug,
        product.sku ?? "",
        product.tagline,
        product.category,
        product.colors.map((color) => color.name).join(" "),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  items = [...items].sort((a, b) => {
    switch (sort) {
      case "created-desc":
        return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
      case "name-asc":
        return a.name.localeCompare(b.name);
      case "price-asc":
        return a.price - b.price;
      case "price-desc":
        return b.price - a.price;
      case "updated-desc":
      default:
        return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
    }
  });

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);

  return {
    items: items.slice((safePage - 1) * perPage, safePage * perPage),
    total,
    page: safePage,
    perPage,
    totalPages,
  };
}

/* ------------------------------------------------------------------ */
/* Writes                                                             */
/* ------------------------------------------------------------------ */

/** Everything a caller may set. Ids and timestamps are managed here. */
export type ProductInput = Omit<
  Product,
  "id" | "rating" | "reviewCount" | "createdAt" | "updatedAt"
> & {
  rating?: number;
  reviewCount?: number;
};

/**
 * Make a slug unique within the catalogue.
 *
 * Appends `-2`, `-3` and so on rather than rejecting, because a merchant
 * duplicating "Cashmere Crew" should not have to invent a slug by hand.
 */
function uniqueSlug(
  existingSlugs: { slug: string; id: string }[],
  desired: string,
  ignoreId?: string,
): string {
  const base = slugify(desired) || "product";
  let candidate = base;
  let suffix = 2;

  const taken = (value: string) =>
    existingSlugs.some((product) => product.slug === value && product.id !== ignoreId);

  while (taken(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function nextProductIdFrom(ids: string[]): string {
  // Keep the readable p-0NN sequence the seed data uses.
  const highest = ids.reduce((max, id) => {
    const numeric = Number(id.replace(/\D/g, ""));
    return Number.isFinite(numeric) ? Math.max(max, numeric) : max;
  }, 0);
  return `p-${String(highest + 1).padStart(3, "0")}`;
}

/** Replace a product's colours, sizes and collection memberships inside a transaction. */
async function writeProductChildren(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  productId: string,
  rows: ReturnType<typeof fromProduct>,
): Promise<void> {
  await tx.delete(productColors).where(eq(productColors.productId, productId));
  await tx.delete(productSizes).where(eq(productSizes.productId, productId));
  await tx.delete(productCollections).where(eq(productCollections.productId, productId));

  if (rows.colors.length > 0) await tx.insert(productColors).values(rows.colors);
  if (rows.sizes.length > 0) await tx.insert(productSizes).values(rows.sizes);
  if (rows.memberships.length > 0) {
    await tx.insert(productCollections).values(rows.memberships);
  }
}

export async function createProduct(input: ProductInput): Promise<Product> {
  if (!isDatabaseConfigured()) {
    return mutateStore((store) => {
      const now = new Date().toISOString();
      const id = nextProductIdFrom(store.products.map((p) => p.id));

      const product: Product = {
        ...input,
        id,
        slug: uniqueSlug(store.products, input.slug || input.name),
        rating: input.rating ?? 0,
        reviewCount: input.reviewCount ?? 0,
        status: input.status ?? "draft",
        taxable: input.taxable ?? true,
        createdAt: now,
        updatedAt: now,
      };

      store.products.push(product);
      return product;
    });
  }

  return getDb().transaction(async (tx) => {
    const existing = await tx.select({ id: productsTable.id, slug: productsTable.slug }).from(productsTable);
    const now = new Date().toISOString();
    const id = nextProductIdFrom(existing.map((row) => row.id));

    const product: Product = {
      ...input,
      id,
      slug: uniqueSlug(existing, input.slug || input.name),
      rating: input.rating ?? 0,
      reviewCount: input.reviewCount ?? 0,
      status: input.status ?? "draft",
      taxable: input.taxable ?? true,
      createdAt: now,
      updatedAt: now,
    };

    const rows = fromProduct(product);
    await tx.insert(productsTable).values(rows.product);
    await writeProductChildren(tx, id, rows);

    return product;
  });
}

export async function updateProduct(
  id: string,
  patch: Partial<ProductInput>,
): Promise<Product> {
  if (!isDatabaseConfigured()) {
    return mutateStore((store) => {
      const index = store.products.findIndex((product) => product.id === id);
      if (index === -1) throw new Error(`Product ${id} not found`);

      const current = store.products[index];
      const next: Product = {
        ...current,
        ...patch,
        id: current.id,
        slug: patch.slug ? uniqueSlug(store.products, patch.slug, id) : current.slug,
        updatedAt: new Date().toISOString(),
      };

      store.products[index] = next;
      return next;
    });
  }

  return getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(productsTable).where(eq(productsTable.id, id));
    if (!row) throw new Error(`Product ${id} not found`);

    const [colors, sizes, memberships] = await Promise.all([
      tx.select().from(productColors).where(eq(productColors.productId, id)),
      tx.select().from(productSizes).where(eq(productSizes.productId, id)),
      tx.select().from(productCollections).where(eq(productCollections.productId, id)),
    ]);
    const current = toProduct(row, colors, sizes, memberships);

    let slug = current.slug;
    if (patch.slug) {
      const existing = await tx
        .select({ id: productsTable.id, slug: productsTable.slug })
        .from(productsTable);
      slug = uniqueSlug(existing, patch.slug, id);
    }

    const next: Product = {
      ...current,
      ...patch,
      id: current.id,
      slug,
      updatedAt: new Date().toISOString(),
    };

    const rows = fromProduct(next);
    await tx.update(productsTable).set(rows.product).where(eq(productsTable.id, id));
    await writeProductChildren(tx, id, rows);

    return next;
  });
}

export async function setProductStatus(
  ids: string[],
  status: ProductStatus,
): Promise<number> {
  if (!isDatabaseConfigured()) {
    return mutateStore((store) => {
      let changed = 0;
      const now = new Date().toISOString();

      for (const product of store.products) {
        if (!ids.includes(product.id)) continue;
        if ((product.status ?? "active") === status) continue;
        product.status = status;
        product.updatedAt = now;
        changed += 1;
      }

      return changed;
    });
  }

  if (ids.length === 0) return 0;

  const db = getDb();
  const result = await db
    .update(productsTable)
    .set({ status, updatedAt: new Date() })
    .where(and(inArray(productsTable.id, ids), sql`${productsTable.status} is distinct from ${status}`))
    .returning({ id: productsTable.id });

  return result.length;
}

export async function deleteProducts(ids: string[]): Promise<number> {
  if (!isDatabaseConfigured()) {
    return mutateStore((store) => {
      const before = store.products.length;
      store.products = store.products.filter((product) => !ids.includes(product.id));

      // Clean up dangling cross-sell references so the storefront never links to a
      // product that no longer exists.
      for (const product of store.products) {
        if (!product.pairsWith?.length) continue;
        product.pairsWith = product.pairsWith.filter((slug) =>
          store.products.some((candidate) => candidate.slug === slug),
        );
      }

      return before - store.products.length;
    });
  }

  if (ids.length === 0) return 0;

  return getDb().transaction(async (tx) => {
    // Child rows cascade on delete (schema.ts), so removing the product rows is enough.
    const deleted = await tx
      .delete(productsTable)
      .where(inArray(productsTable.id, ids))
      .returning({ slug: productsTable.slug });
    const removedSlugs = new Set(deleted.map((row) => row.slug));
    if (removedSlugs.size === 0) return 0;

    // Clean up dangling cross-sell references so the storefront never links to a
    // product that no longer exists.
    const remaining = await tx.select({ id: productsTable.id, pairsWith: productsTable.pairsWith }).from(productsTable);
    for (const product of remaining) {
      if (!product.pairsWith?.some((slug) => removedSlugs.has(slug))) continue;
      await tx
        .update(productsTable)
        .set({ pairsWith: product.pairsWith.filter((slug) => !removedSlugs.has(slug)) })
        .where(eq(productsTable.id, product.id));
    }

    return removedSlugs.size;
  });
}

/** Copy a product as a draft, with a fresh id, slug and name. */
export async function duplicateProduct(id: string): Promise<Product> {
  if (!isDatabaseConfigured()) {
    return mutateStore((store) => {
      const source = store.products.find((product) => product.id === id);
      if (!source) throw new Error(`Product ${id} not found`);

      const now = new Date().toISOString();
      const copy: Product = {
        ...structuredClone(source),
        id: nextProductIdFrom(store.products.map((p) => p.id)),
        name: `${source.name} (copy)`,
        slug: uniqueSlug(store.products, `${source.slug}-copy`),
        // A duplicate starts unpublished and unrated — it is a new product.
        status: "draft",
        rating: 0,
        reviewCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      store.products.push(copy);
      return copy;
    });
  }

  return getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(productsTable).where(eq(productsTable.id, id));
    if (!row) throw new Error(`Product ${id} not found`);

    const [colors, sizes, memberships] = await Promise.all([
      tx.select().from(productColors).where(eq(productColors.productId, id)),
      tx.select().from(productSizes).where(eq(productSizes.productId, id)),
      tx.select().from(productCollections).where(eq(productCollections.productId, id)),
    ]);
    const source = toProduct(row, colors, sizes, memberships);

    const existing = await tx.select({ id: productsTable.id, slug: productsTable.slug }).from(productsTable);
    const now = new Date().toISOString();

    const copy: Product = {
      ...structuredClone(source),
      id: nextProductIdFrom(existing.map((r) => r.id)),
      name: `${source.name} (copy)`,
      slug: uniqueSlug(existing, `${source.slug}-copy`),
      status: "draft",
      rating: 0,
      reviewCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    const rows = fromProduct(copy);
    await tx.insert(productsTable).values(rows.product);
    await writeProductChildren(tx, copy.id, rows);

    return copy;
  });
}

/** Random id for entities that do not need a readable sequence. */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}
