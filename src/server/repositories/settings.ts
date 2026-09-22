import { eq } from "drizzle-orm";
import { createTtlCache } from "@/lib/ttl-cache";
import type { PromoCode, StoreSettings } from "@/lib/types";
import { getDb, isDatabaseConfigured } from "../db/client";
import { fromPromoCode, fromSettings, toPromoCode, toSettings } from "../db/mappers";
import { hiddenReviews, orders as ordersTable, promoCodes, settings as settingsTable } from "../db/schema";
import { mutateStore, readStore } from "../store";

/**
 * Store settings, promotion codes and shipping methods.
 *
 * These were compile-time constants in `config.ts`; the store now owns them so a
 * merchant can change a tax rate or launch a discount without a deploy. `config.ts`
 * remains the seed.
 *
 * Two backends, chosen by whether a database is configured — see `login-attempts.ts`
 * for the precedent.
 */

export async function getSettings(): Promise<StoreSettings> {
  if (!isDatabaseConfigured()) {
    return (await readStore()).settings;
  }

  const [row] = await getDb().select().from(settingsTable);
  if (!row) throw new Error("Settings row is missing. Run the seed script.");
  return toSettings(row);
}

export async function updateSettings(
  patch: Partial<StoreSettings>,
): Promise<StoreSettings> {
  let next: StoreSettings;

  if (!isDatabaseConfigured()) {
    next = await mutateStore((store) => {
      store.settings = {
        ...store.settings,
        ...patch,
        // Nested objects need an explicit merge or a partial update wipes the rest.
        social: { ...store.settings.social, ...(patch.social ?? {}) },
      };
      return store.settings;
    });
  } else {
    const current = await getSettings();
    next = {
      ...current,
      ...patch,
      social: { ...current.social, ...(patch.social ?? {}) },
    };
    await getDb().update(settingsTable).set(fromSettings(next)).where(eq(settingsTable.id, 1));
  }

  /*
   * The proxy reads `maintenanceMode` through a short-lived cache. Dropping it here
   * means a merchant who closes the shop sees it closed on their very next request
   * instead of up to ten seconds later; the TTL is what eventually informs any other
   * instance, which cannot be reached from this process.
   */
  maintenanceCache.invalidate();

  return next;
}

/* ------------------------------------------------------------------ */
/* Maintenance flag                                                    */
/* ------------------------------------------------------------------ */

/**
 * The "is the shop closed" flag, cached.
 *
 * `src/proxy.ts` needs this on **every** request that is not an admin route or a static
 * asset. Reading it was free while the store was a file held in memory. Against a
 * database it is a round trip per request, and on a serverless host where instances are
 * short-lived that becomes the most expensive thing the app does per page view — for a
 * boolean that changes a handful of times a year.
 *
 * Ten seconds is long enough that a burst of traffic costs one query, short enough that
 * closing the shop feels immediate. The upper bound on staleness is what matters: a
 * shopper who loads a page within ten seconds of the switch being thrown still sees the
 * shop open. Acceptable for planned maintenance, and the reason the admin guard is
 * deliberately *not* built on a cache.
 */
const maintenanceCache = createTtlCache(
  async () => (await getSettings()).maintenanceMode,
  { ttlMs: 10_000 },
);

/**
 * True when the storefront should be replaced by the maintenance page.
 *
 * Fails **open**. A shop that goes dark because a settings query timed out has turned a
 * degraded dependency into lost revenue; serving the shop with a stale flag is the
 * cheaper mistake by a wide margin.
 */
