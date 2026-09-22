import { asc, count as sqlCount, eq } from "drizzle-orm";
import type { Category, Collection, SilhouetteKey } from "@/lib/types";
import { slugify } from "@/lib/utils";
import { getDb, isDatabaseConfigured } from "../db/client";
import { fromCategory, fromCollection, toCategory, toCollection } from "../db/mappers";
import {
  categories as categoriesTable,
  collections as collectionsTable,
  productCollections,
  products as productsTable,
} from "../db/schema";
import { mutateStore, readStore } from "../store";

/**
 * Categories and collections.
 *
 * Both are editable, so both carry the same guards: unique slugs, and a refusal to
 * delete anything still attached to a product. Deleting a category silently would
 * orphan products into a section that no longer exists.
 *
 * Two backends, chosen by whether a database is configured — see `login-attempts.ts`
 * for the precedent. The JSON-store path stays exact for local development and the
 * test suite; the database path uses the same mappers `scripts/seed-database.ts`
 * already relies on, so nothing here can drift from the schema those write.
 */

export async function listCategories(): Promise<Category[]> {
  if (!isDatabaseConfigured()) {
    const { categories } = await readStore();
    return [...categories].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }

  const rows = await getDb()
    .select()
    .from(categoriesTable)
    .orderBy(asc(categoriesTable.position));
  return rows.map(toCategory);
}

export async function listCollections(): Promise<Collection[]> {
  if (!isDatabaseConfigured()) {
    const { collections } = await readStore();
    return [...collections].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }

  const rows = await getDb()
    .select()
    .from(collectionsTable)
    .orderBy(asc(collectionsTable.position));
  return rows.map(toCollection);
}

export async function getCategory(slug: string): Promise<Category | undefined> {
  if (!isDatabaseConfigured()) {
    return (await readStore()).categories.find((category) => category.slug === slug);
  }

  const [row] = await getDb()
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.slug, slug));
  return row ? toCategory(row) : undefined;
}

export async function getCollection(slug: string): Promise<Collection | undefined> {
  if (!isDatabaseConfigured()) {
    return (await readStore()).collections.find((collection) => collection.slug === slug);
  }

  const [row] = await getDb()
    .select()
    .from(collectionsTable)
    .where(eq(collectionsTable.slug, slug));
  return row ? toCollection(row) : undefined;
}

/** How many products reference each category, for the admin list. */
export async function categoryUsage(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  if (!isDatabaseConfigured()) {
    const { products } = await readStore();
    for (const product of products) {
      counts[product.category] = (counts[product.category] ?? 0) + 1;
    }
    return counts;
  }

  const rows = await getDb().select({ category: productsTable.category }).from(productsTable);
  for (const row of rows) {
    counts[row.category] = (counts[row.category] ?? 0) + 1;
  }
  return counts;
}

export async function collectionUsage(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  if (!isDatabaseConfigured()) {
    const { products } = await readStore();
    for (const product of products) {
      for (const slug of product.collections) {
        counts[slug] = (counts[slug] ?? 0) + 1;
      }
    }
    return counts;
  }

  const rows = await getDb()
    .select({ collectionSlug: productCollections.collectionSlug })
    .from(productCollections);
  for (const row of rows) {
    counts[row.collectionSlug] = (counts[row.collectionSlug] ?? 0) + 1;
  }
  return counts;
}

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

export interface CategoryInput {
  slug?: string;
  name: string;
  blurb: string;
  /** Tile photography. Omit to fall back to generated artwork. */
  imageUrl?: string;
  /** Landscape recrop for the two double-width tiles. Omit to reuse `imageUrl`. */
  imageUrlWide?: string;
}

/**
 * Silhouette keys the generated artwork knows how to draw.
 *
 * Mirrors `SILHOUETTES` in `components/product/garment-art.tsx`. Kept here rather than
 * imported because that module is a client component and this runs on the server.
 */
