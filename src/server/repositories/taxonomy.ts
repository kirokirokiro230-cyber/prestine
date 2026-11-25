import type { Category, Collection, SilhouetteKey } from "@/lib/types";
import { slugify } from "@/lib/utils";
import { callRpc, db, insertInto, unwrap, updateTable } from "../supabase";
import type { CategoryRow, CollectionRow, ProductRow } from "../database.types";

/**
 * Categories and collections.
 *
 * Both are editable, so both carry the same guards: unique slugs, and a
 * refusal to delete anything still attached to a product. Deleting a
 * category silently would orphan products into a section that no longer
 * exists.
 *
 * Slug renames and the delete-if-unused guard run through the
 * `security definer` RPCs in `supabase/migrations/00000000000003_functions.sql`
 * (`rename_category_slug`, `rename_collection_slug`,
 * `delete_category_if_unused`) rather than as plain SQL here, because they
 * touch two tables (`categories`/`collections` plus every referencing
 * `products`/`product_collections` row) and need to happen atomically — the
 * JSON store got that atomicity for free from `mutateStore`'s whole-document
 * clone-and-replace; these RPCs are what replaces it now that the data is
 * split into tables.
 */

function categoryFromRow(row: CategoryRow): Category {
  return {
    slug: row.slug,
    name: row.name,
    blurb: row.blurb,
    imageUrl: row.image_url ?? undefined,
    imageUrlWide: row.image_url_wide ?? undefined,
    silhouette: row.silhouette,
    position: row.position,
  };
}

function collectionFromRow(row: CollectionRow): Collection {
  return {
    slug: row.slug,
    name: row.name,
    blurb: row.blurb,
    description: row.description,
    position: row.position,
    hidden: row.hidden,
  };
}

export async function listCategories(): Promise<Category[]> {
  const rows = unwrap(
    await db()
      .from("categories")
      .select("*")
      .order("position", { ascending: true })
      .overrideTypes<CategoryRow[], { merge: false }>(),
  );
  return rows.map(categoryFromRow);
}

export async function listCollections(): Promise<Collection[]> {
  const rows = unwrap(
    await db()
      .from("collections")
      .select("*")
      .order("position", { ascending: true })
      .overrideTypes<CollectionRow[], { merge: false }>(),
  );
  return rows.map(collectionFromRow);
}

export async function getCategory(slug: string): Promise<Category | undefined> {
  const row = unwrap(
    await db()
      .from("categories")
      .select("*")
      .eq("slug", slug)
      .maybeSingle()
      .overrideTypes<CategoryRow, { merge: false }>(),
  );
  return row ? categoryFromRow(row) : undefined;
}

export async function getCollection(slug: string): Promise<Collection | undefined> {
  const row = unwrap(
    await db()
      .from("collections")
      .select("*")
      .eq("slug", slug)
      .maybeSingle()
      .overrideTypes<CollectionRow, { merge: false }>(),
  );
  return row ? collectionFromRow(row) : undefined;
}

/** How many products reference each category, for the admin list. */
export async function categoryUsage(): Promise<Record<string, number>> {
  const rows = unwrap(
    await db()
      .from("products")
      .select("category")
      .overrideTypes<Array<Pick<ProductRow, "category">>, { merge: false }>(),
  );
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.category] = (counts[row.category] ?? 0) + 1;
  return counts;
}

export async function collectionUsage(): Promise<Record<string, number>> {
  const rows = unwrap(
    await db()
      .from("product_collections")
      .select("collection_slug")
      .overrideTypes<Array<{ collection_slug: string }>, { merge: false }>(),
  );
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.collection_slug] = (counts[row.collection_slug] ?? 0) + 1;
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

