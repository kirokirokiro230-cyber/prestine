"use server";

import { revalidatePath } from "next/cache";
import type { AdminRole, ServicePromise } from "@/lib/types";
import { recordAudit } from "@/server/audit";
import { createAdmin, deleteAdmin, updateAdmin } from "@/server/auth";
import {
  createPromoCode,
  deletePromoCode,
  updatePromoCode,
  updateSettings,
} from "@/server/repositories/settings";
import { PermissionError, requirePermission } from "@/server/session";

/**
 * Settings, discounts, shipping and staff actions.
 *
 * These carry the highest privilege in the panel, so each one is gated on its own
 * permission rather than a blanket "is admin" check — a manager can run a discount
 * but cannot change the tax rate or add a user.
 */

export interface SettingsActionState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
}

function money(raw: FormDataEntryValue | null): number {
  const value = Number(String(raw ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(value) ? Math.round(value * 100) : NaN;
}

/** A textarea into trimmed, non-empty lines — the idiom `announcements` already uses. */
function textLines(raw: FormDataEntryValue | null): string[] {
  return String(raw ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Service promises from a textarea, one `Title | Body` pair per line.
 *
 * A pipe-separated line rather than three pairs of inputs: the list is variable
 * length, and repeated field groups in a plain server-action form need client-side
 * add/remove machinery that this does not justify. A line with no pipe becomes a
 * title with an empty body rather than being dropped, so a merchant who forgets the
 * separator sees their text on the site instead of it vanishing.
 */
function parseServicePromises(raw: FormDataEntryValue | null): ServicePromise[] {
  return textLines(raw).map((line) => {
    const [title, ...rest] = line.split("|");
    return { title: title.trim(), body: rest.join("|").trim() };
  });
}

/* -------------------------------- Settings -------------------------------- */

export async function saveSettingsAction(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    const admin = await requirePermission("settings:write");

    const taxPercent = Number(String(formData.get("taxRate") ?? ""));
    const freeShipping = money(formData.get("freeShippingThreshold"));
    const standardRate = money(formData.get("standardShippingRate"));
    const returnHours = Number(String(formData.get("returnWindowHours") ?? ""));
    const arrivalsCount = Number(String(formData.get("homeNewArrivalsCount") ?? ""));
    const deliveryMin = Number(String(formData.get("deliveryDaysMin") ?? ""));
    const deliveryMax = Number(String(formData.get("deliveryDaysMax") ?? ""));
    const reviewDelay = Number(String(formData.get("reviewRequestDelayDays") ?? ""));
    const codFee = money(formData.get("codFee"));
    const codMinOrder = money(formData.get("codMinOrder"));
    const codMaxOrder = money(formData.get("codMaxOrder"));
    const firstOrderPercent = Number(String(formData.get("firstOrderDiscountPercent") ?? ""));

    const fieldErrors: Record<string, string> = {};
    /*
     * Whole percentages only, and capped at 100 by the database as well. A fractional or
     * negative figure would produce an odd discount, and "10.5" is more likely a typo for
     * 10 or 105 than a deliberate rate.
     */
    if (!Number.isInteger(firstOrderPercent) || firstOrderPercent < 0 || firstOrderPercent > 100) {
      fieldErrors.firstOrderDiscountPercent = "Enter a whole number between 0 and 100.";
    }
    /*
     * Capped at 24 rather than left open. The home page renders this many cards in a
     * four-column grid with a horizontal rail; an accidental 500 would ship the whole
     * catalogue to the browser on the busiest page on the site.
     */
    if (!Number.isFinite(arrivalsCount) || arrivalsCount < 1 || arrivalsCount > 24) {
      fieldErrors.homeNewArrivalsCount = "Enter a number between 1 and 24.";
    }

    for (const [value, field] of [
      [deliveryMin, "deliveryDaysMin"],
      [deliveryMax, "deliveryDaysMax"],
    ] as const) {
      if (!Number.isFinite(value) || value < 1 || value > 60) {
        fieldErrors[field] = "Enter a number of business days between 1 and 60.";
      }
    }
    /*
     * A reversed range would render "5–3 business days". Checked here rather than
     * silently swapping them, because a merchant who typed them the wrong way round has
     * probably mixed up which field is which and should see that.
     */
    if (!fieldErrors.deliveryDaysMin && !fieldErrors.deliveryDaysMax && deliveryMin > deliveryMax) {
      fieldErrors.deliveryDaysMax = "The upper figure must be at least the lower one.";
    }
    /*
     * Zero is allowed — asking immediately is a defensible if unwise choice — but the
     * upper bound is not open. A review request three months after delivery reads as a
     * shop that has lost track, and a fat-fingered 3650 would sit in the queue forever.
     */
    if (!Number.isFinite(reviewDelay) || reviewDelay < 0 || reviewDelay > 90) {
      fieldErrors.reviewRequestDelayDays = "Enter a number of days between 0 and 90.";
    }
    if (!Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent > 100) {
      fieldErrors.taxRate = "Enter a percentage between 0 and 100.";
    }
    if (!Number.isFinite(freeShipping) || freeShipping < 0) {
      fieldErrors.freeShippingThreshold = "Enter a valid amount.";
    }
    if (!Number.isFinite(standardRate) || standardRate < 0) {
      fieldErrors.standardShippingRate = "Enter a valid amount.";
    }
    /*
     * Zero is allowed and means no returns at all. The ceiling is a year: this value
     * is now enforced, so a fat-fingered 48000 would quietly hold the shop to a
     * five-year returns liability rather than just reading oddly in the footer.
     */
    if (!Number.isFinite(returnHours) || returnHours < 0 || returnHours > 8760) {
      fieldErrors.returnWindowHours = "Enter a number of hours between 0 and 8760 (one year).";
    }

    for (const [value, field] of [
      [codFee, "codFee"],
      [codMinOrder, "codMinOrder"],
      [codMaxOrder, "codMaxOrder"],
    ] as const) {
      if (!Number.isFinite(value) || value < 0) {
        fieldErrors[field] = "Enter a valid amount, or zero.";
      }
    }
    /*
     * A window with the ceiling below the floor offers COD on nothing, silently.
     * Reported rather than normalised, because a merchant who typed them the
     * wrong way round should see it.
     */
    if (
      !fieldErrors.codMinOrder &&
      !fieldErrors.codMaxOrder &&
      codMaxOrder > 0 &&
      codMinOrder > codMaxOrder
    ) {
      fieldErrors.codMaxOrder = "The maximum must be at least the minimum, or zero for no limit.";
    }

    const url = String(formData.get("url") ?? "").trim();
    if (url && !/^https?:\/\//i.test(url)) {
      fieldErrors.url = "Include the protocol, e.g. https://your-domain.com";
    }

    if (Object.keys(fieldErrors).length > 0) {
      return { fieldErrors, error: "Fix the highlighted fields and try again." };
    }

    await updateSettings({
      name: String(formData.get("name") ?? "").trim(),
      legalName: String(formData.get("legalName") ?? "").trim(),
      tagline: String(formData.get("tagline") ?? "").trim(),
      description: String(formData.get("description") ?? "").trim(),
      url,
      email: String(formData.get("email") ?? "").trim(),
      phone: String(formData.get("phone") ?? "").trim(),
      address: String(formData.get("address") ?? "").trim(),
      currency: String(formData.get("currency") ?? "USD").trim().toUpperCase(),
      locale: String(formData.get("locale") ?? "en-US").trim(),
      // Stored as a fraction; entered as a percentage, which is how people think.
      taxRate: taxPercent / 100,
      freeShippingThreshold: freeShipping,
      standardShippingRate: standardRate,
      codEnabled: formData.get("codEnabled") === "on",
      codFee,
      codMinOrder,
      codMaxOrder,
      firstOrderDiscountPercent: firstOrderPercent,
      returnWindowHours: Math.trunc(returnHours),
      deliveryDaysMin: Math.trunc(deliveryMin),
      deliveryDaysMax: Math.trunc(deliveryMax),
      reviewRequestDelayDays: Math.trunc(reviewDelay),
      maintenanceMode: formData.get("maintenanceMode") === "on",
      announcements: textLines(formData.get("announcements")),
      marqueeItems: textLines(formData.get("marqueeItems")),
      homeNewArrivalsCount: arrivalsCount,
      servicePromises: parseServicePromises(formData.get("servicePromises")),
      shippingReturnsCopy: textLines(formData.get("shippingReturnsCopy")),
      social: {
        instagram: String(formData.get("instagram") ?? "").trim(),
        pinterest: String(formData.get("pinterest") ?? "").trim(),
        youtube: String(formData.get("youtube") ?? "").trim(),
      },
    });

    await recordAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "update",
      entity: "settings",
      entityId: "store",
      summary: "Updated store settings",
    });

    // Settings touch the header, footer and every price on the site.
    revalidatePath("/", "layout");
    revalidatePath("/admin/settings");

    return { success: "Settings saved." };
  } catch (error) {
    if (error instanceof PermissionError) return { error: error.message };
    return { error: (error as Error).message };
  }
}

/*
 * `saveShippingAction` was here. Removed with the shipping_methods table — delivery cost
 * and the delivery-days promise are plain settings fields now, saved by
 * `saveSettingsAction` above.
 */

/* ------------------------------- Discounts -------------------------------- */

export async function savePromoAction(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    const admin = await requirePermission("discounts:write");

    const existingCode = String(formData.get("existingCode") ?? "").trim();
    const kind = String(formData.get("kind") ?? "percent");

    const percentRaw = Number(String(formData.get("percentOff") ?? ""));
    const amountRaw = money(formData.get("amountOff"));
    const minRaw = String(formData.get("minSubtotal") ?? "").trim();

    const input = {
      code: String(formData.get("code") ?? "").trim(),
      description: String(formData.get("description") ?? "").trim(),
      percentOff: kind === "percent" && Number.isFinite(percentRaw) ? percentRaw : undefined,
      amountOff: kind === "amount" && Number.isFinite(amountRaw) ? amountRaw : undefined,
      minSubtotal: minRaw ? money(formData.get("minSubtotal")) : undefined,
    };

    if (existingCode) {
      await updatePromoCode(existingCode, input);
    } else {
      await createPromoCode(input);
    }

    await recordAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: existingCode ? "update" : "create",
      entity: "discount",
      entityId: input.code.toUpperCase(),
      summary: `${existingCode ? "Updated" : "Created"} discount ${input.code.toUpperCase()}`,
    });

    revalidatePath("/admin/discounts");
    return { success: existingCode ? "Discount updated." : "Discount created." };
  } catch (error) {
    if (error instanceof PermissionError) return { error: error.message };
    return { error: (error as Error).message };
  }
}

