import "./env";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { seed } from "../src/server/store";
import {
  fromBanner,
  fromCategory,
  fromCollection,
  fromEmailTemplate,
  fromOrder,
  fromProduct,
  fromPromoCode,
  fromSettings,
} from "../src/server/db/mappers";
import * as schema from "../src/server/db/schema";

/**
 * Populate an empty database.
 *
 * On a host with a writable disk the JSON store seeded itself on first read. Nothing can
 * do that on Netlify — the filesystem is read-only — so a fresh deployment reaches a
 * database with sixteen empty tables and a storefront with nothing to sell. This script
 * is the replacement for that first read, and it is a deploy step, not a runtime path.
 *
 * ## Usage
 *
 *   npm run db:seed              insert anything missing, leave existing rows alone
 *   npm run db:seed -- --reset   delete everything first
 *   npm run db:seed -- --demo    also insert the sample orders
 *
 * ## Three decisions worth knowing about
 *
 * **The seed data is `seed()` from the JSON store, not a copy of it.** Reusing it means
 * the two cannot drift: a product added to `src/lib/data/products.ts` appears in both, and
 * the admin-panel defaults (`sku`, `costPrice`, `weightGrams`) are computed by the same
 * code in both. A second hand-maintained catalogue in this file would be wrong within a
 * week.
 *
 * **No administrator is created.** It is tempting to insert an owner with a known password
 * so a deploy is immediately usable. That password would then exist in the repository, in
 * the shell history of whoever ran this, and in the deploy log — and it would still be
 * valid a year later because nobody changes a seeded credential. Instead the `admins`
 * table is left empty, which is exactly the condition `needsFirstAdmin()` checks, so
 * `/admin/setup` unlocks and the first owner sets their own password once.
 *
 * **Sample orders are opt-in.** The JSON store always seeded them, because a dashboard
 * with no data looks broken locally. On a real shop they are fabricated revenue in the
 * merchant's reporting, so they need `--demo`.
 *
 * The connection is this script's own, on `DIRECT_URL` where available. Bulk inserts want
 * a real session rather than the transaction pooler the application uses, and a one-shot
 * process should not adopt the app's single-socket pool settings.
 */

const args = new Set(process.argv.slice(2));
const RESET = args.has("--reset");
const DEMO = args.has("--demo");

for (const arg of args) {
  if (!["--reset", "--demo"].includes(arg)) {
    console.error(`Unknown option: ${arg}\nUsage: npm run db:seed -- [--reset] [--demo]`);
    process.exit(2);
  }
}

/**
 * Prefer the direct connection.
 *
 * Falls back to `DATABASE_URL` so the script still works when only the pooler is
 * configured — it will simply be slower, and a very large catalogue could exceed the
 * pooler's statement timeout, which is why direct is preferred rather than merely allowed.
 */
function connectionString(): string {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "Neither DIRECT_URL nor DATABASE_URL is set. Copy .env.example to .env.local and " +
        "fill in the Supabase connection strings.",
    );
    process.exit(2);
  }
  return url;
}

/**
 * Insert in batches.
 *
 * Postgres accepts at most 65535 bind parameters per statement. A thirty-product
 * catalogue is nowhere near that, but a merchant with two thousand products would be, and
 * the failure mode is an opaque protocol error rather than anything that names the cause.
 */
async function insertAll<T>(
  label: string,
  rows: T[],
  write: (batch: T[]) => Promise<unknown>,
): Promise<void> {
  if (rows.length === 0) {
    console.log(`  ${label}: nothing to insert`);
    return;
  }

  const BATCH = 500;
  for (let index = 0; index < rows.length; index += BATCH) {
    await write(rows.slice(index, index + BATCH));
  }
  console.log(`  ${label}: ${rows.length}`);
}

