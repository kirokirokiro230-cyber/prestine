import type { Product, ProductStatus } from "@/lib/types";
import { slugify } from "@/lib/utils";
import { db, insertInto, unwrap, updateTable, type AnyFilterBuilder } from "../supabase";
import type {
  ProductColorRow,
  ProductCollectionRow,
  ProductPairingRow,
  ProductRow,
  ProductSizeRow,
} from "../database.types";

/**
 * Product persistence.
 *
 * Every write goes through here so invariants hold in one place: slugs stay
 * unique and timestamps are maintained.
 *
 * There is no inventory. The shop does not track stock, so nothing here reserves,
 * releases or counts units — a size is a label a customer can always choose.
 *
 * ## The shape callers see vs. the tables underneath
 *
 * `Product` nests `colors`, `sizes`, `collections` and `pairsWith` as arrays.
 * Postgres holds each as its own table (`product_colors`, `product_sizes`,
 * `product_collections`, `product_pairings`) so the admin table, the storefront
 * filter rail and `deleteProducts`' dangling-reference cleanup can all query
 * them directly rather than loading every product into memory to look inside
 * one array. Every exported function here still takes and returns the same
 * nested `Product`/`ProductInput` shape the rest of the app already depends
 * on — `assembleProducts()` and `writeVariants()` are the two functions that
 * translate between the two, so nothing above this file needs to know the
 * table split exists.
 *
 * Every query below ends its chain with `.overrideTypes<Row, { merge: false }>()`
 * (or `Row[]`) before being handed to `unwrap()` — see the note in
 * `../supabase.ts`'s `unwrap()` doc comment for why that is not optional.
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

/* ------------------------------------------------------------------ */
/* Row → domain assembly                                               */
/* ------------------------------------------------------------------ */