export async function deletePromoAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("discounts:write");
  const code = String(formData.get("code") ?? "");
  if (!code) return;

  await deletePromoCode(code);
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "delete",
    entity: "discount",
    entityId: code,
    summary: `Deleted discount ${code}`,
  });

  revalidatePath("/admin/discounts");
}

/* --------------------------------- Staff ---------------------------------- */

const ROLES: AdminRole[] = ["owner", "manager", "staff"];

export async function createStaffAction(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    const admin = await requirePermission("staff:write");

    const role = String(formData.get("role") ?? "staff") as AdminRole;
    const created = await createAdmin({
      name: String(formData.get("name") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim(),
      password: String(formData.get("password") ?? ""),
      role: ROLES.includes(role) ? role : "staff",
    });

    await recordAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "create",
      entity: "admin",
      entityId: created.id,
      summary: `Added ${created.role} account ${created.email}`,
    });

    revalidatePath("/admin/staff");
    return { success: `${created.email} can now sign in.` };
  } catch (error) {
    if (error instanceof PermissionError) return { error: error.message };
    return { error: (error as Error).message };
  }
}

export async function updateStaffAction(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    const admin = await requirePermission("staff:write");

    const id = String(formData.get("id") ?? "");
    const role = String(formData.get("role") ?? "") as AdminRole;
    const password = String(formData.get("password") ?? "");

    const updated = await updateAdmin(id, {
      name: String(formData.get("name") ?? "").trim() || undefined,
      role: ROLES.includes(role) ? role : undefined,
      disabled: formData.get("disabled") === "on",
      password: password || undefined,
    });

    await recordAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "update",
      entity: "admin",
      entityId: id,
      summary: `Updated account ${updated.email}${password ? " (password reset)" : ""}`,
    });

    revalidatePath("/admin/staff");
    return { success: "Account updated." };
  } catch (error) {
    if (error instanceof PermissionError) return { error: error.message };
    return { error: (error as Error).message };
  }
}

export async function deleteStaffAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("staff:write");
  const id = String(formData.get("id") ?? "");
  if (!id || id === admin.id) return; // never delete yourself

  await deleteAdmin(id);
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "delete",
    entity: "admin",
    entityId: id,
    summary: `Removed admin account ${id}`,
  });

  revalidatePath("/admin/staff");
}
