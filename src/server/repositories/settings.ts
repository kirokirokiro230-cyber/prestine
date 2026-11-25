import { createTtlCache } from "@/lib/ttl-cache";
import type { PromoCode, StoreSettings } from "@/lib/types";
import { db, insertInto, unwrap, updateTable, upsertInto } from "../supabase";
import type { PromoCodeRow, SettingsRow } from "../database.types";

/**
 * Store settings, promotion codes and shipping methods.
 *
 * These were compile-time constants in `config.ts`; the store now owns them so a
 * merchant can change a tax rate or launch a discount without a deploy. `config.ts`
 * remains the seed — applied once, by `supabase/migrations/00000000000004_seed.sql`,
 * rather than re-applied on every cold read the way the JSON store's `load()` used to.
 */

function settingsFromRow(row: SettingsRow): StoreSettings {
  return {
    name: row.name,
    legalName: row.legal_name,
    tagline: row.tagline,
    description: row.description,
    url: row.url,
    email: row.email,
    phone: row.phone,
    address: row.address,
    currency: row.currency,
    locale: row.locale,
    freeShippingThreshold: row.free_shipping_threshold,
    standardShippingRate: row.standard_shipping_rate,
    codEnabled: row.cod_enabled,
    codFee: row.cod_fee,
    codMinOrder: row.cod_min_order,
    codMaxOrder: row.cod_max_order,
    // Absent until migration 21 runs. Off, not on, in that case.
    firstOrderDiscountPercent: row.first_order_discount_percent ?? 0,
    taxRate: row.tax_rate,
    returnWindowHours: row.return_window_hours,
    deliveryDaysMin: row.delivery_days_min,
    deliveryDaysMax: row.delivery_days_max,
    reviewRequestDelayDays: row.review_request_delay_days,
    social: {
      instagram: row.social_instagram,
      pinterest: row.social_pinterest,
      youtube: row.social_youtube,
    },
    announcements: row.announcements,
    marqueeItems: row.marquee_items,
    homeNewArrivalsCount: row.home_new_arrivals_count,
    servicePromises: row.service_promises,
    shippingReturnsCopy: row.shipping_returns_copy,
    maintenanceMode: row.maintenance_mode,
  };
}

export async function getSettings(): Promise<StoreSettings> {
  const row = unwrap(
    await db()
      .from("settings")
      .select("*")
      .eq("id", true)
      .single()
      .overrideTypes<unknown, { merge: false }>(),
  ) as SettingsRow;
  return settingsFromRow(row);
}