async function main(): Promise<void> {
  const sql = postgres(connectionString(), { max: 1, ssl: "require", prepare: false });
  const db = drizzle(sql, { schema });
  const data = seed();

  try {
    if (RESET) {
      console.log("Clearing existing data…");
      /*
       * Child tables first. The cascades would handle most of this, but relying on them
       * means the order of deletes silently decides whether anything survives — and
       * `settings` and `hidden_reviews` have no parent to cascade from at all.
       */
      await db.delete(schema.orderLines);
      await db.delete(schema.orders);
      await db.delete(schema.productCollections);
      await db.delete(schema.productSizes);
      await db.delete(schema.productColors);
      await db.delete(schema.products);
      await db.delete(schema.collections);
      await db.delete(schema.categories);
      await db.delete(schema.banners);
      await db.delete(schema.promoCodes);
      await db.delete(schema.hiddenReviews);
      await db.delete(schema.submittedReviews);
      await db.delete(schema.auditLog);
      await db.delete(schema.loginAttempts);
      await db.delete(schema.emailLog);
      await db.delete(schema.emailTemplates);
      await db.delete(schema.settings);
      // Deliberately not `admins`. Wiping the catalogue is a recoverable mistake;
      // deleting the only account that can sign in to fix it is not.
      console.log("  (staff accounts left untouched)");
    }

    console.log("Seeding…");

    /*
     * `onConflictDoNothing` throughout, so a re-run tops up what is missing instead of
     * overwriting a merchant's edits. Anyone who wants the seed values back asks for
     * `--reset` explicitly.
     */
    await insertAll("categories", data.categories.map((c, i) => fromCategory(c, i)), (batch) =>
      db.insert(schema.categories).values(batch).onConflictDoNothing(),
    );

    await insertAll(
      "collections",
      data.collections.map((c, i) => fromCollection(c, i)),
      (batch) => db.insert(schema.collections).values(batch).onConflictDoNothing(),
    );

    const productRows = data.products.map(fromProduct);

    await insertAll("products", productRows.map((rows) => rows.product), (batch) =>
      db.insert(schema.products).values(batch).onConflictDoNothing(),
    );
    await insertAll("colourways", productRows.flatMap((rows) => rows.colors), (batch) =>
      db.insert(schema.productColors).values(batch).onConflictDoNothing(),
    );
    await insertAll("sizes", productRows.flatMap((rows) => rows.sizes), (batch) =>
      db.insert(schema.productSizes).values(batch).onConflictDoNothing(),
    );
    await insertAll(
      "collection memberships",
      productRows.flatMap((rows) => rows.memberships),
      (batch) => db.insert(schema.productCollections).values(batch).onConflictDoNothing(),
    );

    await insertAll("banners", data.banners.map(fromBanner), (batch) =>
      db.insert(schema.banners).values(batch).onConflictDoNothing(),
    );
    await insertAll("promotion codes", data.promoCodes.map(fromPromoCode), (batch) =>
      db.insert(schema.promoCodes).values(batch).onConflictDoNothing(),
    );
    await insertAll("settings", [fromSettings(data.settings)], (batch) =>
      db.insert(schema.settings).values(batch).onConflictDoNothing(),
    );
    await insertAll(
      "email templates",
      data.emailTemplates.map(fromEmailTemplate),
      (batch) => db.insert(schema.emailTemplates).values(batch).onConflictDoNothing(),
    );

    if (DEMO) {
      const orderRows = data.orders.map(fromOrder);
      await insertAll("sample orders", orderRows.map((rows) => rows.order), (batch) =>
        db.insert(schema.orders).values(batch).onConflictDoNothing(),
      );
      await insertAll("sample order lines", orderRows.flatMap((rows) => rows.lines), (batch) =>
        db.insert(schema.orderLines).values(batch).onConflictDoNothing(),
      );
    } else {
      console.log("  sample orders: skipped (pass --demo to include them)");
    }

    const [{ count: adminCount }] = await sql<{ count: number }[]>`
      select count(*)::int as count from admins
    `;

    console.log("\nDone.");
    if (adminCount === 0) {
      console.log(
        "No staff accounts exist yet. Open /admin/setup to create the first owner —\n" +
          "that screen locks itself as soon as one account exists.",
      );
    } else {
      console.log(`${adminCount} staff account${adminCount === 1 ? "" : "s"} already exist.`);
    }
  } finally {
    // Without this the process hangs on an open socket rather than exiting.
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error("\nSeeding failed:", error instanceof Error ? error.message : error);
  /*
   * A non-zero exit is what stops a deploy pipeline continuing to a build that would
   * serve an empty shop.
   */
  process.exit(1);
});
