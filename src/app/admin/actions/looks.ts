"use server";

import { revalidatePath } from "next/cache";
import { recordAudit } from "@/server/audit";
import {
  createLook,
  deleteLook,
  moveLook,
  setLookActive,
  updateLook,
} from "@/server/repositories/looks";
import { PermissionError, requirePermission } from "@/server/session";

/**
 * Style hint actions.
 *
 * Gated on `products:write`, the same as banners: this is merchandising, so a manager can
 * run it without also being able to change the tax rate or add staff.
 */

export interface LookActionState {
  error?: string;
  success?: string;
}

/** The look shows on product pages, which render per request, plus the admin list. */
function revalidateLooks(): void {
  revalidatePath("/admin/styling");
  // The per-product editor lives on the product's own admin page.
  revalidatePath("/admin/products/[id]", "page");
  revalidatePath("/product/[slug]", "page");
}

export async function saveLookAction(
  _previous: LookActionState,
  formData: FormData,
): Promise<LookActionState> {
  try {
    const admin = await requirePermission("products:write");

    const id = String(formData.get("id") ?? "").trim();

    const input = {
      title: String(formData.get("title") ?? ""),
      imageUrl: String(formData.get("imageUrl") ?? ""),
      active: formData.get("active") === "on",
      // Repeated `productId` fields, in the order they were ticked.
      productIds: formData.getAll("productId").map((value) => String(value)),
      // The subset whose own page the photograph appears on.
      shownOn: formData.getAll("shownOn").map((value) => String(value)),
    };

    const look = id ? await updateLook(id, input) : await createLook(input);

    await recordAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: id ? "update" : "create",
      entity: "style look",
      entityId: look.id,
      summary: `${id ? "Updated" : "Created"} style hint “${look.title}” (${look.productIds.length} products, shown on ${look.shownOn.length} page${look.shownOn.length === 1 ? "" : "s"})`,
    });

    revalidateLooks();
    return { success: id ? "Style hint updated." : "Style hint created." };
  } catch (error) {
    if (error instanceof PermissionError) return { error: error.message };

    const message = (error as Error).message;

    /*
     * The `shown` column comes from migration 18. Without it the database answers with
     * "could not find the 'shown' column", which tells the merchant nothing they can act
     * on. Name the file instead.
     */
    if (/\bshown\b/i.test(message) && /column|schema cache/i.test(message)) {
      return {
        error:
          "One more database step is needed. Run supabase/migrations/00000000000018_style_look_shown.sql in the Supabase SQL editor, then try again.",
      };
    }

    return { error: message };
  }
}

export async function toggleLookAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("products:write");

  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "1";
  if (!id) return;

  await setLookActive(id, active);
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "status",
    entity: "style look",
    entityId: id,
    summary: `${active ? "Published" : "Unpublished"} style hint ${id}`,
  });

  revalidateLooks();
}

export async function moveLookAction(formData: FormData): Promise<void> {
  await requirePermission("products:write");

  const id = String(formData.get("id") ?? "");
  const direction = String(formData.get("direction") ?? "");
  // Present on a product's own page: the arrows then order that product's photos.
  const withinProductId = String(formData.get("withinProductId") ?? "").trim() || undefined;
  if (!id || (direction !== "up" && direction !== "down")) return;

  await moveLook(id, direction, withinProductId);
  revalidateLooks();
}

export async function deleteLookAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("products:write");

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await deleteLook(id);
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "delete",
    entity: "style look",
    entityId: id,
    summary: `Deleted style hint ${id}`,
  });

  revalidateLooks();
}