function fromRow(row: ProductRow): Omit<Product, "colors" | "sizes" | "collections" | "pairsWith"> {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    department: row.department,
    category: row.category,
    price: row.price,
    compareAtPrice: row.compare_at_price ?? undefined,
    sizeSystem: row.size_system,
    description: row.description,
    details: row.details,
    composition: row.composition,
    care: row.care,
    fitNote: row.fit_note,
    origin: row.origin,
    rating: row.rating,
    reviewCount: row.review_count,
    releasedAt: row.released_at,
    popularity: row.popularity,
    sustainable: row.sustainable,
    showOnHome: row.show_on_home,
    status: row.status,
    sku: row.sku ?? undefined,
    costPrice: row.cost_price ?? undefined,
    weightGrams: row.weight_grams ?? undefined,
    taxable: row.taxable,
    seoTitle: row.seo_title ?? undefined,
    seoDescription: row.seo_description ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Load every nested collection (colours, sizes, collection tags, pairings) for
 * a set of product ids in four queries total, not four queries per product —
 * `queryProducts` can return up to a page of rows and each one needs its
 * variants, so this is written to batch regardless of how many ids are asked
 * for.
 */
async function loadVariants(productIds: string[]): Promise<{
  colorsByProduct: Map<string, Product["colors"]>;
  sizesByProduct: Map<string, Product["sizes"]>;
  collectionsByProduct: Map<string, string[]>;
  pairingsByProduct: Map<string, string[]>;
}> {
  const colorsByProduct = new Map<string, Product["colors"]>();
  const sizesByProduct = new Map<string, Product["sizes"]>();
  const collectionsByProduct = new Map<string, string[]>();
  const pairingsByProduct = new Map<string, string[]>();

  if (productIds.length === 0) {
    return { colorsByProduct, sizesByProduct, collectionsByProduct, pairingsByProduct };
  }

  const [colorRows, sizeRows, collectionRows, pairingRows] = await Promise.all([
    unwrap(
      await db()
        .from("product_colors")
        .select("*")
        .in("product_id", productIds)
        .order("position", { ascending: true })
        .overrideTypes<ProductColorRow[], { merge: false }>(),
    ),
    unwrap(
      await db()
        .from("product_sizes")
        .select("*")
        .in("product_id", productIds)
        .order("position", { ascending: true })
        .overrideTypes<ProductSizeRow[], { merge: false }>(),
    ),
    unwrap(
      await db()
        .from("product_collections")
        .select("*")
        .in("product_id", productIds)
        .overrideTypes<ProductCollectionRow[], { merge: false }>(),
    ),
    // Pairings are ordered by the *source* product's position, so "Pairs well
    // with" always shows in the order a merchant arranged it.
    unwrap(
      await db()
        .from("product_pairings")
        .select("*")
        .in("product_id", productIds)
        .order("position", { ascending: true })
        .overrideTypes<ProductPairingRow[], { merge: false }>(),
    ),
  ]);

  for (const row of colorRows) {
    const list = colorsByProduct.get(row.product_id) ?? [];
    list.push({ id: row.id, name: row.name, hex: row.hex, images: row.images.length ? row.images : undefined });
    colorsByProduct.set(row.product_id, list);
  }

  for (const row of sizeRows) {
    const list = sizesByProduct.get(row.product_id) ?? [];
    list.push({ label: row.label });
    sizesByProduct.set(row.product_id, list);
  }

  for (const row of collectionRows) {
    const list = collectionsByProduct.get(row.product_id) ?? [];
    list.push(row.collection_slug);
    collectionsByProduct.set(row.product_id, list);
  }

  for (const row of pairingRows) {
    const list = pairingsByProduct.get(row.product_id) ?? [];
    list.push(row.paired_with_id);
    pairingsByProduct.set(row.product_id, list);
  }

  return { colorsByProduct, sizesByProduct, collectionsByProduct, pairingsByProduct };
}

/**
 * `pairsWith` stores product **ids** in `product_pairings`, but `Product.pairsWith`
 * is a list of **slugs** — the storefront cross-sell renders from
 * `getProductsBySlugs`. This resolves ids to slugs in one extra query rather
 * than denormalising the slug onto `product_pairings`, since a product's slug
 * can change and the pairing table should not need a second write to stay
 * correct when it does.
 */
async function resolvePairingSlugs(pairingsByProduct: Map<string, string[]>): Promise<Map<string, string[]>> {
  const allPairedIds = [...new Set([...pairingsByProduct.values()].flat())];
  if (allPairedIds.length === 0) return new Map();

  const rows = unwrap(
    await db()
      .from("products")
      .select("id, slug")
      .in("id", allPairedIds)
      .overrideTypes<Array<Pick<ProductRow, "id" | "slug">>, { merge: false }>(),
  );
  const slugById = new Map(rows.map((row) => [row.id, row.slug]));

  const result = new Map<string, string[]>();
  for (const [productId, pairedIds] of pairingsByProduct) {
    const slugs = pairedIds.map((id) => slugById.get(id)).filter((slug): slug is string => Boolean(slug));
    if (slugs.length > 0) result.set(productId, slugs);
  }
  return result;
}

async function assembleProducts(rows: ProductRow[]): Promise<Product[]> {
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const { colorsByProduct, sizesByProduct, collectionsByProduct, pairingsByProduct } =
    await loadVariants(ids);
  const pairingSlugsByProduct = await resolvePairingSlugs(pairingsByProduct);

  return rows.map((row) => ({
    ...fromRow(row),
    colors: colorsByProduct.get(row.id) ?? [],
    sizes: sizesByProduct.get(row.id) ?? [],
    collections: collectionsByProduct.get(row.id) ?? [],
    pairsWith: pairingSlugsByProduct.get(row.id),
  }));
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export async function listProducts(): Promise<Product[]> {
  const rows = unwrap(
    await db().from("products").select("*").overrideTypes<ProductRow[], { merge: false }>(),
  );
  return assembleProducts(rows);
}

/** Products the storefront may show. */
export async function listActiveProducts(): Promise<Product[]> {
  const rows = unwrap(
    await db()
      .from("products")
      .select("*")
      .eq("status", "active")
      .overrideTypes<ProductRow[], { merge: false }>(),
  );
  return assembleProducts(rows);
}

export async function getProduct(id: string): Promise<Product | undefined> {
  const row = unwrap(
    await db()
      .from("products")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .overrideTypes<ProductRow, { merge: false }>(),
  );
  if (!row) return undefined;
  const [assembled] = await assembleProducts([row]);
  return assembled;
}

export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  const row = unwrap(
    await db()
      .from("products")
      .select("*")
      .eq("slug", slug)
      .maybeSingle()
      .overrideTypes<ProductRow, { merge: false }>(),
  );
  if (!row) return undefined;
  const [assembled] = await assembleProducts([row]);
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

  let productIds: string[] | null = null;
  if (collection) {
    const rows = unwrap(
      await db()
        .from("product_collections")
        .select("product_id")
        .eq("collection_slug", collection)
        .overrideTypes<Array<Pick<ProductCollectionRow, "product_id">>, { merge: false }>(),
    );
    productIds = rows.map((row) => row.product_id);
    // No product tagged with this collection: short-circuit rather than let an
    // empty `.in("id", [])` be sent, which Postgres/PostgREST would otherwise
    // have to evaluate as "match nothing" anyway — this just skips the round trip.
    if (productIds.length === 0) {
      return { items: [], total: 0, page: 1, perPage, totalPages: 1 };
    }
  }

  /**
   * Apply every filter shared by the count query and the page query.
   *
   * Typed against `AnyFilterBuilder` (see `../supabase.ts`) rather than the
   * real Postgrest builder generic for "products" specifically — the same
   * select-string-parser inference break that requires `.overrideTypes()`
   * everywhere else in this file also makes threading the real per-table
   * builder type through a generic helper unreliable. Both call sites below
   * immediately follow this with `.overrideTypes()` on the result, so the
   * loosened typing is confined to filter-chaining here and never reaches an
   * exported function's signature.
   */
  function withFilters(builder: AnyFilterBuilder): AnyFilterBuilder {
    let next = builder;
    if (status !== "all") next = next.eq("status", status);
    if (category) next = next.eq("category", category);
    if (productIds) next = next.in("id", productIds);
    if (search?.trim()) {
      const needle = search.trim();
      // ilike across the columns queryProducts historically searched
      // (name/slug/sku/tagline/category); colour names are not included —
      // they live in a join table `.or()` cannot reach in one call, and the
      // admin search box has never matched on them.
      next = next.or(
        [
          `name.ilike.%${needle}%`,
          `slug.ilike.%${needle}%`,
          `sku.ilike.%${needle}%`,
          `tagline.ilike.%${needle}%`,
          `category.ilike.%${needle}%`,
        ].join(","),
      );
    }
    return next;
  }

  const { count, error: countError } = await withFilters(
    db().from("products").select("id", { count: "exact", head: true }) as unknown as AnyFilterBuilder,
  );
  if (countError) throw new Error(countError.message);

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);

  let pageQuery = withFilters(db().from("products").select("*") as unknown as AnyFilterBuilder);
  switch (sort) {
    case "created-desc":
      pageQuery = pageQuery.order("created_at", { ascending: false });
      break;
    case "name-asc":
      pageQuery = pageQuery.order("name", { ascending: true });
      break;
    case "price-asc":
      pageQuery = pageQuery.order("price", { ascending: true });
      break;
    case "price-desc":
      pageQuery = pageQuery.order("price", { ascending: false });
      break;
    case "updated-desc":
    default:
      pageQuery = pageQuery.order("updated_at", { ascending: false });
      break;
  }
  pageQuery = pageQuery.range((safePage - 1) * perPage, safePage * perPage - 1);

  // `pageQuery`'s builder type has been widened to `AnyFilterBuilder` (see
  // `withFilters` above), so `.overrideTypes()`'s own single-vs-array
  // detection has nothing concrete to check against and produces a union
  // with its error-message branch rather than a clean `ProductRow[]`. The
  // query itself never calls `.single()`/`.maybeSingle()` — every path above
  // is a plain `.select("*")` — so the result is safely known to be an array
  // without needing that detection to run.
  const raw = unwrap(await pageQuery.overrideTypes<unknown, { merge: false }>());
  const rows = raw as ProductRow[];
  const items = await assembleProducts(rows);

  return { items, total, page: safePage, perPage, totalPages };
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
async function uniqueSlug(desired: string, ignoreId?: string): Promise<string> {
  const base = slugify(desired) || "product";
  let candidate = base;
  let suffix = 2;

  while (true) {
    let builder = db().from("products").select("id").eq("slug", candidate).limit(1);
    if (ignoreId) builder = builder.neq("id", ignoreId);
    const rows = unwrap(
      await builder.overrideTypes<Array<Pick<ProductRow, "id">>, { merge: false }>(),
    );
    if (rows.length === 0) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

async function nextProductId(): Promise<string> {
  // Keep the readable p-0NN sequence the seed data uses. Reading every id to
  // find the max is fine at catalogue scale (hundreds to low thousands of
  // products) and keeps the format identical to what existing order lines and
  // audit entries already reference.
  const rows = unwrap(
    await db()
      .from("products")
      .select("id")
      .overrideTypes<Array<Pick<ProductRow, "id">>, { merge: false }>(),
  );
  const highest = rows.reduce((max, row) => {
    const numeric = Number(row.id.replace(/\D/g, ""));
    return Number.isFinite(numeric) ? Math.max(max, numeric) : max;
  }, 0);
  return `p-${String(highest + 1).padStart(3, "0")}`;
}

/** Replace a product's colours, sizes, collection tags and pairings in place. */
async function writeVariants(productId: string, input: ProductInput): Promise<void> {
  const client = db();

  // Delete-then-insert rather than diffing. Product edits are infrequent
  // (an admin saving a form), the row counts per product are small (a
  // handful of colours/sizes/collections), and this guarantees position and
  // membership always exactly match what the form submitted — no leftover
  // row from a removed colourway can survive a diff that missed it.
  await Promise.all([
    client.from("product_colors").delete().eq("product_id", productId),
    client.from("product_sizes").delete().eq("product_id", productId),
    client.from("product_collections").delete().eq("product_id", productId),
    client.from("product_pairings").delete().eq("product_id", productId),
  ]);

  if (input.colors.length > 0) {
    unwrap(
      await insertInto(
        client,
        "product_colors",
        input.colors.map((color, index) => ({
          id: color.id,
          product_id: productId,
          name: color.name,
          hex: color.hex,
          images: color.images ?? [],
          position: index,
        })),
      ).overrideTypes<ProductColorRow[], { merge: false }>(),
    );
  }

  if (input.sizes.length > 0) {
    unwrap(
      await insertInto(
        client,
        "product_sizes",
        input.sizes.map((size, index) => ({
          product_id: productId,
          label: size.label,
          position: index,
        })),
      ).overrideTypes<ProductSizeRow[], { merge: false }>(),
    );
  }

  if (input.collections.length > 0) {
    unwrap(
      await insertInto(
        client,
        "product_collections",
        input.collections.map((slug) => ({ product_id: productId, collection_slug: slug })),
      ).overrideTypes<ProductCollectionRow[], { merge: false }>(),
    );
  }

  if (input.pairsWith?.length) {
    // pairsWith on the input is slugs; product_pairings stores ids.
    const paired = unwrap(
      await client
        .from("products")
        .select("id, slug")
        .in("slug", input.pairsWith)
        .overrideTypes<Array<Pick<ProductRow, "id" | "slug">>, { merge: false }>(),
    );
    const idBySlug = new Map(paired.map((row) => [row.slug, row.id]));
    const rows = input.pairsWith
      .map((slug) => idBySlug.get(slug))
      .filter((id): id is string => Boolean(id) && id !== productId)
      .map((pairedWithId, index) => ({ product_id: productId, paired_with_id: pairedWithId, position: index }));
    if (rows.length > 0) {
      unwrap(
        await insertInto(client, "product_pairings", rows).overrideTypes<
          ProductPairingRow[],
          { merge: false }
        >(),
      );
    }
  }
}

function toRowPatch(input: Partial<ProductInput>): Partial<ProductRow> {
  const patch: Partial<ProductRow> = {};
  if (input.slug !== undefined) patch.slug = input.slug;
  if (input.name !== undefined) patch.name = input.name;
  if (input.tagline !== undefined) patch.tagline = input.tagline;
  if (input.department !== undefined) patch.department = input.department;
  if (input.category !== undefined) patch.category = input.category;
  if (input.price !== undefined) patch.price = input.price;
  if (input.compareAtPrice !== undefined) patch.compare_at_price = input.compareAtPrice ?? null;
  if (input.sizeSystem !== undefined) patch.size_system = input.sizeSystem;
  if (input.description !== undefined) patch.description = input.description;
  if (input.details !== undefined) patch.details = input.details;
  if (input.composition !== undefined) patch.composition = input.composition;
  if (input.care !== undefined) patch.care = input.care;
  if (input.fitNote !== undefined) patch.fit_note = input.fitNote;
  if (input.origin !== undefined) patch.origin = input.origin;
  if (input.rating !== undefined) patch.rating = input.rating;
  if (input.reviewCount !== undefined) patch.review_count = input.reviewCount;
  if (input.releasedAt !== undefined) patch.released_at = input.releasedAt;
  if (input.popularity !== undefined) patch.popularity = input.popularity;
  if (input.sustainable !== undefined) patch.sustainable = input.sustainable;
  if (input.showOnHome !== undefined) patch.show_on_home = input.showOnHome;
  if (input.status !== undefined) patch.status = input.status;
  if (input.sku !== undefined) patch.sku = input.sku ?? null;
  if (input.costPrice !== undefined) patch.cost_price = input.costPrice ?? null;
  if (input.weightGrams !== undefined) patch.weight_grams = input.weightGrams ?? null;
  if (input.taxable !== undefined) patch.taxable = input.taxable;
  if (input.seoTitle !== undefined) patch.seo_title = input.seoTitle ?? null;
  if (input.seoDescription !== undefined) patch.seo_description = input.seoDescription ?? null;
  return patch;
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const id = await nextProductId();
  const slug = await uniqueSlug(input.slug || input.name);
  const now = new Date().toISOString();

  unwrap(
    await insertInto(db(), "products", {
      id,
      slug,
      name: input.name,
      tagline: input.tagline,
      department: input.department,
      category: input.category,
      price: input.price,
      compare_at_price: input.compareAtPrice ?? null,
      size_system: input.sizeSystem,
      description: input.description,
      details: input.details,
      composition: input.composition,
      care: input.care,
      fit_note: input.fitNote,
      origin: input.origin,
      rating: input.rating ?? 0,
      review_count: input.reviewCount ?? 0,
      released_at: input.releasedAt,
      popularity: input.popularity,
      sustainable: input.sustainable ?? false,
      show_on_home: input.showOnHome ?? false,
      status: input.status ?? "draft",
      sku: input.sku ?? null,
      cost_price: input.costPrice ?? null,
      weight_grams: input.weightGrams ?? null,
      taxable: input.taxable ?? true,
      seo_title: input.seoTitle ?? null,
      seo_description: input.seoDescription ?? null,
      created_at: now,
      updated_at: now,
    })
      .select("*")
      .single()
      .overrideTypes<ProductRow, { merge: false }>(),
  );

  await writeVariants(id, input);

  const product = await getProduct(id);
  if (!product) throw new Error("Product was created but could not be re-read.");
  return product;
}

export async function updateProduct(
  id: string,
  patch: Partial<ProductInput>,
): Promise<Product> {
  const existing = unwrap(
    await db()
      .from("products")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .overrideTypes<ProductRow, { merge: false }>(),
  );
  if (!existing) throw new Error(`Product ${id} not found`);

  const rowPatch = toRowPatch(patch);
  if (patch.slug) rowPatch.slug = await uniqueSlug(patch.slug, id);
  rowPatch.updated_at = new Date().toISOString();

  unwrap(
    await updateTable(db(), "products", rowPatch)
      .eq("id", id)
      .select("id")
      .single()
      .overrideTypes<Pick<ProductRow, "id">, { merge: false }>(),
  );

  // Variants are only rewritten when the caller actually supplied them — a
  // partial patch that omits `colors` (e.g. setProductStatus's bulk update
  // path never calls this function, but a future partial-save form easily
  // could) must not wipe out every colourway because the field was absent.
  //
  // `writeVariants` reads exclusively `colors`/`sizes`/`collections`/
  // `pairsWith` from its `input` — see that function above — so only those
  // four fields need real values here; the rest of `ProductInput` is
  // satisfied with placeholders that are never read, rather than spreading
  // `existing` (a raw `ProductRow`, whose nullable columns like `sku` do not
  // match `ProductInput`'s optional-undefined shape).
  if (
    patch.colors !== undefined ||
    patch.sizes !== undefined ||
    patch.collections !== undefined ||
    patch.pairsWith !== undefined
  ) {
    await writeVariants(id, {
      colors: patch.colors ?? [],
      sizes: patch.sizes ?? [],
      collections: patch.collections ?? [],
      pairsWith: patch.pairsWith,
      department: existing.department,
      category: existing.category,
      price: existing.price,
      sizeSystem: existing.size_system,
      description: existing.description,
      details: existing.details,
      composition: existing.composition,
      care: existing.care,
      fitNote: existing.fit_note,
      origin: existing.origin,
      releasedAt: existing.released_at,
      popularity: existing.popularity,
      name: patch.name ?? existing.name,
      tagline: patch.tagline ?? existing.tagline,
      slug: rowPatch.slug ?? existing.slug,
      taxable: existing.taxable,
    });
  }

  const product = await getProduct(id);
  if (!product) throw new Error(`Product ${id} not found after update`);
  return product;
}

export async function setProductStatus(
  ids: string[],
  status: ProductStatus,
): Promise<number> {
  if (ids.length === 0) return 0;

  const { data, error } = await updateTable(db(), "products", {
    status,
    updated_at: new Date().toISOString(),
  })
    .in("id", ids)
    .neq("status", status)
    .select("id")
    .overrideTypes<Array<Pick<ProductRow, "id">>, { merge: false }>();

  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

export async function deleteProducts(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;

  // Dangling `pairsWith` cleanup is automatic here: product_pairings has
  // `on delete cascade` on both product_id and paired_with_id (see
  // supabase/migrations/00000000000001_schema.sql), so deleting a product
  // removes every pairing that named it in either direction — the same
  // outcome deleteProducts() used to produce by filtering every remaining
  // product's pairsWith array by hand.
  const { data, error } = await db()
    .from("products")
    .delete()
    .in("id", ids)
    .select("id")
    .overrideTypes<Array<Pick<ProductRow, "id">>, { merge: false }>();

  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

/** Copy a product as a draft, with a fresh id, slug and name. */
export async function duplicateProduct(id: string): Promise<Product> {
  const source = await getProduct(id);
  if (!source) throw new Error(`Product ${id} not found`);

  const newSlug = await uniqueSlug(`${source.slug}-copy`);

  const copy = await createProduct({
    ...source,
    name: `${source.name} (copy)`,
    slug: newSlug,
    // A duplicate starts unpublished and unrated — it is a new product.
    status: "draft",
    rating: 0,
    reviewCount: 0,
  });

  return copy;
}

/** Random id for entities that do not need a readable sequence. */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}