const SILHOUETTE_KEYS: SilhouetteKey[] = [
  "coat",
  "sweater",
  "shirt",
  "tee",
  "trouser",
  "jean",
  "dress",
  "accessory",
  "bag",
  "belt",
  "scarf",
  "beanie",
];

/**
 * Guess a silhouette from the category name.
 *
 * The merchant is no longer asked for this. It only affects generated placeholder art,
 * and even then only for seeded categories — `silhouetteFor()` resolves it from the
 * static config, not from the store — so asking for it was a control that could not
 * change anything. A guess from the slug, falling back to `accessory`, keeps the column
 * populated without pretending the choice matters.
 */
function guessSilhouette(source: string): SilhouetteKey {
  const haystack = source.toLowerCase();
  return SILHOUETTE_KEYS.find((key) => haystack.includes(key)) ?? "accessory";
}

export async function createCategory(input: CategoryInput): Promise<Category> {
  if (!isDatabaseConfigured()) {
    return mutateStore((store) => {
      const slug = uniqueSlug(
        store.categories.map((category) => category.slug),
        input.slug || input.name,
      );

      const category: Category = {
        slug,
        name: input.name,
        blurb: input.blurb,
        imageUrl: input.imageUrl || undefined,
        imageUrlWide: input.imageUrlWide || undefined,
        silhouette: guessSilhouette(`${input.name} ${slug}`),
        position: store.categories.length,
      };

      store.categories.push(category);
      return category;
    });
  }

  return getDb().transaction(async (tx) => {
    const existing = await tx.select({ slug: categoriesTable.slug }).from(categoriesTable);
    const slug = uniqueSlug(existing.map((row) => row.slug), input.slug || input.name);

    const category: Category = {
      slug,
      name: input.name,
      blurb: input.blurb,
      imageUrl: input.imageUrl || undefined,
      imageUrlWide: input.imageUrlWide || undefined,
      silhouette: guessSilhouette(`${input.name} ${slug}`),
      position: existing.length,
    };

    await tx.insert(categoriesTable).values(fromCategory(category));
    return category;
  });
}

export async function updateCategory(
  slug: string,
  patch: Partial<CategoryInput>,
): Promise<Category> {
  if (!isDatabaseConfigured()) {
    return mutateStore((store) => {
      const category = store.categories.find((entry) => entry.slug === slug);
      if (!category) throw new Error(`Category ${slug} not found`);

      // Renaming the slug has to carry every product with it, or they vanish from
      // their own category page.
      if (patch.slug && patch.slug !== slug) {
        const nextSlug = uniqueSlug(
          store.categories.filter((entry) => entry.slug !== slug).map((entry) => entry.slug),
          patch.slug,
        );
        for (const product of store.products) {
          if (product.category === slug) product.category = nextSlug;
        }
        category.slug = nextSlug;
      }

      if (patch.name !== undefined) category.name = patch.name;
      if (patch.blurb !== undefined) category.blurb = patch.blurb;
      /*
       * An empty string clears the image, `undefined` leaves it alone. Without that
       * distinction a merchant could add photography but never remove it.
       */
      if (patch.imageUrl !== undefined) {
        category.imageUrl = patch.imageUrl || undefined;
      }
      if (patch.imageUrlWide !== undefined) {
        category.imageUrlWide = patch.imageUrlWide || undefined;
      }

      return category;
    });
  }

  return getDb().transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.slug, slug));
    if (!current) throw new Error(`Category ${slug} not found`);

    let nextSlug = slug;
    if (patch.slug && patch.slug !== slug) {
      const existing = (
        await tx.select({ slug: categoriesTable.slug }).from(categoriesTable)
      ).filter((row) => row.slug !== slug);
      nextSlug = uniqueSlug(existing.map((row) => row.slug), patch.slug);

      // Carry every product referencing the old slug to the new one.
      await tx
        .update(productsTable)
        .set({ category: nextSlug })
        .where(eq(productsTable.category, slug));
    }

    const next: Category = {
      slug: nextSlug,
      name: patch.name !== undefined ? patch.name : current.name,
      blurb: patch.blurb !== undefined ? patch.blurb : current.blurb,
      imageUrl:
        patch.imageUrl !== undefined
          ? patch.imageUrl || undefined
          : current.imageUrl ?? undefined,
      imageUrlWide:
        patch.imageUrlWide !== undefined
          ? patch.imageUrlWide || undefined
          : current.imageUrlWide ?? undefined,
      silhouette: current.silhouette,
      position: current.position,
    };

    if (nextSlug !== slug) {
      // The slug is the primary key: insert the renamed row, then drop the old one.
      await tx.insert(categoriesTable).values(fromCategory(next));
      await tx.delete(categoriesTable).where(eq(categoriesTable.slug, slug));
    } else {
      await tx
        .update(categoriesTable)
        .set(fromCategory(next))
        .where(eq(categoriesTable.slug, slug));
    }

    return next;
  });
}

