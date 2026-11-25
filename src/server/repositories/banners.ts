import { randomUUID } from "node:crypto";
import { bannerState, type BannerState } from "@/lib/banners";
import type { Banner } from "@/lib/types";
import { isUploadedImage } from "@/lib/uploads";
import { callRpc, db, insertInto, unwrap, updateTable } from "../supabase";
import type { BannerRow } from "../database.types";

/**
 * Home-page hero slides.
 *
 * Two reads, deliberately separate: `listBanners` returns everything for the admin
 * table, `listLiveBanners` returns only what a shopper should see right now. Keeping
 * the schedule and active checks in one place means no page can forget them.
 */

function fromRow(row: BannerRow): Banner {
  return {
    id: row.id,
    eyebrow: row.eyebrow ?? undefined,
    heading: row.heading,
    body: row.body ?? undefined,
    ctaLabel: row.cta_label ?? undefined,
    ctaHref: row.cta_href ?? undefined,
    imageUrl: row.image_url ?? undefined,
    imageUrlMobile: row.image_url_mobile ?? undefined,
    imageUrlTablet: row.image_url_tablet ?? undefined,
    imageAlt: row.image_alt ?? undefined,
    accentHex: row.accent_hex ?? undefined,
    textTone: row.text_tone,
    align: row.align,
    active: row.active,
    position: row.position,
    startsAt: row.starts_at ?? undefined,
    endsAt: row.ends_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listBanners(): Promise<Banner[]> {
  const rows = unwrap(
    await db()
      .from("banners")
      .select("*")
      .order("position", { ascending: true })
      .overrideTypes<BannerRow[], { merge: false }>(),
  );
  return rows.map(fromRow);
}

export async function getBanner(id: string): Promise<Banner | undefined> {
  const row = unwrap(
    await db()
      .from("banners")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .overrideTypes<BannerRow, { merge: false }>(),
  );
  return row ? fromRow(row) : undefined;
}

/**
 * Slides the storefront may show, in order.
 *
 * Delegates to `bannerState` so this and the admin panel's row labels can never
 * disagree about whether a slide is live.
 */
export async function listLiveBanners(now = Date.now()): Promise<Banner[]> {
  return (await listBanners()).filter((banner) => bannerState(banner, now) === "live");
}

/**
 * Every slide's current state, keyed by id, for the admin list.
 *
 * The clock is read here rather than in the page because reading it inside a
 * component render body is impure — the React Compiler rejects it, and rightly so.
 */
export async function listBannerStates(
  now = Date.now(),
): Promise<Record<string, BannerState>> {
  const banners = await listBanners();
  return Object.fromEntries(
    banners.map((banner) => [banner.id, bannerState(banner, now)]),
  );
}

export interface BannerInput {
  eyebrow?: string;
  heading: string;
  body?: string;
  ctaLabel?: string;
  ctaHref?: string;
  imageUrl?: string;
  imageUrlMobile?: string;
  imageUrlTablet?: string;
  imageAlt?: string;
  accentHex?: string;
  textTone: Banner["textTone"];
  align: Banner["align"];
  active: boolean;
  startsAt?: string;
  endsAt?: string;
}

/**
 * Validation lives here, not only in the form, so a slide can never be persisted in
 * a state the storefront cannot render.
 */
function assertValid(input: BannerInput): void {
  if (!input.heading.trim()) throw new Error("A heading is required.");
  if (input.heading.length > 120) throw new Error("Keep the heading under 120 characters.");

  // A button with no destination, or a destination with no label, is a dead end.
  const hasLabel = Boolean(input.ctaLabel?.trim());
  const hasHref = Boolean(input.ctaHref?.trim());
  if (hasLabel !== hasHref) {
    throw new Error("A call to action needs both a label and a link, or neither.");
  }

  if (hasHref) {
    const href = input.ctaHref!.trim();
    // Internal paths or absolute https only. Blocks javascript: and data: URLs.
    if (!href.startsWith("/") && !href.startsWith("https://")) {
      throw new Error("The link must start with / for an internal page, or https://");
    }
  }

  /**
   * Either an image uploaded through the admin panel, or an absolute https URL.
   *
   * Uploads are the normal route now and arrive as `/uploads/<hash>.<ext>`. External
   * URLs are still accepted because existing records may hold them and a CDN is a
   * legitimate choice — but nothing else is, so `javascript:` and `data:` stay out, and
   * a bare relative path cannot be used to point the banner at some other route.
   */
  /*
   * All three crops go through the same gate. Validating only the desktop one would
   * leave the mobile and tablet slots as an unchecked way into an `<img src>`.
   */
  for (const [slot, raw] of [
    ["Banner image", input.imageUrl],
    ["Mobile image", input.imageUrlMobile],
    ["Tablet image", input.imageUrlTablet],
  ] as const) {
    const image = raw?.trim();
    if (image && !isUploadedImage(image) && !image.startsWith("https://")) {
      throw new Error(
        `${slot}: upload a file, or give an absolute https:// URL to one hosted elsewhere.`,
      );
    }
  }

  if (input.accentHex?.trim() && !/^#[0-9a-fA-F]{6}$/.test(input.accentHex.trim())) {
    throw new Error("The accent colour must be a six-digit hex value, e.g. #B08D63");
  }

  if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) {
    throw new Error("The end date must be after the start date.");
  }
}

/** Trim, and turn empty strings into `undefined` so the record stays clean. */
function clean(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function normalise(input: BannerInput) {
  return {
    eyebrow: clean(input.eyebrow) ?? null,
    heading: input.heading.trim(),
    body: clean(input.body) ?? null,
    cta_label: clean(input.ctaLabel) ?? null,
    cta_href: clean(input.ctaHref) ?? null,
    image_url: clean(input.imageUrl) ?? null,
    image_url_mobile: clean(input.imageUrlMobile) ?? null,
    image_url_tablet: clean(input.imageUrlTablet) ?? null,
    image_alt: clean(input.imageAlt) ?? null,
    accent_hex: clean(input.accentHex) ?? null,
    text_tone: input.textTone,
    align: input.align,
    active: input.active,
    starts_at: clean(input.startsAt) ?? null,
    ends_at: clean(input.endsAt) ?? null,
  };
}

export async function createBanner(input: BannerInput): Promise<Banner> {
  assertValid(input);

  const existing = unwrap(
    await db()
      .from("banners")
      .select("position")
      .overrideTypes<Array<Pick<BannerRow, "position">>, { merge: false }>(),
  );
  const highest = existing.reduce((max, row) => Math.max(max, row.position), -1);

  const row = unwrap(
    await insertInto(db(), "banners", {
      id: `ban_${randomUUID().slice(0, 8)}`,
      ...normalise(input),
      // New slides go last, so creating one never reorders what is already live.
      position: highest + 1,
    })
      .select("*")
      .single()
      .overrideTypes<unknown, { merge: false }>(),
  ) as BannerRow;

  return fromRow(row);
}

export async function updateBanner(id: string, input: BannerInput): Promise<Banner> {
  assertValid(input);

  const row = unwrap(
    await updateTable(db(), "banners", normalise(input))
      .eq("id", id)
      .select("*")
      .single()
      .overrideTypes<unknown, { merge: false }>(),
  ) as BannerRow | null;

  if (!row) throw new Error(`Banner ${id} not found`);
  return fromRow(row);
}

export async function deleteBanner(id: string): Promise<void> {
  // Closes the position gap so the remaining slides stay contiguous and
  // reordering keeps working — see delete_banner_and_close_gap() in
  // supabase/migrations/00000000000003_functions.sql.
  const { error } = await callRpc(db(), "delete_banner_and_close_gap", { p_id: id });
  if (error) throw new Error(error.message);
}

export async function setBannerActive(id: string, active: boolean): Promise<Banner> {
  const row = unwrap(
    await updateTable(db(), "banners", { active })
      .eq("id", id)
      .select("*")
      .single()
      .overrideTypes<unknown, { merge: false }>(),
  ) as BannerRow | null;

  if (!row) throw new Error(`Banner ${id} not found`);
  return fromRow(row);
}

/**
 * Nudge a slide one place up or down.
 *
 * A pair swap rather than a full reorder payload, because the admin list uses two
 * arrow buttons — the simplest control that works without drag-and-drop, and the
 * only one that is keyboard accessible for free.
 */
export async function moveBanner(id: string, direction: "up" | "down"): Promise<void> {
  const ordered = await listBanners();
  const index = ordered.findIndex((banner) => banner.id === id);
  if (index === -1) return;

  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= ordered.length) return;

  const positionA = ordered[index].position;
  const positionB = ordered[target].position;

  // Two updates, not a transaction: the worst outcome of one succeeding and
  // the other failing is two slides briefly sharing a position, which the
  // next read simply re-sorts around — nothing is lost, and it self-heals on
  // the next successful move. Not worth a dedicated RPC for that risk profile.
  await Promise.all([
    updateTable(db(), "banners", { position: positionB }).eq("id", ordered[index].id),
    updateTable(db(), "banners", { position: positionA }).eq("id", ordered[target].id),
  ]);
}