export async function updateSettings(
  patch: Partial<StoreSettings>,
): Promise<StoreSettings> {
  const rowPatch: Partial<SettingsRow> = {};
  if (patch.name !== undefined) rowPatch.name = patch.name;
  if (patch.legalName !== undefined) rowPatch.legal_name = patch.legalName;
  if (patch.tagline !== undefined) rowPatch.tagline = patch.tagline;
  if (patch.description !== undefined) rowPatch.description = patch.description;
  if (patch.url !== undefined) rowPatch.url = patch.url;
  if (patch.email !== undefined) rowPatch.email = patch.email;
  if (patch.phone !== undefined) rowPatch.phone = patch.phone;
  if (patch.address !== undefined) rowPatch.address = patch.address;
  if (patch.currency !== undefined) rowPatch.currency = patch.currency;
  if (patch.locale !== undefined) rowPatch.locale = patch.locale;
  if (patch.freeShippingThreshold !== undefined) {
    rowPatch.free_shipping_threshold = patch.freeShippingThreshold;
  }
  if (patch.standardShippingRate !== undefined) {
    rowPatch.standard_shipping_rate = patch.standardShippingRate;
  }
  if (patch.codEnabled !== undefined) rowPatch.cod_enabled = patch.codEnabled;
  if (patch.codFee !== undefined) rowPatch.cod_fee = patch.codFee;
  if (patch.codMinOrder !== undefined) rowPatch.cod_min_order = patch.codMinOrder;
  if (patch.codMaxOrder !== undefined) rowPatch.cod_max_order = patch.codMaxOrder;
  if (patch.firstOrderDiscountPercent !== undefined) {
    rowPatch.first_order_discount_percent = patch.firstOrderDiscountPercent;
  }
  if (patch.taxRate !== undefined) rowPatch.tax_rate = patch.taxRate;
  if (patch.returnWindowHours !== undefined) {
    rowPatch.return_window_hours = patch.returnWindowHours;
  }
  if (patch.deliveryDaysMin !== undefined) rowPatch.delivery_days_min = patch.deliveryDaysMin;
  if (patch.deliveryDaysMax !== undefined) rowPatch.delivery_days_max = patch.deliveryDaysMax;
  if (patch.reviewRequestDelayDays !== undefined) {
    rowPatch.review_request_delay_days = patch.reviewRequestDelayDays;
  }
  // Nested `social` needs an explicit per-key merge, or a partial update to one
  // network would null out the other two — the same reasoning the JSON store's
  // updateSettings() documented for its own spread.
  if (patch.social !== undefined) {
    const current = await getSettings();
    if (patch.social.instagram !== undefined) {
      rowPatch.social_instagram = patch.social.instagram;
    } else {
      rowPatch.social_instagram = current.social.instagram;
    }
    if (patch.social.pinterest !== undefined) {
      rowPatch.social_pinterest = patch.social.pinterest;
    } else {
      rowPatch.social_pinterest = current.social.pinterest;
    }
    if (patch.social.youtube !== undefined) {
      rowPatch.social_youtube = patch.social.youtube;
    } else {
      rowPatch.social_youtube = current.social.youtube;
    }
  }
  if (patch.announcements !== undefined) rowPatch.announcements = patch.announcements;
  if (patch.marqueeItems !== undefined) rowPatch.marquee_items = patch.marqueeItems;
  if (patch.homeNewArrivalsCount !== undefined) {
    rowPatch.home_new_arrivals_count = patch.homeNewArrivalsCount;
  }
  if (patch.servicePromises !== undefined) rowPatch.service_promises = patch.servicePromises;
  if (patch.shippingReturnsCopy !== undefined) {
    rowPatch.shipping_returns_copy = patch.shippingReturnsCopy;
  }
  if (patch.maintenanceMode !== undefined) rowPatch.maintenance_mode = patch.maintenanceMode;

  const save = (values: Partial<SettingsRow>) =>
    updateTable(db(), "settings", values)
      .eq("id", true)
      .select("*")
      .single()
      .overrideTypes<unknown, { merge: false }>();

  let result = await save(rowPatch);

  /*
   * Before migration 21 the settings table has no first-order column, and every save from
   * the settings form includes it. Without this, saving ANY setting (a tax rate, the shop
   * name) would fail until a migration the merchant may not know about had been run. So a
   * save that fails on that one column is retried without it: everything else still saves,
   * and the discount simply stays off, which is what the missing column already means.
   */
  if (result.error && /first_order_discount_percent/.test(result.error.message)) {
    const { first_order_discount_percent: _skipped, ...withoutIt } = rowPatch;
    void _skipped;
    result = await save(withoutIt);
  }

  const row = unwrap(result) as SettingsRow;

  /*
   * The proxy reads `maintenanceMode` through a short-lived cache. Dropping it here
   * means a merchant who closes the shop sees it closed on their very next request
   * instead of up to ten seconds later; the TTL is what eventually informs any other
   * instance, which cannot be reached from this process.
   */
  maintenanceCache.invalidate();

  return settingsFromRow(row);
}

/* ------------------------------------------------------------------ */
/* Maintenance flag                                                    */
/* ------------------------------------------------------------------ */

/**
 * The "is the shop closed" flag, cached.
 *
 * `src/proxy.ts` needs this on **every** request that is not an admin route or a static
 * asset. A Postgres round trip on every storefront request for a boolean that changes a
 * handful of times a year is the exact cost this cache existed to avoid even under the
 * JSON store, and it matters more now, not less — a network round trip to Supabase costs
 * more than an in-memory JSON parse did.
 *
 * Ten seconds is long enough that a burst of traffic costs one read, short enough that
 * closing the shop feels immediate.
 */
const maintenanceCache = createTtlCache(
  async () => (await getSettings()).maintenanceMode,
  { ttlMs: 10_000 },
);

