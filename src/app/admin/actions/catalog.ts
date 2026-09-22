"use server";

import { revalidatePath } from "next/cache";
import { isUploadedImage } from "@/lib/uploads";
import { recordAudit } from "@/server/audit";
import {
  createCategory,
  createCollection,
  deleteCategory,
  deleteCollection,
  updateCategory,
  updateCollection,
} from "@/server/repositories/taxonomy";
import { setReviewHidden } from "@/server/repositories/settings";
import { PermissionError, requirePermission } from "@/server/session";

/**
 * Category, collection and review-moderation actions.
 *
 * Renaming a slug rewrites every product that referenced it — handled in the
 * repository, because a half-applied rename would drop products out of their own
 * category page.
 */

export interface CatalogActionState {
  error?: string;
  success?: string;
}

function revalidateTaxonomy(): void {
  revalidatePath("/", "layout");
  revalidatePath("/shop");
  revalidatePath("/collections");
  revalidatePath("/admin/categories");
  revalidatePath("/admin/collections");
}

/**
 * Accept a category image, or an empty string to clear it.
 *
 * The same two shapes the product and banner forms accept: the relative
 * `/uploads/<hash>.<ext>` the upload pipeline returns, or an absolute URL for
 * photography hosted elsewhere. Anything else is discarded rather than stored, so a
 * crafted request cannot put `javascript:` or a data URI into an `<img src>`.
 */
function categoryImageFrom(value: FormDataEntryValue | null): string {
  const url = String(value ?? "").trim();
  if (!url) return "";
  return isUploadedImage(url) || /^https?:\/\//i.test(url) ? url : "";
}

/*
 * The silhouette list and `silhouetteFrom` were here. The merchant is no longer asked
 * for a silhouette — the control could not affect what was drawn, because
 * `silhouetteFor()` resolves it from the static config rather than the store. The
 * repository derives one from the slug on create instead.
 */

/* ------------------------------- Categories ------------------------------- */

export async function saveCategoryAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  try {
    const admin = await requirePermission("products:write");

    const existingSlug = String(formData.get("existingSlug") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const blurb = String(formData.get("blurb") ?? "").trim();
    const slug = String(formData.get("slug") ?? "").trim();
    const imageUrl = categoryImageFrom(formData.get("imageUrl"));
    const imageUrlWide = categoryImageFrom(formData.get("imageUrlWide"));

    if (!name) return { error: "A category name is required." };
    if (!blurb) return { error: "Add a short blurb — it appears on the category tile." };

    if (existingSlug) {
      const updated = await updateCategory(existingSlug, {
        name,
        blurb,
        slug,
        imageUrl,
        imageUrlWide,
      });
      await recordAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "update",
        entity: "category",
        entityId: updated.slug,
        summary: `Updated category “${updated.name}”`,
      });
    } else {
      const created = await createCategory({ name, blurb, slug, imageUrl, imageUrlWide });
      await recordAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "create",
        entity: "category",
        entityId: created.slug,
        summary: `Created category “${created.name}”`,
      });
    }

    revalidateTaxonomy();
    return { success: existingSlug ? "Category updated." : "Category created." };
  } catch (error) {
    if (error instanceof PermissionError) return { error: error.message };
    return { error: (error as Error).message };
  }
}

export async function deleteCategoryAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("products:write");
  const slug = String(formData.get("slug") ?? "");
  if (!slug) return;

  // Throws when products still reference it; the page surfaces the message.
  await deleteCategory(slug);
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "delete",
    entity: "category",
    entityId: slug,
    summary: `Deleted category “${slug}”`,
  });

  revalidateTaxonomy();
}

/* ------------------------------ Collections ------------------------------- */

export async function saveCollectionAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  try {
    const admin = await requirePermission("products:write");

    const existingSlug = String(formData.get("existingSlug") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const blurb = String(formData.get("blurb") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const slug = String(formData.get("slug") ?? "").trim();
    const hidden = formData.get("hidden") === "on";

    if (!name) return { error: "A collection name is required." };

    if (existingSlug) {
      const updated = await updateCollection(existingSlug, {
        name,
        blurb,
        description,
        slug,
        hidden,
      });
      await recordAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "update",
        entity: "collection",
        entityId: updated.slug,
        summary: `Updated collection “${updated.name}”`,
      });
    } else {
      const created = await createCollection({ name, blurb, description, slug, hidden });
      await recordAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "create",
        entity: "collection",
        entityId: created.slug,
        summary: `Created collection “${created.name}”`,
      });
    }

    revalidateTaxonomy();
    return { success: existingSlug ? "Collection updated." : "Collection created." };
  } catch (error) {
    if (error instanceof PermissionError) return { error: error.message };
    return { error: (error as Error).message };
  }
}

export async function deleteCollectionAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("products:write");
  const slug = String(formData.get("slug") ?? "");
  if (!slug) return;

  await deleteCollection(slug);
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "delete",
    entity: "collection",
    entityId: slug,
    summary: `Deleted collection “${slug}” and detached it from all products`,
  });

  revalidateTaxonomy();
}

/* -------------------------------- Reviews --------------------------------- */

export async function toggleReviewAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("products:write");

  const id = String(formData.get("id") ?? "");
  const hidden = formData.get("hidden") === "1";
  if (!id) return;

  await setReviewHidden(id, hidden);
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "update",
    entity: "review",
    entityId: id,
    summary: `${hidden ? "Hid" : "Restored"} review ${id}`,
  });

  revalidatePath("/admin/reviews");
  revalidatePath("/", "layout");
}