export async function isStoreOffline(): Promise<boolean> {
  try {
    return await maintenanceCache.get();
  } catch (error) {
    console.error("[settings] could not read the maintenance flag:", error);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Promotion codes                                                     */
/* ------------------------------------------------------------------ */

export async function listPromoCodes(): Promise<PromoCode[]> {
  if (!isDatabaseConfigured()) {
    return (await readStore()).promoCodes;
  }
  const rows = await getDb().select().from(promoCodes);
  return rows.map(toPromoCode);
}

export async function getPromoCode(code: string): Promise<PromoCode | undefined> {
  const normalised = code.trim().toUpperCase();

  if (!isDatabaseConfigured()) {
    return (await readStore()).promoCodes.find((promo) => promo.code === normalised);
  }

  const [row] = await getDb().select().from(promoCodes).where(eq(promoCodes.code, normalised));
  return row ? toPromoCode(row) : undefined;
}

export interface PromoInput {
  code: string;
  description: string;
  percentOff?: number;
  amountOff?: number;
  minSubtotal?: number;
}

/**
 * Validation lives here, not only in the form, so a code can never be persisted in
 * a state the checkout maths cannot handle.
 */
function assertValid(input: PromoInput): void {
  if (!input.code.trim()) throw new Error("A code is required.");

  const hasPercent = typeof input.percentOff === "number" && input.percentOff > 0;
  const hasAmount = typeof input.amountOff === "number" && input.amountOff > 0;

  if (!hasPercent && !hasAmount) {
    throw new Error("Set either a percentage or a fixed amount off.");
  }
  if (hasPercent && hasAmount) {
    throw new Error("Use a percentage or a fixed amount, not both.");
  }
  if (hasPercent && (input.percentOff! > 100 || input.percentOff! < 1)) {
    throw new Error("Percentage off must be between 1 and 100.");
  }
}

export async function createPromoCode(input: PromoInput): Promise<PromoCode> {
  assertValid(input);
  const code = input.code.trim().toUpperCase();

  if (!isDatabaseConfigured()) {
    return mutateStore((store) => {
      if (store.promoCodes.some((promo) => promo.code === code)) {
        throw new Error(`The code ${code} already exists.`);
      }

      const promo: PromoCode = {
        code,
        description: input.description,
        percentOff: input.percentOff || undefined,
        amountOff: input.amountOff || undefined,
        minSubtotal: input.minSubtotal || undefined,
      };

      store.promoCodes.push(promo);
      return promo;
    });
  }

  return getDb().transaction(async (tx) => {
    const [existing] = await tx.select().from(promoCodes).where(eq(promoCodes.code, code));
    if (existing) throw new Error(`The code ${code} already exists.`);

    const promo: PromoCode = {
      code,
      description: input.description,
      percentOff: input.percentOff || undefined,
      amountOff: input.amountOff || undefined,
      minSubtotal: input.minSubtotal || undefined,
    };

    await tx.insert(promoCodes).values(fromPromoCode(promo));
    return promo;
  });
}

export async function updatePromoCode(
  code: string,
  input: PromoInput,
): Promise<PromoCode> {
  assertValid(input);
  const nextCode = input.code.trim().toUpperCase();

  if (!isDatabaseConfigured()) {
    return mutateStore((store) => {
      const promo = store.promoCodes.find((entry) => entry.code === code);
      if (!promo) throw new Error(`Code ${code} not found`);

      if (
        nextCode !== code &&
        store.promoCodes.some((entry) => entry.code === nextCode)
      ) {
        throw new Error(`The code ${nextCode} already exists.`);
      }

      promo.code = nextCode;
      promo.description = input.description;
      promo.percentOff = input.percentOff || undefined;
      promo.amountOff = input.amountOff || undefined;
      promo.minSubtotal = input.minSubtotal || undefined;

      return promo;
    });
  }

  return getDb().transaction(async (tx) => {
    const [current] = await tx.select().from(promoCodes).where(eq(promoCodes.code, code));
    if (!current) throw new Error(`Code ${code} not found`);

    if (nextCode !== code) {
      const [clash] = await tx.select().from(promoCodes).where(eq(promoCodes.code, nextCode));
      if (clash) throw new Error(`The code ${nextCode} already exists.`);
    }

    const next: PromoCode = {
      code: nextCode,
      description: input.description,
      percentOff: input.percentOff || undefined,
      amountOff: input.amountOff || undefined,
      minSubtotal: input.minSubtotal || undefined,
    };

    if (nextCode !== code) {
      // `code` is the primary key: insert the renamed row, then drop the old one.
      await tx.insert(promoCodes).values(fromPromoCode(next));
      await tx.delete(promoCodes).where(eq(promoCodes.code, code));
    } else {
      await tx.update(promoCodes).set(fromPromoCode(next)).where(eq(promoCodes.code, code));
    }

    return next;
  });
}

export async function deletePromoCode(code: string): Promise<void> {
  if (!isDatabaseConfigured()) {
    await mutateStore((store) => {
      store.promoCodes = store.promoCodes.filter((promo) => promo.code !== code);
    });
    return;
  }

  await getDb().delete(promoCodes).where(eq(promoCodes.code, code));
}

/** How many placed orders used each code, so a merchant can judge performance. */
export async function promoUsage(): Promise<
  Record<string, { orders: number; discounted: number }>
> {
  const usage: Record<string, { orders: number; discounted: number }> = {};

  if (!isDatabaseConfigured()) {
    const { orders } = await readStore();
    for (const order of orders) {
      if (!order.promoCode) continue;
      const entry = (usage[order.promoCode] ??= { orders: 0, discounted: 0 });
      entry.orders += 1;
      entry.discounted += order.totals.discount;
    }
    return usage;
  }

  const rows = await getDb()
    .select({ promoCode: ordersTable.promoCode, totals: ordersTable.totals })
    .from(ordersTable);
  for (const row of rows) {
    if (!row.promoCode) continue;
    const entry = (usage[row.promoCode] ??= { orders: 0, discounted: 0 });
    entry.orders += 1;
    entry.discounted += row.totals.discount;
  }
  return usage;
}

/*
 * `listShippingMethods` / `updateShippingMethod` were here. Removed with the table —
 * there is one shipping arrangement, configured through `freeShippingThreshold`,
 * `standardShippingRate` and `deliveryDaysMin`/`Max` on settings.
 */

/* ------------------------------------------------------------------ */
/* Review moderation                                                   */
/* ------------------------------------------------------------------ */

export async function listHiddenReviewIds(): Promise<string[]> {
  if (!isDatabaseConfigured()) {
    return (await readStore()).hiddenReviewIds;
  }

  const rows = await getDb().select({ reviewId: hiddenReviews.reviewId }).from(hiddenReviews);
  return rows.map((row) => row.reviewId);
}

export async function setReviewHidden(id: string, hidden: boolean): Promise<void> {
  if (!isDatabaseConfigured()) {
    await mutateStore((store) => {
      const set = new Set(store.hiddenReviewIds);
      if (hidden) set.add(id);
      else set.delete(id);
      store.hiddenReviewIds = [...set];
    });
    return;
  }

  const db = getDb();
  if (hidden) {
    await db.insert(hiddenReviews).values({ reviewId: id }).onConflictDoNothing();
  } else {
    await db.delete(hiddenReviews).where(eq(hiddenReviews.reviewId, id));
  }
}