async function uniqueCategorySlug(desired: string, ignoreSlug?: string): Promise<string> {
  const base = slugify(desired) || "item";
  let candidate = base;
  let suffix = 2;

  while (true) {
    let builder = db().from("categories").select("slug").eq("slug", candidate).limit(1);
    if (ignoreSlug) builder = builder.neq("slug", ignoreSlug);
    const rows = unwrap(
      await builder.overrideTypes<Array<Pick<CategoryRow, "slug">>, { merge: false }>(),
    );
    if (rows.length === 0) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

async function uniqueCollectionSlug(desired: string, ignoreSlug?: string): Promise<string> {
  const base = slugify(desired) || "item";
  let candidate = base;
  let suffix = 2;

  while (true) {
    let builder = db().from("collections").select("slug").eq("slug", candidate).limit(1);
    if (ignoreSlug) builder = builder.neq("slug", ignoreSlug);
    const rows = unwrap(
      await builder.overrideTypes<Array<Pick<CollectionRow, "slug">>, { merge: false }>(),
    );
    if (rows.length === 0) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

export async function createCategory(input: CategoryInput): Promise<Category> {
  const slug = await uniqueCategorySlug(input.slug || input.name);

  const countRows = unwrap(
    await db()
      .from("categories")
      .select("slug")
      .overrideTypes<Array<Pick<CategoryRow, "slug">>, { merge: false }>(),
  );

  const row = unwrap(
    await insertInto(db(), "categories", {
      slug,
      name: input.name,
      blurb: input.blurb,
      image_url: input.imageUrl || null,
      image_url_wide: input.imageUrlWide || null,
      silhouette: guessSilhouette(`${input.name} ${slug}`),
      position: countRows.length,
    })
      .select("*")
      .single()
      .overrideTypes<unknown, { merge: false }>(),
  ) as CategoryRow;

  return categoryFromRow(row);
}

export async function updateCategory(
  slug: string,
  patch: Partial<CategoryInput>,
): Promise<Category> {
  // Renaming the slug has to carry every product with it, or they vanish
  // from their own category page. rename_category_slug validates uniqueness
  // and relies on products.category's `on update cascade` FK to propagate —
  // see supabase/migrations/00000000000003_functions.sql.
  let currentSlug = slug;
  if (patch.slug && patch.slug !== slug) {
    const nextSlug = await uniqueCategorySlug(patch.slug, slug);
    const { error } = await callRpc(db(), "rename_category_slug", {
      p_old_slug: slug,
      p_new_slug: nextSlug,
    });
    if (error) throw new Error(error.message);
    currentSlug = nextSlug;
  }

  const rowPatch: Partial<CategoryRow> = {};
  if (patch.name !== undefined) rowPatch.name = patch.name;
  if (patch.blurb !== undefined) rowPatch.blurb = patch.blurb;
  // An empty string clears the image, `undefined` leaves it alone. Without
  // that distinction a merchant could add photography but never remove it.
  if (patch.imageUrl !== undefined) rowPatch.image_url = patch.imageUrl || null;
  if (patch.imageUrlWide !== undefined) rowPatch.image_url_wide = patch.imageUrlWide || null;

  if (Object.keys(rowPatch).length > 0) {
    unwrap(
      await updateTable(db(), "categories", rowPatch)
        .eq("slug", currentSlug)
        .select("slug")
        .single()
        .overrideTypes<unknown, { merge: false }>(),
    ) as Pick<CategoryRow, "slug">;
  }

  const category = await getCategory(currentSlug);
  if (!category) throw new Error(`Category ${currentSlug} not found`);
  return category;
}

export async function deleteCategory(slug: string): Promise<void> {
  const { error } = await callRpc(db(), "delete_category_if_unused", { p_slug: slug });
  if (error) throw new Error(error.message);
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
  const slug = await uniqueCollectionSlug(input.slug || input.name);

  const countRows = unwrap(
    await db()
      .from("collections")
      .select("slug")
      .overrideTypes<Array<Pick<CollectionRow, "slug">>, { merge: false }>(),
  );

  const row = unwrap(
    await insertInto(db(), "collections", {
      slug,
      name: input.name,
      blurb: input.blurb,
      description: input.description,
      hidden: input.hidden ?? false,
      position: countRows.length,
    })
      .select("*")
      .single()
      .overrideTypes<unknown, { merge: false }>(),
  ) as CollectionRow;

  return collectionFromRow(row);
}

export async function updateCollection(
  slug: string,
  patch: Partial<CollectionInput>,
): Promise<Collection> {
  let currentSlug = slug;
  if (patch.slug && patch.slug !== slug) {
    const nextSlug = await uniqueCollectionSlug(patch.slug, slug);
    const { error } = await callRpc(db(), "rename_collection_slug", {
      p_old_slug: slug,
      p_new_slug: nextSlug,
    });
    if (error) throw new Error(error.message);
    currentSlug = nextSlug;
  }

  const rowPatch: Partial<CollectionRow> = {};
  if (patch.name !== undefined) rowPatch.name = patch.name;
  if (patch.blurb !== undefined) rowPatch.blurb = patch.blurb;
  if (patch.description !== undefined) rowPatch.description = patch.description;
  if (patch.hidden !== undefined) rowPatch.hidden = patch.hidden;

  if (Object.keys(rowPatch).length > 0) {
    unwrap(
      await updateTable(db(), "collections", rowPatch)
        .eq("slug", currentSlug)
        .select("slug")
        .single()
        .overrideTypes<unknown, { merge: false }>(),
    ) as Pick<CollectionRow, "slug">;
  }

  const collection = await getCollection(currentSlug);
  if (!collection) throw new Error(`Collection ${currentSlug} not found`);
  return collection;
}

export async function deleteCollection(slug: string): Promise<void> {
  // Unlike a category, a collection is just a tag — detaching it is safe.
  // `on delete cascade` on product_collections.collection_slug (see
  // supabase/migrations/00000000000001_schema.sql) removes every tag
  // referencing this collection as part of the same delete.
  const { error } = await db().from("collections").delete().eq("slug", slug);
  if (error) throw new Error(error.message);
}

/** Persist a new display order from the drag-free position inputs. */
export async function reorderCollections(slugsInOrder: string[]): Promise<void> {
  await Promise.all(
    slugsInOrder.map((slug, index) =>
      updateTable(db(), "collections", { position: index }).eq("slug", slug),
    ),
  );
}

export async function reorderCategories(slugsInOrder: string[]): Promise<void> {
  await Promise.all(
    slugsInOrder.map((slug, index) =>
      updateTable(db(), "categories", { position: index }).eq("slug", slug),
    ),
  );
}
