"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Product, ProductColor, ProductSize, ProductStatus } from "@/lib/types";
import { isUploadedImage } from "@/lib/uploads";
import { slugify } from "@/lib/utils";
import { recordAudit } from "@/server/audit";
import {
  createProduct,
  deleteProducts,
  duplicateProduct,
  getProduct,
  setProductStatus,
  updateProduct,
  type ProductInput,
} from "@/server/repositories/products";
import { PermissionError, requirePermission } from "@/server/session";

/**
 * Product mutations.
 *
 * Two rules hold throughout:
 *
 * 1. **Authorise first.** Server Actions are public endpoints. Middleware does not
 *    protect them, so every action starts with `requirePermission`.
 * 2. **Validate on the server.** The form validates for the shopper's benefit; this
 *    is what actually protects the data. A crafted request cannot set a negative
 *    price, an empty size run, or a colour with no hex.
 */

export interface ProductFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
}

/** Revalidate every storefront surface a product can appear on. */
function revalidateStorefront(product?: Pick<Product, "slug" | "category">): void {
  revalidatePath("/", "layout");
  revalidatePath("/shop");
  revalidatePath("/collections");
  if (product) {
    revalidatePath(`/product/${product.slug}`);
    revalidatePath(`/shop/${product.category}`);
  }
  revalidatePath("/admin/products");
  revalidatePath("/admin");
}

/* ------------------------------------------------------------------ */
/* Parsing                                                            */
/* ------------------------------------------------------------------ */

function money(raw: FormDataEntryValue | null): number {
  // The form collects major units ("795.00"); the store keeps minor units.
  const value = Number(String(raw ?? "").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(value)) return NaN;
  return Math.round(value * 100);
}

