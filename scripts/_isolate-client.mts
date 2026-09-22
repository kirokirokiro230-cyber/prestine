import "./env.ts";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/server/db/schema.ts";
import { getDb } from "../src/server/db/client.ts";

process.on("unhandledRejection", (error) => console.error("UNHANDLED", error));

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing");

async function attempt(label: string, fn: () => Promise<unknown>) {
  const start = Date.now();
  try {
    const result = await fn();
    console.log(`${label}: OK ${Date.now() - start}ms rows=${Array.isArray(result) ? result.length : "?"}`);
  } catch (error) {
    const e = error as Error & { cause?: { code?: string; message?: string } };
    console.log(`${label}: FAILED ${Date.now() - start}ms ${e.message} cause=${e.cause?.code}:${e.cause?.message}`);
  }
}

const options = {
  prepare: false,
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: "require" as const,
};

const raw = postgres(url, options);
await attempt("raw select star", () => raw`select * from public.settings`);
await attempt("raw quoted select", () => raw.unsafe('select "id", "name", "legal_name", "tagline", "description", "url", "email", "phone", "address", "currency", "locale", "free_shipping_threshold", "standard_shipping_rate", "tax_rate", "return_window_days", "delivery_days_min", "delivery_days_max", "review_request_delay_days", "social", "announcements", "marquee_items", "home_new_arrivals_count", "service_promises", "shipping_returns_copy", "maintenance_mode" from "settings"'));

const localDb = drizzle(raw, { schema });
await attempt("local drizzle", () => localDb.select().from(schema.settings));
await raw.end({ timeout: 5 });

await attempt("shared getDb", () => getDb().select().from(schema.settings));

process.exit(0);
