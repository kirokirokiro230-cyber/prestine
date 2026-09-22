import { randomUUID } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { bannerState, type BannerState } from "@/lib/banners";
import type { Banner } from "@/lib/types";
import { isUploadedImage } from "@/lib/uploads";
import { getDb, isDatabaseConfigured } from "../db/client";
import { fromBanner, toBanner } from "../db/mappers";
import { banners as bannersTable } from "../db/schema";
import { mutateStore, readStore } from "../store";

/**
 * Home-page hero slides.
 *
 * Two reads, deliberately separate: `listBanners` returns everything for the admin
 * table, `listLiveBanners` returns only what a shopper should see right now. Keeping
 * the schedule and active checks in one place means no page can forget them.
 *
 * Two backends, chosen by whether a database is configured — see `login-attempts.ts`
 * for the precedent.
 */

export async function listBanners(): Promise<Banner[]> {
  if (!isDatabaseConfigured()) {
    const { banners } = await readStore();
    return [...banners].sort((a, b) => a.position - b.position);
  }

  const rows = await getDb().select().from(bannersTable).orderBy(asc(bannersTable.position));
  return rows.map(toBanner);
}

export async function getBanner(id: string): Promise<Banner | undefined> {
  if (!isDatabaseConfigured()) {
    return (await readStore()).banners.find((banner) => banner.id === id);
  }

  const [row] = await getDb().select().from(bannersTable).where(eq(bannersTable.id, id));
  return row ? toBanner(row) : undefined;
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
    eyebrow: clean(input.eyebrow),
    heading: input.heading.trim(),
    body: clean(input.body),
    ctaLabel: clean(input.ctaLabel),
    ctaHref: clean(input.ctaHref),
    imageUrl: clean(input.imageUrl),
    imageUrlMobile: clean(input.imageUrlMobile),
    imageUrlTablet: clean(input.imageUrlTablet),
    imageAlt: clean(input.imageAlt),
    accentHex: clean(input.accentHex),
    textTone: input.textTone,
    align: input.align,
    active: input.active,
    startsAt: clean(input.startsAt),
    endsAt: clean(input.endsAt),
  };
}

export async function createBanner(input: BannerInput): Promise<Banner> {
  assertValid(input);

  if (!isDatabaseConfigured()) {
    return mutateStore((store) => {
      const now = new Date().toISOString();
      const highest = store.banners.reduce(
        (max, banner) => Math.max(max, banner.position),
        -1,
      );

      const banner: Banner = {
        id: `ban_${randomUUID().slice(0, 8)}`,
        ...normalise(input),
        // New slides go last, so creating one never reorders what is already live.
        position: highest + 1,
        createdAt: now,
        updatedAt: now,
      };

      store.banners.push(banner);
      return banner;
    });
  }

  return getDb().transaction(async (tx) => {
    const now = new Date().toISOString();
    const [{ highest }] = await tx
      .select({ highest: sql<number>`coalesce(max(${bannersTable.position}), -1)` })
      .from(bannersTable);

    const banner: Banner = {
      id: `ban_${randomUUID().slice(0, 8)}`,
      ...normalise(input),
      position: highest + 1,
      createdAt: now,
      updatedAt: now,
    };

    await tx.insert(bannersTable).values(fromBanner(banner));
    return banner;
  });
}

export async function updateBanner(id: string, input: BannerInput): Promise<Banner> {
  assertValid(input);

  if (!isDatabaseConfigured()) {
    return mutateStore((store) => {
      const index = store.banners.findIndex((banner) => banner.id === id);
      if (index === -1) throw new Error(`Banner ${id} not found`);

      const next: Banner = {
        ...store.banners[index],
        ...normalise(input),
        id,
        updatedAt: new Date().toISOString(),
      };

      store.banners[index] = next;
      return next;
    });
  }

  return getDb().transaction(async (tx) => {
    const [current] = await tx.select().from(bannersTable).where(eq(bannersTable.id, id));
    if (!current) throw new Error(`Banner ${id} not found`);

    const next: Banner = {
      ...toBanner(current),
      ...normalise(input),
      id,
      updatedAt: new Date().toISOString(),
    };

    await tx.update(bannersTable).set(fromBanner(next)).where(eq(bannersTable.id, id));
    return next;
  });
}

export async function deleteBanner(id: string): Promise<void> {
  if (!isDatabaseConfigured()) {
    await mutateStore((store) => {
      store.banners = store.banners.filter((banner) => banner.id !== id);
      // Close the gap so positions stay contiguous and reordering keeps working.
      store.banners
        .sort((a, b) => a.position - b.position)
        .forEach((banner, index) => {
          banner.position = index;
        });
    });
    return;
  }

  await getDb().transaction(async (tx) => {
    await tx.delete(bannersTable).where(eq(bannersTable.id, id));

    // Close the gap so positions stay contiguous and reordering keeps working.
    const remaining = await tx
      .select({ id: bannersTable.id })
      .from(bannersTable)
      .orderBy(asc(bannersTable.position));
    for (const [index, row] of remaining.entries()) {
      await tx.update(bannersTable).set({ position: index }).where(eq(bannersTable.id, row.id));
    }
  });
}

export async function setBannerActive(id: string, active: boolean): Promise<Banner> {
  if (!isDatabaseConfigured()) {
    return mutateStore((store) => {
      const banner = store.banners.find((entry) => entry.id === id);
      if (!banner) throw new Error(`Banner ${id} not found`);

      banner.active = active;
      banner.updatedAt = new Date().toISOString();
      return banner;
    });
  }

  const db = getDb();
  const updatedAt = new Date().toISOString();
  const [row] = await db
    .update(bannersTable)
    .set({ active, updatedAt: new Date(updatedAt) })
    .where(eq(bannersTable.id, id))
    .returning();
  if (!row) throw new Error(`Banner ${id} not found`);
  return toBanner(row);
}

/**
 * Nudge a slide one place up or down.
 *
 * A pair swap rather than a full reorder payload, because the admin list uses two
 * arrow buttons — the simplest control that works without drag-and-drop, and the
 * only one that is keyboard accessible for free.
 */
export async function moveBanner(id: string, direction: "up" | "down"): Promise<void> {
  if (!isDatabaseConfigured()) {
    await mutateStore((store) => {
      const ordered = [...store.banners].sort((a, b) => a.position - b.position);
      const index = ordered.findIndex((banner) => banner.id === id);
      if (index === -1) return;

      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= ordered.length) return;

      const positionA = ordered[index].position;
      ordered[index].position = ordered[target].position;
      ordered[target].position = positionA;
    });
    return;
  }

  await getDb().transaction(async (tx) => {
    const ordered = await tx
      .select({ id: bannersTable.id, position: bannersTable.position })
      .from(bannersTable)
      .orderBy(asc(bannersTable.position));
    const index = ordered.findIndex((banner) => banner.id === id);
    if (index === -1) return;

    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= ordered.length) return;

    const positionA = ordered[index].position;
    const positionB = ordered[target].position;
    await tx.update(bannersTable).set({ position: positionB }).where(eq(bannersTable.id, ordered[index].id));
    await tx.update(bannersTable).set({ position: positionA }).where(eq(bannersTable.id, ordered[target].id));
  });
}