function integer(raw: FormDataEntryValue | null, fallback = 0): number {
  const value = Number(String(raw ?? "").trim());
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

/** Split a textarea into trimmed, non-empty lines. */
function lines(raw: FormDataEntryValue | null): string[] {
  return String(raw ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Colours arrive as parallel arrays from repeated inputs:
 * `colorName[]`, `colorHex[]`, `colorImages[]`.
 */
function parseColors(formData: FormData): ProductColor[] {
  const names = formData.getAll("colorName").map(String);
  const hexes = formData.getAll("colorHex").map(String);
  const images = formData.getAll("colorImages").map(String);

  const colors: ProductColor[] = [];
  const usedIds = new Set<string>();

  for (let index = 0; index < names.length; index += 1) {
    const name = names[index]?.trim();
    const hex = (hexes[index] ?? "").trim();
    if (!name) continue;

    let id = slugify(name) || `colour-${index + 1}`;
    // Two colours called "Black" would otherwise collide in cart line ids.
    while (usedIds.has(id)) id = `${id}-2`;
    usedIds.add(id);

    /*
     * Two accepted shapes, matching `addBanner` in `src/server/repositories/banners.ts`:
     * an absolute URL for photography hosted elsewhere, and the relative
     * `/uploads/<hash>.<ext>` the upload pipeline returns under the disk driver.
     *
     * Accepting only absolute URLs meant every image uploaded on a host with a writable
     * disk was discarded here without a word — the upload succeeded, the preview
     * appeared, and the product saved with no photography at all.
     */
    const urls = (images[index] ?? "")
      .split(/[\n,]/)
      .map((url) => url.trim())
      .filter((url) => isUploadedImage(url) || /^https?:\/\//i.test(url));

    colors.push({
      id,
      name,
      hex: /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#cccccc",
      images: urls.length > 0 ? urls : undefined,
    });
  }

  return colors;
}

/**
 * Sizes arrive as a repeated `sizeLabel` field — labels only, since the shop does not
 * track inventory. Duplicates are dropped rather than rejected: two identical labels
 * are a slip, not something worth failing a whole product save over.
 */
function parseSizes(formData: FormData): ProductSize[] {
  const sizes: ProductSize[] = [];
  const seen = new Set<string>();

  for (const raw of formData.getAll("sizeLabel").map(String)) {
    const label = raw.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    sizes.push({ label });
  }

  return sizes;
}

function parseProductForm(formData: FormData): {
  input: ProductInput;
  fieldErrors: Record<string, string>;
} {
  const fieldErrors: Record<string, string> = {};

  const name = String(formData.get("name") ?? "").trim();
  const tagline = String(formData.get("tagline") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const price = money(formData.get("price"));
  const compareAtRaw = String(formData.get("compareAtPrice") ?? "").trim();
  const compareAtPrice = compareAtRaw ? money(formData.get("compareAtPrice")) : undefined;
  const costRaw = String(formData.get("costPrice") ?? "").trim();
  const costPrice = costRaw ? money(formData.get("costPrice")) : undefined;

  const colors = parseColors(formData);
  const sizes = parseSizes(formData);

  if (!name) fieldErrors.name = "A product name is required.";
  if (!tagline) fieldErrors.tagline = "A one-line tagline is required.";
  if (!category) fieldErrors.category = "Choose a category.";
  if (!Number.isFinite(price) || price <= 0) {
    fieldErrors.price = "Enter a price greater than zero.";
  }
  if (compareAtPrice !== undefined && Number.isFinite(price)) {
    if (!Number.isFinite(compareAtPrice)) {
      fieldErrors.compareAtPrice = "Enter a valid amount, or leave it blank.";
    } else if (compareAtPrice <= price) {
      // A compare-at at or below the price would render a nonsensical "0% off".
      fieldErrors.compareAtPrice = "The original price must be above the selling price.";
    }
  }
  if (costPrice !== undefined && !Number.isFinite(costPrice)) {
    fieldErrors.costPrice = "Enter a valid amount, or leave it blank.";
  }
  if (colors.length === 0) fieldErrors.colors = "Add at least one colourway.";
  if (sizes.length === 0) fieldErrors.sizes = "Add at least one size.";

  const status = String(formData.get("status") ?? "draft") as ProductStatus;

  const input: ProductInput = {
    slug: String(formData.get("slug") ?? "").trim() || slugify(name),
    name,
    tagline,
    department: (String(formData.get("department") ?? "unisex") || "unisex") as ProductInput["department"],
    category,
    collections: formData.getAll("collections").map(String).filter(Boolean),
    price,
    compareAtPrice: compareAtPrice && Number.isFinite(compareAtPrice) ? compareAtPrice : undefined,
    sizeSystem: (String(formData.get("sizeSystem") ?? "alpha") || "alpha") as ProductInput["sizeSystem"],
    colors,
    sizes,
    description: String(formData.get("description") ?? "").trim(),
    details: lines(formData.get("details")),
    composition: String(formData.get("composition") ?? "").trim(),
    care: lines(formData.get("care")),
    fitNote: String(formData.get("fitNote") ?? "").trim(),
    origin: String(formData.get("origin") ?? "").trim(),
    releasedAt:
      String(formData.get("releasedAt") ?? "").trim() ||
      new Date().toISOString().slice(0, 10),
    popularity: Math.min(100, Math.max(0, integer(formData.get("popularity"), 50))),
    sustainable: formData.get("sustainable") === "on",
    showOnHome: formData.get("showOnHome") === "on",
    pairsWith: formData.getAll("pairsWith").map(String).filter(Boolean),
    status: ["active", "draft", "archived"].includes(status) ? status : "draft",
    sku: String(formData.get("sku") ?? "").trim() || undefined,
    costPrice: costPrice && Number.isFinite(costPrice) ? costPrice : undefined,
    weightGrams: Math.max(0, integer(formData.get("weightGrams"), 0)) || undefined,
    taxable: formData.get("taxable") !== "off",
    seoTitle: String(formData.get("seoTitle") ?? "").trim() || undefined,
    seoDescription: String(formData.get("seoDescription") ?? "").trim() || undefined,
  };

  return { input, fieldErrors };
}

/* ------------------------------------------------------------------ */
/* Actions                                                            */
/* ------------------------------------------------------------------ */

export async function createProductAction(
  _previous: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  let created;

  try {
    const admin = await requirePermission("products:write");
    const { input, fieldErrors } = parseProductForm(formData);

    if (Object.keys(fieldErrors).length > 0) {
      return { fieldErrors, error: "Fix the highlighted fields and try again." };
    }

    created = await createProduct(input);
    await recordAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "create",
      entity: "product",
      entityId: created.id,
      summary: `Created product “${created.name}”`,
    });

    revalidateStorefront(created);
  } catch (error) {
    if (error instanceof PermissionError) return { error: error.message };
    return { error: (error as Error).message };
  }

  // Redirect outside the try: `redirect` throws by design and must not be caught.
  redirect(`/admin/products/${created.id}?created=1`);
}

export async function updateProductAction(
  _previous: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  try {
    const admin = await requirePermission("products:write");
    const id = String(formData.get("id") ?? "");

    const existing = await getProduct(id);
    if (!existing) return { error: "That product no longer exists." };

    const { input, fieldErrors } = parseProductForm(formData);
    if (Object.keys(fieldErrors).length > 0) {
      return { fieldErrors, error: "Fix the highlighted fields and try again." };
    }

    const updated = await updateProduct(id, input);
    await recordAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "update",
      entity: "product",
      entityId: id,
      summary: `Updated product “${updated.name}”`,
    });

    revalidateStorefront(updated);
    // Old slug too, if it changed, so the previous URL stops serving stale HTML.
    if (existing.slug !== updated.slug) revalidatePath(`/product/${existing.slug}`);

    return { success: "Changes saved." };
  } catch (error) {
    if (error instanceof PermissionError) return { error: error.message };
    return { error: (error as Error).message };
  }
}

/** Bulk publish, unpublish or archive from the products table. */
export async function setStatusAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("products:write");

  const ids = formData.getAll("ids").map(String).filter(Boolean);
  const status = String(formData.get("status") ?? "") as ProductStatus;

  if (ids.length === 0 || !["active", "draft", "archived"].includes(status)) return;

  const changed = await setProductStatus(ids, status);
  if (changed > 0) {
    await recordAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "status",
      entity: "product",
      entityId: ids.join(","),
      summary: `Set ${changed} product${changed === 1 ? "" : "s"} to ${status}`,
    });
  }

  revalidateStorefront();
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("products:write");

  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) return;

  // Capture names before deletion so the audit entry is readable afterwards.
  const names: string[] = [];
  for (const id of ids) {
    const product = await getProduct(id);
    if (product) names.push(product.name);
  }

  const removed = await deleteProducts(ids);
  if (removed > 0) {
    await recordAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "delete",
      entity: "product",
      entityId: ids.join(","),
      summary: `Deleted ${removed} product${removed === 1 ? "" : "s"}: ${names.join(", ")}`,
    });
  }

  revalidateStorefront();
  redirect("/admin/products?deleted=1");
}

export async function duplicateProductAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("products:write");
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const copy = await duplicateProduct(id);
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "create",
    entity: "product",
    entityId: copy.id,
    summary: `Duplicated “${copy.name}” from ${id}`,
  });

  revalidateStorefront();
  redirect(`/admin/products/${copy.id}`);
}