export async function deleteCategory(slug: string): Promise<void> {
  if (!isDatabaseConfigured()) {
    await mutateStore((store) => {
      const inUse = store.products.filter((product) => product.category === slug).length;
      if (inUse > 0) {
        throw new Error(
          `${inUse} product${inUse === 1 ? "" : "s"} still use this category. Move them first.`,
        );
      }
      store.categories = store.categories.filter((category) => category.slug !== slug);
    });
    return;
  }

  const db = getDb();
  const [{ value }] = await db
    .select({ value: sqlCount(productsTable.id) })
    .from(productsTable)
    .where(eq(productsTable.category, slug));
  if (value > 0) {
    throw new Error(
      `${value} product${value === 1 ? "" : "s"} still use this category. Move them first.`,
    );
  }
  await db.delete(categoriesTable).where(eq(categoriesTable.slug, slug));
}

/* ------------------------------------------------------------------ */
/* Collections                                                         */
/* ------------------------------------------------------------------ */

export interface CollectionInput {
  slug?: string;
  name: string;
  blurb: string;
  description: string;
  hidden?: boolean;
}

export async function createCollection(input: CollectionInput): Promise<Collection> {
  if (!isDatabaseConfigured()) {
    return mutateStore((store) => {
      const slug = uniqueSlug(
        store.collections.map((collection) => collection.slug),
        input.slug || input.name,
      );

      const collection: Collection = {
        slug,
        name: input.name,
        blurb: input.blurb,
        description: input.description,
        hidden: input.hidden ?? false,
        position: store.collections.length,
      };

      store.collections.push(collection);
      return collection;
    });
  }

  return getDb().transaction(async (tx) => {
    const existing = await tx
      .select({ slug: collectionsTable.slug })
      .from(collectionsTable);
    const slug = uniqueSlug(existing.map((row) => row.slug), input.slug || input.name);

    const collection: Collection = {
      slug,
      name: input.name,
      blurb: input.blurb,
      description: input.description,
      hidden: input.hidden ?? false,
      position: existing.length,
    };

    await tx.insert(collectionsTable).values(fromCollection(collection));
    return collection;
  });
}