/**
 * True when the storefront should be replaced by the maintenance page.
 *
 * Fails **open**. A shop that goes dark because a settings read failed has turned a
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

function promoFromRow(row: PromoCodeRow): PromoCode {
  return {
    code: row.code,
    percentOff: row.percent_off ?? undefined,
    amountOff: row.amount_off ?? undefined,
    minSubtotal: row.min_subtotal ?? undefined,
    description: row.description,
  };
}

export async function listPromoCodes(): Promise<PromoCode[]> {
  const rows = unwrap(
    await db().from("promo_codes").select("*").overrideTypes<PromoCodeRow[], { merge: false }>(),
  );
  return rows.map(promoFromRow);
}

export async function getPromoCode(code: string): Promise<PromoCode | undefined> {
  const normalised = code.trim().toUpperCase();
  const row = unwrap(
    await db()
      .from("promo_codes")
      .select("*")
      .eq("code", normalised)
      .maybeSingle()
      .overrideTypes<PromoCodeRow, { merge: false }>(),
  );
  return row ? promoFromRow(row) : undefined;
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

  const existing = await getPromoCode(code);
  if (existing) throw new Error(`The code ${code} already exists.`);

  const row = unwrap(
    await insertInto(db(), "promo_codes", {
      code,
      description: input.description,
      percent_off: input.percentOff || null,
      amount_off: input.amountOff || null,
      min_subtotal: input.minSubtotal || null,
    })
      .select("*")
      .single()
      .overrideTypes<unknown, { merge: false }>(),
  ) as PromoCodeRow;

  return promoFromRow(row);
}

export async function updatePromoCode(
  code: string,
  input: PromoInput,
): Promise<PromoCode> {
  assertValid(input);
  const nextCode = input.code.trim().toUpperCase();

  const existing = await getPromoCode(code);
  if (!existing) throw new Error(`Code ${code} not found`);

  if (nextCode !== code) {
    const collision = await getPromoCode(nextCode);
    if (collision) throw new Error(`The code ${nextCode} already exists.`);
  }

  // The code is the primary key, so renaming it means deleting the old row
  // and inserting the new one rather than an update — Postgres has no
  // "rename this primary key value" short of `on update cascade`, and
  // nothing else references promo_codes.code by foreign key except
  // orders.promo_code, which is `on delete set null` (see
  // supabase/migrations/00000000000001_schema.sql) precisely so a promo
  // rename or removal never blocks on historical orders that used it.
  if (nextCode !== code) {
    const { error: deleteError } = await db().from("promo_codes").delete().eq("code", code);
    if (deleteError) throw new Error(deleteError.message);

    const row = unwrap(
      await insertInto(db(), "promo_codes", {
        code: nextCode,
        description: input.description,
        percent_off: input.percentOff || null,
        amount_off: input.amountOff || null,
        min_subtotal: input.minSubtotal || null,
      })
        .select("*")
        .single()
        .overrideTypes<unknown, { merge: false }>(),
    ) as PromoCodeRow;

    return promoFromRow(row);
  }

  const row = unwrap(
    await updateTable(db(), "promo_codes", {
      description: input.description,
      percent_off: input.percentOff || null,
      amount_off: input.amountOff || null,
      min_subtotal: input.minSubtotal || null,
    })
      .eq("code", code)
      .select("*")
      .single()
      .overrideTypes<unknown, { merge: false }>(),
  ) as PromoCodeRow;

  return promoFromRow(row);
}

export async function deletePromoCode(code: string): Promise<void> {
  const { error } = await db().from("promo_codes").delete().eq("code", code);
  if (error) throw new Error(error.message);
}

/** How many placed orders used each code, so a merchant can judge performance. */
export async function promoUsage(): Promise<
  Record<string, { orders: number; discounted: number }>
> {
  const rows = unwrap(
    await db()
      .from("orders")
      .select("promo_code, discount")
      .not("promo_code", "is", null)
      .overrideTypes<Array<{ promo_code: string; discount: number }>, { merge: false }>(),
  );

  const usage: Record<string, { orders: number; discounted: number }> = {};
  for (const row of rows) {
    const entry = (usage[row.promo_code] ??= { orders: 0, discounted: 0 });
    entry.orders += 1;
    entry.discounted += row.discount;
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
  const rows = unwrap(
    await db()
      .from("hidden_reviews")
      .select("review_id")
      .overrideTypes<Array<{ review_id: string }>, { merge: false }>(),
  );
  return rows.map((row) => row.review_id);
}

export async function setReviewHidden(id: string, hidden: boolean): Promise<void> {
  if (hidden) {
    // Idempotent: hiding an already-hidden review is a no-op, not an error —
    // the primary key on hidden_reviews.review_id would otherwise reject a
    // second click on "Hide" with a raw unique-violation.
    const { error } = await upsertInto(db(), "hidden_reviews", { review_id: id }, {
      onConflict: "review_id",
    });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await db().from("hidden_reviews").delete().eq("review_id", id);
    if (error) throw new Error(error.message);
  }
}
