import { randomUUID } from "node:crypto";
import {
  normaliseProductIds,
  normaliseShownOn,
  validateLook,
  type StyleLook,
  type StyleLookInput,
} from "@/lib/style-looks";
import { db, insertInto, unwrap, updateTable, upsertInto } from "../supabase";
import type { StyleLookProductRow, StyleLookRow } from "../database.types";

/**
 * Style hints: styling photographs and the products worn in them.
 *
 * Two reads, deliberately separate, as with banners: `listLooks` returns everything for
 * the admin table, `listLooksForProduct` returns only what a shopper should see on one
 * product page. Keeping "published, and contains this product" in one place means no page
 * can forget it.
 */

function assemble(rows: StyleLookRow[], links: StyleLookProductRow[]): StyleLook[] {
  const byLook = new Map<string, StyleLookProductRow[]>();
  for (const link of links) {
    const list = byLook.get(link.look_id) ?? [];
    list.push(link);
    byLook.set(link.look_id, list);
  }

  return rows.map((row) => {
    const ordered = (byLook.get(row.id) ?? []).sort((a, b) => a.position - b.position);

    return {
      id: row.id,
      title: row.title,
      imageUrl: row.image_url,
      active: row.active,
      position: row.position,
      productIds: ordered.map((link) => link.product_id),
      shownOn: ordered.filter((link) => link.shown).map((link) => link.product_id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

async function linksFor(lookIds: string[]): Promise<StyleLookProductRow[]> {
  if (lookIds.length === 0) return [];

  return unwrap(
    await db()
      .from("style_look_products")
      .select("*")
      .in("look_id", lookIds)
      .order("position", { ascending: true })
      .overrideTypes<StyleLookProductRow[], { merge: false }>(),
  );
}

/** Every look, published or not, for the admin list. */
export async function listLooks(): Promise<StyleLook[]> {
  const rows = unwrap(
    await db()
      .from("style_looks")
      .select("*")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
      .overrideTypes<StyleLookRow[], { merge: false }>(),
  );

  return assemble(rows, await linksFor(rows.map((row) => row.id)));
}

/**
 * The published looks that appear on one product's page, in display order.
 *
 * "Appear on" is the `shown` flag, not mere membership: a product can be worn in a photo
 * without that photo being on its page. Each look still carries ALL of its products — the
 * point of the "pieces in this look" view is to show the rest of the outfit.
 */
export async function listLooksForProduct(productId: string): Promise<StyleLook[]> {
  const mine = unwrap(
    await db()
      .from("style_look_products")
      .select("look_id")
      .eq("product_id", productId)
      .eq("shown", true)
      .overrideTypes<Array<Pick<StyleLookProductRow, "look_id">>, { merge: false }>(),
  );
  if (mine.length === 0) return [];

  const rows = unwrap(
    await db()
      .from("style_looks")
      .select("*")
      .in("id", mine.map((link) => link.look_id))
      .eq("active", true)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
      .overrideTypes<StyleLookRow[], { merge: false }>(),
  );

  return assemble(rows, await linksFor(rows.map((row) => row.id)));
}

/**
 * Throw a readable error if any product id does not exist.
 *
 * The foreign key would refuse it anyway, but with a database message the merchant cannot
 * act on. Checked up front so the answer is "one of those products was deleted".
 */
async function assertProductsExist(productIds: string[]): Promise<void> {
  const found = unwrap(
    await db()
      .from("products")
      .select("id")
      .in("id", productIds)
      .overrideTypes<Array<{ id: string }>, { merge: false }>(),
  );

  if (found.length !== productIds.length) {
    throw new Error("One of the selected products no longer exists. Reload and try again.");
  }
}

function prepare(input: StyleLookInput): StyleLookInput {
  const productIds = normaliseProductIds(input.productIds);

  const prepared: StyleLookInput = {
    ...input,
    title: input.title.trim(),
    imageUrl: input.imageUrl.trim(),
    productIds,
    // Cleaned against the final product list, so unticking a product also drops it from
    // the pages the photo appears on.
    shownOn: normaliseShownOn(productIds, input.shownOn),
  };

  const problem = validateLook(prepared);
  if (problem) throw new Error(problem);

  return prepared;
}

export async function createLook(raw: StyleLookInput): Promise<StyleLook> {
  const input = prepare(raw);
  await assertProductsExist(input.productIds);

  const existing = unwrap(
    await db()
      .from("style_looks")
      .select("position")
      .overrideTypes<Array<Pick<StyleLookRow, "position">>, { merge: false }>(),
  );
  const highest = existing.reduce((max, row) => Math.max(max, row.position), -1);

  const id = `look_${randomUUID().slice(0, 8)}`;

  unwrap(
    await insertInto(db(), "style_looks", {
      id,
      title: input.title,
      image_url: input.imageUrl,
      active: input.active,
      // Last, so adding a look never reorders the ones already showing.
      position: highest + 1,
    }).overrideTypes<unknown, { merge: false }>(),
  );

  const shown = new Set(input.shownOn);

  const { error } = await insertInto(
    db(),
    "style_look_products",
    input.productIds.map((productId, position) => ({
      look_id: id,
      product_id: productId,
      position,
      shown: shown.has(productId),
    })),
  );

  if (error) {
    // A look with no products is invisible rather than harmful, but it would sit in the
    // admin list looking like it worked. Remove it so a failed save leaves nothing behind.
    await db().from("style_looks").delete().eq("id", id);
    throw new Error(error.message);
  }

  const [created] = (await listLooks()).filter((look) => look.id === id);
  if (!created) throw new Error("The look was saved but could not be read back.");
  return created;
}

export async function updateLook(id: string, raw: StyleLookInput): Promise<StyleLook> {
  const input = prepare(raw);
  await assertProductsExist(input.productIds);

  const { error: rowError } = await updateTable(db(), "style_looks", {
    title: input.title,
    image_url: input.imageUrl,
    active: input.active,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (rowError) throw new Error(rowError.message);

  /*
   * Add and re-order first, remove last.
   *
   * Replacing the set by deleting everything and re-inserting would leave the look with NO
   * products if the insert then failed, which on a published look empties it on the live
   * site. Upserting the wanted rows first means a failure part-way leaves the look with at
   * least the old set plus some of the new, never fewer than it had.
   */
  const shown = new Set(input.shownOn);

  const { error: upsertError } = await upsertInto(
    db(),
    "style_look_products",
    input.productIds.map((productId, position) => ({
      look_id: id,
      product_id: productId,
      position,
      shown: shown.has(productId),
    })),
    { onConflict: "look_id,product_id" },
  );
  if (upsertError) throw new Error(upsertError.message);

  const current = await linksFor([id]);
  const wanted = new Set(input.productIds);
  const removed = current
    .map((link) => link.product_id)
    .filter((productId) => !wanted.has(productId));

  if (removed.length > 0) {
    const { error: deleteError } = await db()
      .from("style_look_products")
      .delete()
      .eq("look_id", id)
      .in("product_id", removed);
    if (deleteError) throw new Error(deleteError.message);
  }

  const [updated] = (await listLooks()).filter((look) => look.id === id);
  if (!updated) throw new Error(`Look ${id} not found`);
  return updated;
}

export async function deleteLook(id: string): Promise<void> {
  // The links go with it: style_look_products cascades from style_looks.
  const { error } = await db().from("style_looks").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setLookActive(id: string, active: boolean): Promise<void> {
  const { error } = await updateTable(db(), "style_looks", {
    active,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Nudge a look one place up or down.
 *
 * A pair swap, as with banners: two arrow buttons are keyboard accessible for free and
 * need no drag-and-drop. Positions need not be contiguous, so this works after a delete
 * has left a gap.
 */
export async function moveLook(
  id: string,
  direction: "up" | "down",
  /**
   * Order within one product's own list instead of the global one. Without it, swapping
   * with the neighbour in the GLOBAL list can pair a look with one that is not on this
   * product's page at all, and the arrow appears to do nothing.
   */
  withinProductId?: string,
): Promise<void> {
  const all = await listLooks();
  const ordered = withinProductId
    ? all.filter((look) => look.shownOn.includes(withinProductId))
    : all;
  const index = ordered.findIndex((look) => look.id === id);
  if (index === -1) return;

  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= ordered.length) return;

  const a = ordered[index];
  const b = ordered[target];

  await Promise.all([
    updateTable(db(), "style_looks", { position: b.position }).eq("id", a.id),
    updateTable(db(), "style_looks", { position: a.position }).eq("id", b.id),
  ]);
}