export async function updateCollection(
  slug: string,
  patch: Partial<CollectionInput>,
): Promise<Collection> {
  if (!isDatabaseConfigured()) {
    return mutateStore((store) => {
      const collection = store.collections.find((entry) => entry.slug === slug);
      if (!collection) throw new Error(`Collection ${slug} not found`);

      if (patch.slug && patch.slug !== slug) {
        const nextSlug = uniqueSlug(
          store.collections.filter((entry) => entry.slug !== slug).map((entry) => entry.slug),
          patch.slug,
        );
        for (const product of store.products) {
          product.collections = product.collections.map((entry) =>
            entry === slug ? nextSlug : entry,
          );
        }
        collection.slug = nextSlug;
      }

      if (patch.name !== undefined) collection.name = patch.name;
      if (patch.blurb !== undefined) collection.blurb = patch.blurb;
      if (patch.description !== undefined) collection.description = patch.description;
      if (patch.hidden !== undefined) collection.hidden = patch.hidden;

      return collection;
    });
  }

  return getDb().transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(collectionsTable)
      .where(eq(collectionsTable.slug, slug));
    if (!current) throw new Error(`Collection ${slug} not found`);

    let nextSlug = slug;
    if (patch.slug && patch.slug !== slug) {
      const existing = (
        await tx.select({ slug: collectionsTable.slug }).from(collectionsTable)
      ).filter((row) => row.slug !== slug);
      nextSlug = uniqueSlug(existing.map((row) => row.slug), patch.slug);
    }

    const next: Collection = {
      slug: nextSlug,
      name: patch.name !== undefined ? patch.name : current.name,
      blurb: patch.blurb !== undefined ? patch.blurb : current.blurb,
      description:
        patch.description !== undefined ? patch.description : current.description,
      hidden: patch.hidden !== undefined ? patch.hidden : current.hidden,
      position: current.position,
    };

    if (nextSlug !== slug) {
      // The slug is the primary key. Insert the renamed row first, then move every
      // membership across explicitly — `ON UPDATE CASCADE` only fires on an UPDATE of
      // the referenced key, not on an insert-then-delete — and only then drop the old row.
      await tx.insert(collectionsTable).values(fromCollection(next));
      await tx
        .update(productCollections)
        .set({ collectionSlug: nextSlug })
        .where(eq(productCollections.collectionSlug, slug));
      await tx.delete(collectionsTable).where(eq(collectionsTable.slug, slug));
    } else {
      await tx
        .update(collectionsTable)
        .set(fromCollection(next))
        .where(eq(collectionsTable.slug, slug));
    }

    return next;
  });
}

export async function deleteCollection(slug: string): Promise<void> {
  if (!isDatabaseConfigured()) {
    await mutateStore((store) => {
      // Unlike categories, a collection is just a tag — detaching it is safe.
      for (const product of store.products) {
        product.collections = product.collections.filter((entry) => entry !== slug);
      }
      store.collections = store.collections.filter((collection) => collection.slug !== slug);
    });
    return;
  }

  // `product_collections.collection_slug` cascades on delete (schema.ts), so removing
  // the collection row detaches every membership for free — matching the "detach, don't
  // block" behaviour the JSON-store path implements by hand.
  await getDb().delete(collectionsTable).where(eq(collectionsTable.slug, slug));
}

/** Persist a new display order from the drag-free position inputs. */
export async function reorderCollections(slugsInOrder: string[]): Promise<void> {
  if (!isDatabaseConfigured()) {
    await mutateStore((store) => {
      slugsInOrder.forEach((slug, index) => {
        const collection = store.collections.find((entry) => entry.slug === slug);
        if (collection) collection.position = index;
      });
    });
    return;
  }

  await getDb().transaction(async (tx) => {
    for (const [index, slug] of slugsInOrder.entries()) {
      await tx
        .update(collectionsTable)
        .set({ position: index })
        .where(eq(collectionsTable.slug, slug));
    }
  });
}

export async function reorderCategories(slugsInOrder: string[]): Promise<void> {
  if (!isDatabaseConfigured()) {
    await mutateStore((store) => {
      slugsInOrder.forEach((slug, index) => {
        const category = store.categories.find((entry) => entry.slug === slug);
        if (category) category.position = index;
      });
    });
    return;
  }

  await getDb().transaction(async (tx) => {
    for (const [index, slug] of slugsInOrder.entries()) {
      await tx
        .update(categoriesTable)
        .set({ position: index })
        .where(eq(categoriesTable.slug, slug));
    }
  });
}

function uniqueSlug(existing: string[], desired: string): string {
  const base = slugify(desired) || "item";
  let candidate = base;
  let suffix = 2;
  while (existing.includes(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
