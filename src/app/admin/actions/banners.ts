"use server";

import { revalidatePath } from "next/cache";
import type { Banner } from "@/lib/types";
import { recordAudit } from "@/server/audit";
import {
  createBanner,
  deleteBanner,
  moveBanner,
  setBannerActive,
  updateBanner,
  type BannerInput,
} from "@/server/repositories/banners";
import { PermissionError, requirePermission } from "@/server/session";

/**
 * Home-page banner actions.
 *
 * Gated on `products:write` rather than `settings:write`: this is merchandising, so a
 * manager should be able to run a campaign without also being able to change the tax
 * rate or add staff.
 */

export interface BannerActionState {
  error?: string;
  success?: string;
}

/** The home page is prerendered, so a slide change needs an explicit revalidate. */
function revalidateBanners(): void {
  revalidatePath("/");
  revalidatePath("/admin/banners");
}

function toneFrom(value: FormDataEntryValue | null): Banner["textTone"] {
  return String(value) === "dark" ? "dark" : "light";
}

function alignFrom(value: FormDataEntryValue | null): Banner["align"] {
  return String(value) === "center" ? "center" : "left";
}

/**
 * `datetime-local` gives `2026-08-17T14:30` with no zone, which is what the merchant
 * means in their own time. Storing it as an ISO instant keeps comparisons simple.
 */
function instantFrom(value: FormDataEntryValue | null): string | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export async function saveBannerAction(
  _previous: BannerActionState,
  formData: FormData,
): Promise<BannerActionState> {
  try {
    const admin = await requirePermission("products:write");

    const id = String(formData.get("id") ?? "").trim();

    const input: BannerInput = {
      eyebrow: String(formData.get("eyebrow") ?? ""),
      heading: String(formData.get("heading") ?? ""),
      body: String(formData.get("body") ?? ""),
      ctaLabel: String(formData.get("ctaLabel") ?? ""),
      ctaHref: String(formData.get("ctaHref") ?? ""),
      imageUrl: String(formData.get("imageUrl") ?? ""),
      imageUrlMobile: String(formData.get("imageUrlMobile") ?? ""),
      imageUrlTablet: String(formData.get("imageUrlTablet") ?? ""),
      imageAlt: String(formData.get("imageAlt") ?? ""),
      accentHex: String(formData.get("accentHex") ?? ""),
      textTone: toneFrom(formData.get("textTone")),
      align: alignFrom(formData.get("align")),
      active: formData.get("active") === "on",
      startsAt: instantFrom(formData.get("startsAt")),
      endsAt: instantFrom(formData.get("endsAt")),
    };

    const banner = id ? await updateBanner(id, input) : await createBanner(input);

    await recordAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: id ? "update" : "create",
      entity: "banner",
      entityId: banner.id,
      summary: `${id ? "Updated" : "Created"} banner “${banner.heading}”`,
    });

    revalidateBanners();
    return { success: id ? "Banner updated." : "Banner created." };
  } catch (error) {
    if (error instanceof PermissionError) return { error: error.message };
    return { error: (error as Error).message };
  }
}

export async function toggleBannerAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("products:write");

  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "1";
  if (!id) return;

  const banner = await setBannerActive(id, active);
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "status",
    entity: "banner",
    entityId: id,
    summary: `${active ? "Published" : "Unpublished"} banner “${banner.heading}”`,
  });

  revalidateBanners();
}

export async function moveBannerAction(formData: FormData): Promise<void> {
  await requirePermission("products:write");

  const id = String(formData.get("id") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (!id || (direction !== "up" && direction !== "down")) return;

  await moveBanner(id, direction);
  revalidateBanners();
}

export async function deleteBannerAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("products:write");

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await deleteBanner(id);
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "delete",
    entity: "banner",
    entityId: id,
    summary: `Deleted banner ${id}`,
  });

  revalidateBanners();
}
